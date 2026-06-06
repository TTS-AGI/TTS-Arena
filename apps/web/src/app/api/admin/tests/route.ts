/**
 * GET  /api/admin/tests?page&pageSize — paginated history of Test All runs.
 * POST /api/admin/tests — start a new run (synthesize every model). Admin only.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { AdminTestRunsResponse } from "@ttsa/shared";
import { requireAdmin, currentAdmin } from "@/server/auth/admin";
import { listTestRuns, hasRunningTestRun } from "@/server/admin/queries";
import { startTestRun } from "@/server/admin/test-runner";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const sp = req.nextUrl.searchParams;
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(sp.get("pageSize") ?? 20)));
  const body: AdminTestRunsResponse = await listTestRuns({ page, pageSize });
  return NextResponse.json(body);
}

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  // One run at a time — avoid hammering providers with concurrent test storms.
  if (await hasRunningTestRun()) {
    return NextResponse.json(
      { error: "a test run is already in progress" },
      { status: 409 },
    );
  }
  const admin = await currentAdmin();
  const runId = await startTestRun(admin?.username);
  return NextResponse.json({ ok: true, runId });
}
