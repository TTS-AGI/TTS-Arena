/**
 * GET /api/leaderboard?type=tts — the ranked board for a model type.
 */
import { NextResponse } from "next/server";
import type { LeaderboardResponse, ModelType } from "@ttsa/shared";
import { getLeaderboard } from "@/server/arena/leaderboard";

export async function GET(req: Request) {
  const type = (new URL(req.url).searchParams.get("type") ??
    "tts") as ModelType;
  if (type !== "tts" && type !== "conversational") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  const rows = await getLeaderboard(type);
  const body: LeaderboardResponse = { rows };
  return NextResponse.json(body);
}
