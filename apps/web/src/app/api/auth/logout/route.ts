/**
 * POST /api/auth/logout — clear the session cookie.
 */
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { destroySession } from "@/server/auth/session";

export async function POST(req: NextRequest) {
  await destroySession();
  if (req.headers.get("accept")?.includes("text/html")) {
    return NextResponse.redirect(serverEnv.appUrl);
  }
  return NextResponse.json({ ok: true });
}
