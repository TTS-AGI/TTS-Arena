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

/**
 * Wrap raw PCM samples in a WAV (RIFF) container so the bytes are a playable,
 * self-describing file. Some providers stream headerless PCM; without a header
 * neither the browser nor ffmpeg knows the sample rate or bit depth.
 *
 * Defaults match the common case: signed 16-bit little-endian, mono.
 */
export function pcmToWav(
  pcm: Uint8Array,
  opts: { sampleRate: number; channels?: number; bitsPerSample?: number },
): Uint8Array {
  const channels = opts.channels ?? 1;
  const bitsPerSample = opts.bitsPerSample ?? 16;
  const byteRate = (opts.sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.byteLength, 4); // file size - 8
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(opts.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.byteLength, 40);
  const out = new Uint8Array(header.byteLength + pcm.byteLength);
  out.set(header, 0);
  out.set(pcm, header.byteLength);
  return out;
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
