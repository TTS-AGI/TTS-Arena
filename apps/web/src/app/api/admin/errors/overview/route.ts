/** GET /api/admin/errors/overview — error KPIs + trends + breakdowns. Admin only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { errorOverview } from "@/server/admin/queries";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  try {
    return NextResponse.json(await errorOverview());
  } catch (err) {
    console.error(
      "[admin/errors/overview] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "error data unavailable" },
      { status: 500 },
    );
  }
}
