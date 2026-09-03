/**
 * POST /api/tts/vote — record a binary vote and reveal both models.
 *
 * Login required and the session must belong to the caller. This is the first
 * point at which model identities are returned to the client. One vote per
 * session (re-votes are rejected).
 */
import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { voteRequestSchema, type VoteResponse } from "@ttsa/shared";
import { currentUser } from "@/server/auth/user";
import { getSession, deleteSession } from "@/server/arena/session-store";
import { recordVote } from "@/server/arena/vote";
import { assessVote, SECURITY } from "@/server/arena/security";
import { latestFingerprint } from "@/server/auth/logins";
import { clientIp } from "@/server/request-info";
import { verifyHcaptcha } from "@/server/security/hcaptcha";
import { grantClearance, hasClearance } from "@/server/security/clearance";
import { errInfo, logErrorEvent } from "@/server/observability/errors";
import { db } from "@/server/db/client";
import { models } from "@/server/db/schema";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }

  const parsed = voteRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { sessionId, chosen } = parsed.data;

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session expired" }, { status: 410 });
  }
  if (session.userId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (session.voted) {
    return NextResponse.json(
      { error: "already voted on this session" },
      { status: 409 },
    );
  }

  // Captcha gate: solve once per browser, then ride the signed clearance for
  // its lifetime. If a solve is needed and none arrives, ask the client to do
  // one and retry — not a hard error (no tip-off, low friction).
  //
  // Clearance is checked BEFORE the token is verified, so a browser that keeps
  // resending its now-spent token doesn't cost a siteverify round trip on every
  // vote. hCaptcha tokens are single-use; only the first one ever validates.
  const cleared = SECURITY.disabled() || (await hasClearance(user.id));
  let captchaRequired = false;
  if (!cleared) {
    captchaRequired = true;
    if (!(await verifyHcaptcha(req.headers.get("x-cap-token")))) {
      return NextResponse.json({ needsCaptcha: true });
    }
    await grantClearance(user.id);
  }

  try {
    const durationSeconds = (Date.now() - session.createdAt) / 1000;
    const fingerprint = await latestFingerprint(user.id);
    const assessment = await assessVote({
      user,
      req,
      durationSeconds,
      fingerprint,
      captchaRequired,
      // We never get here on a failed solve — the request returns above — so
      // this is always true. Passed through anyway so assessVote keeps a
      // truthful view of the request rather than an assumed one.
      captchaOk: true,
    });

    // recordVote marks the session voted + applies ratings (only if the
    // assessment says the vote counts) in one transaction.
    const result = await recordVote(session, chosen, assessment, {
      ip: clientIp(req),
      fingerprint,
    });

    // Reveal display metadata from the DB (current name/url/open for each id)
    // BEFORE deleting the session, so a delete failure can't lose the result.
    const rows = await db
      .select()
      .from(models)
      .where(
        inArray(models.id, [result.chosenModelId, result.rejectedModelId]),
      );
    const byId = new Map(rows.map((m) => [m.id, m]));
    const reveal = (id: string) => {
      const m = byId.get(id);
      return {
        id,
        name: m?.name ?? id,
        open: m?.isOpen ?? false,
        url: m?.url ?? "",
      };
    };

    const body: VoteResponse = {
      chosen: reveal(result.chosenModelId),
      rejected: reveal(result.rejectedModelId),
      counted: result.counted,
    };

    // Clean up the session + cached audio. Best-effort: the vote is already
    // recorded, so a cleanup failure must NOT fail the request (the periodic
    // sweep will reclaim it). This was silently 500ing votes.
    deleteSession(session.id).catch((err) => {
      const info = errInfo(err);
      console.error("[tts/vote] session cleanup failed (non-fatal)", {
        sessionId: session.id,
        error: info.message,
      });
      void logErrorEvent({
        source: "tts_vote",
        severity: "warn",
        message: `session cleanup failed: ${info.message}`,
        stack: info.stack,
        route: "/api/tts/vote",
        method: "POST",
        userId: user.id,
        detail: { sessionId: session.id },
      });
    });

    return NextResponse.json(body);
  } catch (err) {
    const info = errInfo(err);
    console.error("[tts/vote] failed", {
      sessionId: session.id,
      userId: user.id,
      chosen,
      error: info.stack ?? info.message,
    });
    void logErrorEvent({
      source: "tts_vote",
      message: info.message,
      stack: info.stack,
      route: "/api/tts/vote",
      method: "POST",
      userId: user.id,
      detail: { sessionId: session.id, chosen },
    });
    return NextResponse.json(
      {
        error: "failed to record vote",
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  }
}
