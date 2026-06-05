/**
 * GET /api/sentences/stats — pool consumption stats.
 */
import { NextResponse } from "next/server";
import type { SentenceStats } from "@ttsa/shared";
import { sentenceStats } from "@/server/arena/sentences";

export async function GET() {
  const stats: SentenceStats = await sentenceStats();
  return NextResponse.json(stats);
}
