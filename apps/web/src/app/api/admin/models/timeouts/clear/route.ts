/**
 * POST /api/admin/models/timeouts/clear — clear ALL model time-outs (bulk
 * un-timeout). Admin only.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { clearAllModelTimeouts } from "@/server/admin/queries";

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const cleared = await clearAllModelTimeouts();
  return NextResponse.json({ ok: true, cleared });
}
