/**
 * Extract client connection info (IP + user agent) from a request's headers,
 * honoring the usual proxy/CDN forwarding headers (the app runs behind HF's
 * proxy in production).
 */
export function clientIp(req: Request): string | null {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? null;
}

export function userAgent(req: Request): string | null {
  const ua = req.headers.get("user-agent");
  return ua ? ua.slice(0, 500) : null;
}
