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
import {
  getSession,
  markVoted,
  deleteSession,
} from "@/server/arena/session-store";
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

  await markVoted(session.id);
  const result = await recordVote(session, chosen);
  await deleteSession(session.id); // audio no longer needed once revealed

  // Reveal display metadata from the DB (current name/url/open for each id).
  const rows = await db
    .select()
    .from(models)
    .where(inArray(models.id, [result.chosenModelId, result.rejectedModelId]));
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
  return NextResponse.json(body);
}
