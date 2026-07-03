/**
 * hCaptcha server-side verification. The client widget (see cap-modal.tsx)
 * produces a response token; we validate it once against hCaptcha's siteverify
 * endpoint. Tokens are single-use and short-lived on hCaptcha's side.
 *
 * Replaces the previous self-hosted Cap.js proof-of-work captcha — hCaptcha's
 * managed bot detection is a stronger cost gate. (Captcha remains a friction
 * layer, not the primary defense; the statistical anti-fraud detection is.)
 */
import { serverEnv } from "../env";

const VERIFY_URL = "https://api.hcaptcha.com/siteverify";

/** Validate an hCaptcha response token. Returns true only on a verified solve. */
export async function verifyHcaptcha(token: string | null): Promise<boolean> {
  if (!token) return false;
  const secret = serverEnv.hcaptchaSecret();
  if (!secret) {
    // No secret configured — can't verify. Fail closed (treated as unsolved).
    console.warn("[hcaptcha] HCAPTCHA_SECRET not set; cannot verify token");
    return false;
  }
  try {
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
