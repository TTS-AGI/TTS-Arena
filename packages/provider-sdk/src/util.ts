/**
 * Small helpers shared by provider implementations — keep each provider file
 * focused on its vendor's quirks, not boilerplate.
 */
import { ProviderError } from "./types";

/** Read an env var, returning undefined for missing/empty. */
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** Bytes → base64. */
export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(u8).toString("base64");
}

/** Deterministic-free random pick from a non-empty array. */
export function pickRandom<T>(
  items: readonly T[],
  rand: () => number = Math.random,
): T {
  if (items.length === 0)
    throw new ProviderError("empty pool", "invalid_input");
  return items[Math.floor(rand() * items.length)]!;
}

/** fetch with a timeout that throws a typed upstream error on non-2xx/timeout. */
export async function httpFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number },
  providerName: string,
): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: controller.signal });
  } catch (cause) {
    throw new ProviderError(
      `${providerName}: request failed`,
      "upstream_error",
      cause,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(
      `${providerName}: HTTP ${res.status} ${body.slice(0, 300)}`,
      "upstream_error",
    );
  }
  return res;
}
