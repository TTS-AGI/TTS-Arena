/**
 * GET /api/auth/me — the current user, or { user: null } when signed out.
 */
import { NextResponse } from "next/server";
import type { MeResponse } from "@ttsa/shared";
import { currentUser, toApiUser } from "@/server/auth/user";

export async function GET() {
  const row = await currentUser();
  const body: MeResponse = { user: row ? toApiUser(row) : null };
  return NextResponse.json(body);
}
