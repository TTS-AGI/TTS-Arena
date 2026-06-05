/**
 * POST /api/auth/logout — clear the session cookie.
 */
import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
