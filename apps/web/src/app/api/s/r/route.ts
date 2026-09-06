/**
 * POST /api/s/r — receive a client signal report.
 *
 * Deliberately thin: the impl reads the body itself, so the wire format stays
 * private and can change without touching this route. The reply carries no
 * detail — a report that was rejected looks exactly like one that was kept.
 */
import { ingestReport } from "@/server/antifraud";
import { currentUser } from "@/server/auth/user";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser().catch(() => null);
  const { status } = await ingestReport({ req, userId: user?.id ?? null });
  return new Response(null, { status });
}
