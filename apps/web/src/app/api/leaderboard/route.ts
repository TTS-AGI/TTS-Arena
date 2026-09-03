/**
 * GET /api/leaderboard?type=tts — the ranked board for a model type.
 */
import { NextResponse } from "next/server";
import type { LeaderboardResponse, ModelType } from "@ttsa/shared";
import { getLeaderboard } from "@/server/arena/leaderboard";

/**
 * The board is identical for every visitor and moves slowly — a vote shifts a
 * rating by a fraction of a point, and the BT fit only refits every 50 votes.
 * So let the browser serve its copy immediately and revalidate behind the
 * scenes: a return visit paints from cache instead of waiting on a round trip.
 */
const CACHE_CONTROL = "public, max-age=15, stale-while-revalidate=300";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const type = (params.get("type") ?? "tts") as ModelType;
  if (type !== "tts" && type !== "conversational") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  // ?preliminary=1 lowers the vote floor so newly-added models are visible.
  const includePreliminary = params.get("preliminary") === "1";
  const rows = await getLeaderboard(type, includePreliminary);
  const body: LeaderboardResponse = { rows };
  return NextResponse.json(body, {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
