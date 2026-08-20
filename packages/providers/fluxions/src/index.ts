/**
 * Fluxions "Vui" provider. REST endpoint, `Authorization: <key>` (the Bearer
 * prefix is optional upstream), returns raw WAV bytes (mono, 24 kHz, s16le).
 *
 * Voices are fetched from GET /vui/voices and cached, rather than hardcoded:
 * a built-in voice id carries the serving checkpoint's suffix (e.g.
 * `maeve.h8ff7e07da`), and Fluxions rotates that suffix whenever they ship a
 * new model. A pinned list would start 4xx-ing on their next deploy. FALLBACK
 * exists only so a voices-endpoint blip doesn't take the model out of the
 * arena; it is expected to go stale and is used on a best-effort basis.
 *
 * The API takes no model parameter — one serving checkpoint per key — so
 * `listModels` reports the single logical model and `synthesize` accepts either
 * that id or the provider default.
 *
 * Docs: https://fluxions.ai/docs
 */
import {
  ProviderError,
  env,
  httpFetch,
  pickRandom,
  registerArenaModels,
  registerProvider,
  toBase64,
  type ProviderModel,
  type SynthesizeInput,
  type SynthesizeResult,
  type TTSProvider,
} from "@ttsa/provider-sdk";

const BASE_URL = "https://api.fluxions.ai/vui";

/** The single logical model this provider serves. */
const MODEL_ID = "vui";

/** Last-resort voices if GET /vui/voices is unreachable. Expected to go stale. */
const FALLBACK_VOICES = [
  "maeve.h8ff7e07da",
  "abraham.h8ff7e07da",
  "harry.h8ff7e07da",
];

let voiceCache: string[] | null = null;

function apiKey(): string | undefined {
  return env("FLUXIONS_API_KEY");
}

async function loadVoices(key: string): Promise<string[]> {
  if (voiceCache) return voiceCache;
  try {
    const res = await httpFetch(
      `${BASE_URL}/voices`,
      { headers: { Authorization: key } },
      "Fluxions",
    );
    const json = (await res.json()) as {
      voices?: Array<{ voice_id?: string }>;
    };
    const voices = (json.voices ?? [])
      .map((v) => v.voice_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    voiceCache = voices.length > 0 ? voices : FALLBACK_VOICES;
  } catch {
    // Don't fail synthesis on a voice-listing blip — the fallback ids are
    // usually still current.
    voiceCache = FALLBACK_VOICES;
  }
  return voiceCache;
}

export const fluxions: TTSProvider = {
  id: "fluxions",
  name: "Fluxions",

  isAvailable() {
    return apiKey() !== undefined;
  },

  listModels(): ProviderModel[] {
    return [
      {
        id: MODEL_ID,
        name: "Fluxions Vui",
        description: "Expressive TTS with voice cloning (24 kHz mono)",
      },
    ];
  },

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const key = apiKey();
    if (!key) {
      throw new ProviderError(
        "Fluxions: FLUXIONS_API_KEY is not set",
        "not_configured",
      );
    }

    const model = input.model ?? MODEL_ID;
    if (model !== MODEL_ID) {
      throw new ProviderError(
        `Fluxions: unknown model "${model}"`,
        "unknown_model",
      );
    }

    const voices = await loadVoices(key);
    const voice =
      input.voice && voices.includes(input.voice)
        ? input.voice
        : pickRandom(voices);

    const res = await httpFetch(
      `${BASE_URL}/v1/tts`,
      {
        method: "POST",
        headers: {
          Authorization: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voice,
          input: input.text,
          response_format: "wav",
          stream: false,
        }),
        timeoutMs: 90_000,
      },
      "Fluxions",
    );

    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "wav",
      voice,
      model: MODEL_ID,
    };
  },
};

registerProvider(fluxions);

registerArenaModels([
  {
    id: "fluxions-vui",
    name: "Fluxions Vui",
    url: "https://fluxions.ai/",
    open: true,
    provider: "fluxions",
    routerModel: MODEL_ID,
    enabled: true,
  },
]);
