/**
 * GET /api/s/c — serve the client signal collector.
 *
 * Deliberately thin: the body is built per request by the private anti-fraud
 * impl, which decides what this browser is asked to measure and how the script
 * is encoded. Nothing about the probe set lives in this file.
 *
 * Never cached — two requests must be able to get different scripts.
 */
import { collectorScript } from "@/server/antifraud";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const script = await collectorScript(req);
  return new Response(script.body, {
    headers: {
      ...script.headers,
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
