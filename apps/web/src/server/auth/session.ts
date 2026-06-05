/**
 * Stateless session: a signed JWT stored in an httpOnly cookie. The payload is
 * small (the user's DB id) — everything else is looked up from the database.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { serverEnv } from "../env";

const COOKIE_NAME = "ttsa_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

type SessionPayload = { uid: number };

function secretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv.sessionSecret());
}

export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, secretKey());
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
