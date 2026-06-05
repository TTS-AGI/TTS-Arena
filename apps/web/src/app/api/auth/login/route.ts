/**
 * GET /api/auth/login — start the HF OAuth flow. Sets a short-lived `state`
 * cookie (CSRF guard) and redirects to Hugging Face.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl } from "@/server/auth/hf";

export async function GET() {
  const state = crypto.randomUUID();
  const store = await cookies();
  store.set("ttsa_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  return NextResponse.redirect(authorizeUrl(state));
}
