/** GET /api/admin/security/overview — anti-fraud KPIs + recent events. Admin only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { securityOverview } from "@/server/admin/queries";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  try {
    return NextResponse.json(await securityOverview());
  } catch (err) {
    console.error(
      "[admin/security/overview] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "security data unavailable" },
      { status: 500 },
    );
  }
}
