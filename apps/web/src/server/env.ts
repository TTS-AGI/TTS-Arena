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

export const serverEnv = {
  appUrl: optional("APP_URL") ?? "http://localhost:3000",

  hfOAuth: {
    clientId: () => required("HF_OAUTH_CLIENT_ID"),
    clientSecret: () => required("HF_OAUTH_CLIENT_SECRET"),
  },

  sessionSecret: () => required("SESSION_SECRET"),

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
