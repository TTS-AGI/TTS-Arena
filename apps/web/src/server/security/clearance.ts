/**
 * Captcha clearance — proof that *this* browser, signed in as *this* user,
 * solved an hCaptcha recently.
 *
 * This used to be a cookie containing the literal string "1". httpOnly keeps
 * page scripts from reading it, but it was never a secret: any client that
 * isn't a browser — which is precisely the client we are trying to price out —
 * could send `Cookie: ttsa_cap=1` and skip the captcha forever. So the marker
 * is now a signed token, using the same secret as the session cookie, and it is
 * bound to the user id so one solve can't be replayed across a farm of
 * accounts driven by the same harness.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { serverEnv } from "../env";
import { cookieSecurity } from "../auth/session";

const CAP_COOKIE = "ttsa_cap";
/** A solve is good for this long before the next one is asked for. */
const CAP_TTL_SECONDS = 60 * 60 * 6; // 6h

function secretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv.sessionSecret());
}

/** True when the caller holds a valid, unexpired clearance for this user. */
export async function hasClearance(userId: number): Promise<boolean> {
  const token = (await cookies()).get(CAP_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify<{ cap: number }>(token, secretKey());
    return payload.cap === userId;
  } catch {
    // Expired, tampered with, or signed under a rotated secret — solve again.
    return false;
  }
}

/** Record a fresh solve for this user. */
export async function grantClearance(userId: number): Promise<void> {
  const token = await new SignJWT({ cap: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CAP_TTL_SECONDS}s`)
    .sign(secretKey());

  (await cookies()).set(CAP_COOKIE, token, {
    httpOnly: true,
    ...cookieSecurity(),
    path: "/",
    maxAge: CAP_TTL_SECONDS,
  });
}
