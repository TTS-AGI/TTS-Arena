/** GET /api/admin/models — all models with ratings + vote counts. Admin only. */
import { NextResponse } from "next/server";
import type { AdminModelsResponse } from "@ttsa/shared";
import { requireAdmin } from "@/server/auth/admin";
import { listModels } from "@/server/admin/queries";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const body: AdminModelsResponse = { models: await listModels() };
  return NextResponse.json(body);
}
