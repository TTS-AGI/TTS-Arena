/**
 * Shared captcha gate. A signed-in browser solves an hCaptcha once, then rides
 * the clearance for its lifetime. Intended to gate the expensive generate
 * endpoint (so the arena can't be abused as a free TTS API) — and, transitively,
 * everything downstream, since you must generate before you can vote.
 *
 * The clearance marker itself lives in ./clearance, which signs it and binds it
 * to the user. Do not reintroduce a plain-value cookie here: a non-browser
 * client sets those for itself.
 */
import { SECURITY } from "../arena/security";
import { grantClearance, hasClearance } from "./clearance";
import { verifyHcaptcha } from "./hcaptcha";

/**
 * Check the captcha gate for a request. Reads the `x-cap-token` header, and on a
 * freshly-valid token records the solve. Returns whether the caller still needs
 * to solve one.
 */
export async function captchaGate(
  req: Request,
  userId: number,
): Promise<{ needsCaptcha: boolean }> {
  if (SECURITY.disabled()) return { needsCaptcha: false };
  if (await hasClearance(userId)) return { needsCaptcha: false };

  if (await verifyHcaptcha(req.headers.get("x-cap-token"))) {
    await grantClearance(userId);
    return { needsCaptcha: false };
  }
  return { needsCaptcha: true };
}
