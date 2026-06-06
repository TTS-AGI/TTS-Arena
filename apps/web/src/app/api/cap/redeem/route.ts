/** POST /api/cap/redeem — redeem a solved challenge for a verification token. */
import { NextResponse, type NextRequest } from "next/server";
import { redeemCapChallenge } from "@/server/security/cap";
import { withErrorLogging } from "@/server/observability/errors";

export const POST = withErrorLogging(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as {
    token?: string;
    solutions?: unknown;
  } | null;
  if (!body?.token || body.solutions === undefined) {
    return NextResponse.json(
      { success: false, message: "invalid request" },
      { status: 400 },
    );
  }
  const result = await redeemCapChallenge({
    token: body.token,
    solutions: body.solutions,
  });
  return NextResponse.json(result);
});
