/** GET /api/admin/users/[id] — user detail: logins + votes. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { userDetail } from "@/server/admin/queries";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const detail = await userDetail(userId);
  if (!detail) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
