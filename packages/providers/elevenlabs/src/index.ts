/**
 * ElevenLabs TTS provider.
 *
 * Importing this module registers the provider as a side effect. Voices and
 * models are fetched lazily from the account on first use and cached. A voice
 * is chosen at random per request and reported back for per-voice stats.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech
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

const BASE_URL = "https://api.elevenlabs.io/v1";

type Cache = { models: ProviderModel[]; voices: string[] };
let cache: Cache | null = null;

function apiKey(): string | undefined {
  return env("ELEVENLABS_API_KEY");
}

async function load(key: string): Promise<Cache> {
  if (cache) return cache;
  const headers = { "xi-api-key": key };

  const modelsRes = await httpFetch(
    `${BASE_URL}/models`,
    { headers },
    "ElevenLabs",
  );
  const modelsJson = (await modelsRes.json()) as Array<{
    model_id: string;
    name: string;
    description?: string;
  }>;
  const models: ProviderModel[] = modelsJson.map((m) => ({
    id: m.model_id,
    name: m.name,
    description: m.description,
  }));

  const voicesRes = await httpFetch(
    `${BASE_URL}/voices`,
    { headers },
    "ElevenLabs",
  );
  const voicesJson = (await voicesRes.json()) as {
    voices: Array<{ voice_id: string }>;
  };
  const voices = voicesJson.voices.map((v) => v.voice_id);
  if (voices.length === 0) {
    throw new ProviderError(
      "ElevenLabs: no voices on account",
      "not_configured",
    );
  }

  cache = { models, voices };
  return cache;
}

export const elevenlabs: TTSProvider = {
  id: "elevenlabs",
  name: "ElevenLabs",

  isAvailable() {
    return apiKey() !== undefined;
  },

  async listModels() {
    const key = apiKey();
    if (!key) return [];
    return (await load(key)).models;
  },

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const key = apiKey();
    if (!key) {
      throw new ProviderError(
        "ElevenLabs: ELEVENLABS_API_KEY is not set",
        "not_configured",
      );
    }
    const { models, voices } = await load(key);

    const model = input.model ?? models[0]?.id;
    if (!model) {
      throw new ProviderError(
        "ElevenLabs: no models available",
        "not_configured",
      );
    }
    if (!models.some((m) => m.id === model)) {
      throw new ProviderError(
        `ElevenLabs: unknown model "${model}"`,
        "unknown_model",
      );
    }

    const voice =
      input.voice && voices.includes(input.voice)
        ? input.voice
        : pickRandom(voices);

    const res = await httpFetch(
      `${BASE_URL}/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input.text,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        timeoutMs: 60_000,
      },
      "ElevenLabs",
    );

    const audio = await res.arrayBuffer();
    return {
      audioBase64: toBase64(audio),
      extension: "mp3",
      voice,
      model,
    };
  },
};

registerProvider(elevenlabs);

registerArenaModels([
  {
    id: "eleven-multilingual-v2",
    name: "Eleven Multilingual v2",
    url: "https://elevenlabs.io/",
    open: false,
    provider: "elevenlabs",
    routerModel: "eleven_multilingual_v2",
    enabled: true,
  },
  {
    id: "eleven-turbo-v2.5",
    name: "Eleven Turbo v2.5",
    url: "https://elevenlabs.io/",
    open: false,
    provider: "elevenlabs",
    routerModel: "eleven_turbo_v2_5",
    enabled: true,
  },
  {
    id: "eleven-flash-v2.5",
    name: "Eleven Flash v2.5",
    url: "https://elevenlabs.io/",
    open: false,
    provider: "elevenlabs",
    routerModel: "eleven_flash_v2_5",
    enabled: true,
  },
]);
