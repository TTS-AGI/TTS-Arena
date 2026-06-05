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

  try {
    // recordVote marks the session voted + applies ratings in one transaction.
    const result = await recordVote(session, chosen);

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
      console.error("[tts/vote] session cleanup failed (non-fatal)", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return NextResponse.json(body);
  } catch (err) {
    console.error("[tts/vote] failed", {
      sessionId: session.id,
      userId: user.id,
      chosen,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
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
