/** GET /api/admin/generations/overview — latency/throughput KPIs + trends. Admin only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { generationOverview } from "@/server/admin/queries";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  try {
    return NextResponse.json(await generationOverview());
  } catch (err) {
    console.error(
      "[admin/generations/overview] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "generation data unavailable" },
      { status: 500 },
    );
  }
}
