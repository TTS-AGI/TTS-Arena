/** GET /api/admin/ips?ip=1.2.3.4 — accounts seen from an IP. Admin only. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { usersByIp } from "@/server/admin/queries";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const ip = new URL(req.url).searchParams.get("ip")?.trim() ?? "";
  if (!ip) {
    return NextResponse.json({ ip: "", accounts: [] });
  }
  try {
    return NextResponse.json(await usersByIp(ip));
  } catch (err) {
    console.error(
      "[admin/ips] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
}
