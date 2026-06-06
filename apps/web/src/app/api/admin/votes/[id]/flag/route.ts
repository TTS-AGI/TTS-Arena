/** POST /api/admin/votes/[id]/flag — manually flag/unflag a vote. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { setVoteFlag } from "@/server/admin/queries";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const { id } = await params;
  const voteId = Number(id);
  if (!Number.isInteger(voteId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as {
    flagged?: boolean;
  } | null;
  const flagged = body?.flagged ?? true;

  const ok = await setVoteFlag(voteId, flagged);
  if (!ok) {
    return NextResponse.json({ error: "vote not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, flagged });
}
