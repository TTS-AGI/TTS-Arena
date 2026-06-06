/** POST /api/cap/challenge — issue a Cap.js proof-of-work challenge. */
import { NextResponse } from "next/server";
import { createCapChallenge } from "@/server/security/cap";

export async function POST() {
  const challenge = await createCapChallenge();
  return NextResponse.json(challenge);
}
