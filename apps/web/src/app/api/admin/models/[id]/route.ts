/** PATCH /api/admin/models/[id] — edit a model's display/active fields. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import { adminModelUpdateSchema } from "@ttsa/shared";
import { requireAdmin } from "@/server/auth/admin";
import { updateModel } from "@/server/admin/queries";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }

  const { id } = await params;
  const parsed = adminModelUpdateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const ok = await updateModel(id, parsed.data);
  if (!ok) {
    return NextResponse.json({ error: "model not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
