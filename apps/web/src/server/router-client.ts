/**
 * Thin client for the TTS router. Sends { text, provider, model } and returns
 * the decoded audio plus the voice the provider actually used.
 */
import { routerTTSResponseSchema } from "@ttsa/shared";
import { serverEnv } from "./env";

export type Synthesized = {
  /** Normalized audio (for playback). */
  audio: Buffer;
  extension: string;
  voice: string;
  /** Pre-normalization audio (when requested) for the RLHF archive. */
  raw?: { audio: Buffer; extension: string };
};

export async function synthesize(params: {
  text: string;
  provider: string;
  model: string | null;
  /** Also fetch the pre-normalization audio for archival. */
  includeRaw?: boolean;
}): Promise<Synthesized> {
  const apiKey = serverEnv.router.apiKey();
  const url = `${serverEnv.router.url()}/tts`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        text: params.text,
        provider: params.provider,
        model: params.model,
        includeRaw: params.includeRaw,
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    // Network-level failure (router down, DNS, timeout) — fetch rejects with no
    // status, so name the provider/model and re-throw a descriptive error.
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[router] request failed", {
      url,
      provider: params.provider,
      model: params.model,
      reason,
    });
    throw new Error(
      `Router request failed for ${params.provider}/${params.model ?? "default"}: ${reason}`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[router] non-OK response", {
      url,
      provider: params.provider,
      model: params.model,
      status: res.status,
      detail: detail.slice(0, 500),
    });
    throw new Error(
      `Router ${res.status} for ${params.provider}/${params.model ?? "default"}: ${detail.slice(0, 200)}`,
    );
  }

  const json = routerTTSResponseSchema.parse(await res.json());
  return {
    audio: Buffer.from(json.audioData, "base64"),
    extension: json.extension,
    voice: json.voice,
    raw: json.rawAudioData
      ? {
          audio: Buffer.from(json.rawAudioData, "base64"),
          extension: json.rawExtension ?? json.extension,
        }
      : undefined,
  };
}
