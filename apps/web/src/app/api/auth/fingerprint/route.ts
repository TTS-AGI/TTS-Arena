/**
 * POST /api/auth/fingerprint — record the signed-in user's browser fingerprint
 * (FingerprintJS visitor id) alongside their current IP + user agent. Appends
 * to the login history; one call per page load is fine.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/server/auth/user";
import { recordLogin } from "@/server/auth/logins";
import { clientIp, userAgent } from "@/server/request-info";

const bodySchema = z.object({ fingerprint: z.string().min(1).max(128) });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await recordLogin({
    userId: user.id,
    ip: clientIp(req),
    userAgent: userAgent(req),
    fingerprint: parsed.data.fingerprint,
  });
  return NextResponse.json({ ok: true });
}
