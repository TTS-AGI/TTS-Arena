/**
 * Server-side environment access. Centralized so every consumer reads the same
 * names and we fail loudly when a required secret is missing.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/**
 * Public base URL of the app. On a Hugging Face Space, HF provides SPACE_HOST;
 * otherwise use APP_URL (local/self-host), defaulting to localhost.
 */
function resolveAppUrl(): string {
  const spaceHost = optional("SPACE_HOST");
  if (spaceHost) return `https://${spaceHost}`;
  return optional("APP_URL") ?? "http://localhost:3000";
}

export const serverEnv = {
  appUrl: resolveAppUrl(),

  /**
   * True when the app is served over HTTPS in an embeddable context (a Hugging
   * Face Space). Cookies then need SameSite=None; Secure so they survive the
   * cross-site iframe; locally we stay on SameSite=lax over http.
   */
  isEmbedded: () =>
    optional("SPACE_HOST") !== undefined ||
    resolveAppUrl().startsWith("https://"),

  /**
   * True when running on a Hugging Face Space with native OAuth enabled — HF
   * injects OAUTH_CLIENT_ID/SECRET and OPENID_PROVIDER_URL. In that mode we use
   * those instead of a self-registered OAuth app.
   */
  isSpaceOAuth: () => optional("OAUTH_CLIENT_ID") !== undefined,

  hfOAuth: {
    // Native Space vars take precedence; fall back to the local custom app.
    clientId: () =>
      optional("OAUTH_CLIENT_ID") ?? required("HF_OAUTH_CLIENT_ID"),
    clientSecret: () =>
      optional("OAUTH_CLIENT_SECRET") ?? required("HF_OAUTH_CLIENT_SECRET"),
    /** OpenID issuer base (Space provides OPENID_PROVIDER_URL). */
    providerUrl: () =>
      optional("OPENID_PROVIDER_URL") ?? "https://huggingface.co",
  },

  sessionSecret: () =>
    optional("SESSION_SECRET") ??
    // On a Space, derive a stable secret from the injected OAuth secret so the
    // operator doesn't have to set one separately.
    optional("OAUTH_CLIENT_SECRET") ??
    required("SESSION_SECRET"),

  adminUsers: () =>
    (optional("ADMIN_USERS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),

  router: {
    url: () => optional("ROUTER_URL") ?? "http://localhost:8080",
    apiKey: () => optional("ROUTER_API_KEY"),
  },
};

export function isAdmin(username: string): boolean {
  return serverEnv.adminUsers().includes(username.toLowerCase());
}
