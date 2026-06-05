/**
 * GET /api/auth/callback — HF OAuth redirect target. Verifies state, exchanges
 * the code, enforces the account-age gate, upserts the user, starts a session,
 * and returns the user to the app. Failures redirect home with an `?auth=`
 * reason the client can surface.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { serverEnv } from "@/server/env";
import {
  MIN_ACCOUNT_AGE_DAYS,
  ageInDays,
  exchangeCode,
  fetchOverview,
  whoami,
} from "@/server/auth/hf";
import { upsertUser } from "@/server/auth/user";
import { createSession } from "@/server/auth/session";

function home(reason?: string): NextResponse {
  const url = new URL(serverEnv.appUrl);
  if (reason) url.searchParams.set("auth", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const store = await cookies();
  const expectedState = store.get("ttsa_oauth_state")?.value;
  store.delete("ttsa_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return home("invalid_state");
  }

  try {
    const accessToken = await exchangeCode(code);
    const profile = await whoami(accessToken);

    // One overview call: the age gate + the freshest (username-keyed) avatar.
    const overview = await fetchOverview(profile.username);
    if (!overview.createdAt) return home("age_unverifiable");
    if (ageInDays(overview.createdAt) < MIN_ACCOUNT_AGE_DAYS) {
      return home("too_new");
    }

    const user = await upsertUser(
      { ...profile, avatarUrl: overview.avatarUrl ?? profile.avatarUrl },
      overview.createdAt,
    );
    await createSession(user.id);
    return home();
  } catch {
    return home("error");
  }
}
