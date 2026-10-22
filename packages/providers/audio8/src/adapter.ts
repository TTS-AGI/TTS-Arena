/**
 * Audio8 HTTP adapter. Registration lives in index.ts.
 * Credentials and the endpoint URL are supplied by the Arena backend operator.
 */
import {
  ProviderError,
  type SynthesizeInput,
  type SynthesizeResult,
  type TTSProvider,
} from "@ttsa/provider-sdk";

// Grace and Jack: British English; Clara and Arthur: American English.
export const VOICES = ["grace", "jack", "clara", "arthur"] as const;
export const MODEL_ID = "audio8-tts-v1";
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

export interface Audio8Config {
  endpoint: string;
  hfToken: string;
  serviceKey: string;
}

export interface AdapterOptions {
  config?: () => Audio8Config | undefined;
  fetch?: typeof globalThis.fetch;
  chooseVoice?: () => (typeof VOICES)[number];
  timeoutMs?: number;
  /** Local fixture tests only; production requires HTTPS. */
  allowLoopbackHttp?: boolean;
}

function environmentConfig(): Audio8Config | undefined {
  const endpoint = process.env.AUDIO8_ENDPOINT_URL;
  const hfToken = process.env.AUDIO8_HF_TOKEN;
  const serviceKey = process.env.AUDIO8_SERVICE_KEY;
  return endpoint && hfToken && serviceKey
    ? { endpoint, hfToken, serviceKey }
    : undefined;
}

function endpointUrl(raw: string, allowLoopback: boolean): string {
  try {
    const url = new URL(raw);
    const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(allowLoopback && loopback && url.protocol === "http:"))
    ) {
      throw new Error("Invalid URL");
    }
    url.pathname = url.pathname.replace(/\/$/, "") + "/tts";
    return url.toString();
  } catch {
    throw new ProviderError(
      "Audio8: invalid endpoint configuration",
      "not_configured",
    );
  }
}

/** Reject HTML/JSON, empty audio, truncated RIFF and unexpected PCM formats. */
export function inspectWav(bytes: Uint8Array): {
  frames: number;
  seconds: number;
} {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bad = () =>
    new ProviderError("Audio8: invalid WAV response", "upstream_error");
  if (
    b.length < 44 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE" ||
    b.readUInt32LE(4) + 8 !== b.length
  ) {
    throw bad();
  }
  let formatOk = false,
    dataBytes = 0,
    at = 12;
  while (at < b.length) {
    if (at + 8 > b.length) throw bad();
    const id = b.toString("ascii", at, at + 4),
      length = b.readUInt32LE(at + 4);
    const start = at + 8,
      end = start + length;
    if (end > b.length) throw bad();
    if (id === "fmt ") {
      if (length < 16) throw bad();
      formatOk =
        b.readUInt16LE(start) === 1 &&
        b.readUInt16LE(start + 2) === 1 &&
        b.readUInt32LE(start + 4) === 44100 &&
        b.readUInt32LE(start + 8) === 88200 &&
        b.readUInt16LE(start + 12) === 2 &&
        b.readUInt16LE(start + 14) === 16;
    }
    if (id === "data") dataBytes += length;
    at = end + (length % 2);
  }
  if (!formatOk || !dataBytes || dataBytes % 2 || at !== b.length) throw bad();
  return { frames: dataBytes / 2, seconds: dataBytes / 88200 };
}

export function createAudio8Provider(
  options: AdapterOptions = {},
): TTSProvider {
  const readConfig = options.config ?? environmentConfig;
  const fetcher = options.fetch ?? globalThis.fetch;
  const choose =
    options.chooseVoice ??
    (() => VOICES[Math.floor(Math.random() * VOICES.length)]!);
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!(timeoutMs > 0 && timeoutMs <= 120_000))
    throw new Error("Invalid adapter timeout");
  return {
    id: "audio8",
    name: "Edge0",
    isAvailable: () => {
      const c = readConfig();
      if (!c?.hfToken || !c.serviceKey) return false;
      try {
        endpointUrl(c.endpoint, options.allowLoopbackHttp ?? false);
        return true;
      } catch {
        return false;
      }
    },
    listModels: () => [{ id: MODEL_ID, name: "Audio8-TTS-Realistic-0.6B" }],
    async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
      const c = readConfig();
      if (!c?.hfToken || !c.serviceKey) {
        throw new ProviderError(
          "Audio8: endpoint credentials are not configured",
          "not_configured",
        );
      }
      if (input.model != null && input.model !== MODEL_ID) {
        throw new ProviderError("Audio8: unknown model", "unknown_model");
      }
      if (
        typeof input.text !== "string" ||
        !input.text.trim() ||
        Array.from(input.text).length > 1000
      ) {
        throw new ProviderError(
          "Audio8: text must contain 1–1000 characters",
          "invalid_input",
        );
      }
      const voice = input.voice ?? choose();
      if (!(VOICES as readonly string[]).includes(voice)) {
        throw new ProviderError("Audio8: unsupported voice", "invalid_input");
      }
      const url = endpointUrl(c.endpoint, options.allowLoopbackHttp ?? false);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetcher(url, {
          method: "POST",
          redirect: "error", // Never forward either credential to a redirect destination.
          headers: {
            Authorization: `Bearer ${c.hfToken}`,
            "X-Service-Key": c.serviceKey,
            "Content-Type": "application/json",
            Accept: "audio/wav",
            "X-Use-Cache": "false",
          },
          body: JSON.stringify({ text: input.text, voice_id: voice }),
          signal: controller.signal,
        });
        if (!res.ok) {
          await res.body?.cancel();
          // Do not put upstream response bodies, URLs or credentials in Arena errors.
          throw new ProviderError(
            `Audio8: HTTP ${res.status}`,
            "upstream_error",
          );
        }
        if (
          res.headers.get("content-type")?.split(";")[0]?.trim() !==
            "audio/wav" ||
          !res.body
        ) {
          await res.body?.cancel();
          throw new ProviderError(
            "Audio8: expected WAV audio",
            "upstream_error",
          );
        }
        const reader = res.body.getReader(),
          chunks: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > MAX_AUDIO_BYTES) {
              await reader.cancel();
              throw new ProviderError(
                "Audio8: response exceeds audio size limit",
                "upstream_error",
              );
            }
            chunks.push(part.value);
          }
        } finally {
          reader.releaseLock();
        }
        const audio = Buffer.concat(chunks);
        inspectWav(audio);
        return {
          audioBase64: audio.toString("base64"),
          extension: "wav",
          voice,
          model: MODEL_ID,
        };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError(
          controller.signal.aborted
            ? "Audio8: request deadline exceeded"
            : "Audio8: request failed",
          "upstream_error",
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const audio8 = createAudio8Provider();
