/**
 * Hugging Face OAuth helpers + the account-age gate. Uses the standard
 * authorization-code flow. The OAuth issuer is configurable (so native Space
 * OAuth via OPENID_PROVIDER_URL works), while the profile/overview API base
 * stays on huggingface.co. Accounts younger than MIN_ACCOUNT_AGE_DAYS are
 * rejected.
 */
import { serverEnv } from "../env";

const HF = "https://huggingface.co";
const REDIRECT_PATH = "/api/auth/callback";
export const MIN_ACCOUNT_AGE_DAYS = 30;

/** OAuth issuer base (huggingface.co locally; the Space's OpenID issuer there). */
function issuer(): string {
  return serverEnv.hfOAuth.providerUrl();
}

export function redirectUri(): string {
  return new URL(REDIRECT_PATH, serverEnv.appUrl).toString();
}

/** Build the HF authorize URL with an anti-CSRF `state`. */
export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: serverEnv.hfOAuth.clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    // `email` so we can log the user's address; `profile` for name/avatar.
    scope: "openid profile email",
    state,
  });
  return `${issuer()}/oauth/authorize?${params.toString()}`;
}

/** Exchange an authorization code for an access token. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${issuer()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: serverEnv.hfOAuth.clientId(),
      client_secret: serverEnv.hfOAuth.clientSecret(),
    }),
  });
  if (!res.ok) {
    throw new Error(`HF token exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("HF token exchange: no access_token");
  return json.access_token;
}

export type HFProfile = {
  username: string;
  hfId: string;
  email: string | null;
  avatarUrl: string | null;
};

/**
 * Normalize an HF avatar reference to an absolute URL. Some are already full
 * URLs (CDN/gravatar); others are site-relative paths like
 * `/avatars/xxx.svg`, which need the huggingface.co origin prefixed.
 */
export function normalizeAvatarUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${HF}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/** Fetch the authenticated user's identity (name, id, email, avatar). */
export async function whoami(accessToken: string): Promise<HFProfile> {
  const res = await fetch(`${HF}/api/whoami-v2`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HF whoami failed: ${res.status}`);
  const json = (await res.json()) as {
    name?: string;
    id?: string;
    email?: string;
    avatarUrl?: string;
    picture?: string;
  };
  if (!json.name || !json.id) throw new Error("HF whoami: incomplete profile");
  return {
    username: json.name,
    hfId: json.id,
    email: json.email ?? null,
    avatarUrl: normalizeAvatarUrl(json.avatarUrl ?? json.picture),
  };
}

export type HFOverview = {
  createdAt: Date | null;
  avatarUrl: string | null;
};

/**
 * Fetch the public overview for a username: account-creation date (for the age
 * gate) and the current avatar. This endpoint is keyed on username and always
 * reflects the live avatar, so it's the authoritative source we refresh from on
 * every login. A null `createdAt` means we couldn't verify the account.
 */
export async function fetchOverview(username: string): Promise<HFOverview> {
  try {
    const res = await fetch(
      `${HF}/api/users/${encodeURIComponent(username)}/overview`,
    );
    if (!res.ok) return { createdAt: null, avatarUrl: null };
    const json = (await res.json()) as {
      createdAt?: string;
      avatarUrl?: string;
    };
    const created = json.createdAt ? new Date(json.createdAt) : null;
    return {
      createdAt: created && !Number.isNaN(created.getTime()) ? created : null,
      avatarUrl: normalizeAvatarUrl(json.avatarUrl),
    };
  } catch {
    return { createdAt: null, avatarUrl: null };
  }
}

export function ageInDays(created: Date, now: Date = new Date()): number {
  return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
}
