/** POST /api/cap/challenge — issue a Cap.js proof-of-work challenge. */
import { NextResponse } from "next/server";
import { createCapChallenge } from "@/server/security/cap";
import { withErrorLogging } from "@/server/observability/errors";

export const POST = withErrorLogging(async (req: Request) => {
  void req;
  const challenge = await createCapChallenge();
  return NextResponse.json(challenge);
});
