/**
 * POST /api/tts/vote — record a binary vote and reveal both models.
 *
 * Login required and the session must belong to the caller. This is the first
 * point at which model identities are returned to the client. One vote per
 * session (re-votes are rejected).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { inArray } from "drizzle-orm";
import { voteRequestSchema, type VoteResponse } from "@ttsa/shared";
import { currentUser } from "@/server/auth/user";
import { cookieSecurity } from "@/server/auth/session";
import { getSession, deleteSession } from "@/server/arena/session-store";
import { recordVote } from "@/server/arena/vote";
import { assessVote, SECURITY } from "@/server/arena/security";
import { latestFingerprint } from "@/server/auth/logins";
import { verifyCapToken } from "@/server/security/cap";
import { errInfo, logErrorEvent } from "@/server/observability/errors";
import { db } from "@/server/db/client";
import { models } from "@/server/db/schema";

/** Cookie marking "captcha solved this session" + its lifetime. */
const CAP_COOKIE = "ttsa_cap";
const CAP_TTL_SECONDS = 60 * 60 * 6; // 6h

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

  // Captcha gate: solve once per browser session, then risk-triggered. We track
  // "solved this session" with a short-lived signed-ish cookie set when a valid
  // Cap token is presented. If a captcha is required but none/invalid is
  // supplied, ask the client to solve one and retry — not a hard error (no
  // tip-off, low friction).
  const cookieStore = await cookies();
  const capToken = req.headers.get("x-cap-token");
  const captchaOk = await verifyCapToken(capToken);
  const alreadySolvedThisSession = cookieStore.get(CAP_COOKIE)?.value === "1";

  let captchaRequired = false;
  if (!SECURITY.disabled() && !captchaOk && !alreadySolvedThisSession) {
    captchaRequired = true;
    return NextResponse.json({ needsCaptcha: true });
  }
  // A freshly validated token marks the session as captcha-cleared.
  if (captchaOk && !alreadySolvedThisSession) {
    cookieStore.set(CAP_COOKIE, "1", {
      httpOnly: true,
      sameSite: cookieSecurity().sameSite,
      secure: cookieSecurity().secure,
      path: "/",
      maxAge: CAP_TTL_SECONDS,
    });
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
      captchaOk,
    });

    // recordVote marks the session voted + applies ratings (only if the
    // assessment says the vote counts) in one transaction.
    const result = await recordVote(session, chosen, assessment);

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
