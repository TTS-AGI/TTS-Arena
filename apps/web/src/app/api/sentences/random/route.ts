/**
 * GET /api/sentences/random — a random unconsumed dataset prompt.
 * 404 when the pool is exhausted.
 */
import { NextResponse } from "next/server";
import type { RandomSentenceResponse } from "@ttsa/shared";
import { randomUnconsumed } from "@/server/arena/sentences";

export async function GET() {
  const sentence = await randomUnconsumed();
  if (!sentence) {
    return NextResponse.json(
      { error: "no unconsumed sentences available" },
      { status: 404 },
    );
  }
  const body: RandomSentenceResponse = { sentence };
  return NextResponse.json(body);
}
