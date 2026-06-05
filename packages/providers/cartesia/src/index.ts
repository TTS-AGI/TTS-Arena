/**
 * Cartesia (Sonic) TTS provider. Fetches the account's voices once and caches
 * them, preferring English; returns MP3.
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

const BASE = "https://api.cartesia.ai";
const VERSION = "2024-11-13";
const DEFAULT_MODEL = "sonic-2";

type Voice = { id: string; name?: string };
let voices: Voice[] | null = null;

function key() {
  return env("CARTESIA_API_KEY");
}

async function loadVoices(k: string): Promise<Voice[]> {
  if (voices) return voices;
  const res = await httpFetch(
    `${BASE}/voices`,
    { headers: { Authorization: `Bearer ${k}`, "Cartesia-Version": VERSION } },
    "Cartesia",
  );
  const json = (await res.json()) as
    | Array<{ id: string; name?: string; language?: string }>
    | { data: Array<{ id: string; name?: string; language?: string }> };
  const list = Array.isArray(json) ? json : json.data;
  const english = list.filter((v) => v.language === "en");
  voices = (english.length ? english : list).map((v) => ({
    id: v.id,
    name: v.name,
  }));
  if (voices.length === 0) {
    throw new ProviderError("Cartesia: no voices on account", "not_configured");
  }
  return voices;
}

export const cartesia: TTSProvider = {
  id: "cartesia",
  name: "Cartesia",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "sonic-2", name: "Cartesia Sonic 2" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Cartesia: CARTESIA_API_KEY is not set",
        "not_configured",
      );
    }
    const model = input.model ?? DEFAULT_MODEL;
    const pool = await loadVoices(k);
    const voice =
      (input.voice && pool.find((v) => v.id === input.voice)) ||
      pickRandom(pool);

    const res = await httpFetch(
      `${BASE}/tts/bytes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${k}`,
          "Cartesia-Version": VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: model,
          transcript: input.text,
          voice: { mode: "id", id: voice.id },
          output_format: {
            container: "mp3",
            bit_rate: 128000,
            sample_rate: 44100,
          },
          language: "en",
        }),
        timeoutMs: 60_000,
      },
      "Cartesia",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "mp3",
      voice: voice.id,
      model,
    };
  },
};

registerProvider(cartesia);
registerArenaModels([
  {
    id: "cartesia-sonic-2",
    name: "Cartesia Sonic 2",
    url: "https://cartesia.ai/",
    open: false,
    provider: "cartesia",
    routerModel: "sonic-2",
    enabled: true,
  },
]);
