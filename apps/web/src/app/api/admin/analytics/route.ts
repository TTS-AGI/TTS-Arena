/** GET /api/admin/analytics — pool consumption, vote splits, top voices. Admin only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { analytics } from "@/server/admin/queries";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  return NextResponse.json(await analytics());
}
