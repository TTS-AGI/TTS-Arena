/**
 * VUI Labs "Luna TTS" provider. Public REST endpoint, X-API-Key auth, returns
 * MP3 (24 kHz mono). Rotates the production named voices.
 *
 * Note: the API exposes a `bench_female_01` voice, which we omit — it reads as
 * an internal benchmark voice rather than a showcase one. If VUI Labs sends a
 * larger recommended voice list, extend VOICES here.
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

const ENDPOINT = "https://api.vuilabs.ai/v1/text-to-speech";

const VOICES = ["daniel", "ella", "grace"];

function key() {
  return env("VUILABS_API_KEY");
}

export const luna: TTSProvider = {
  id: "vuilabs",
  name: "VUI Labs",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: "luna-tts", name: "Luna TTS" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "VUI Labs: VUILABS_API_KEY is not set",
        "not_configured",
      );
    }
    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);
    const res = await httpFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: { "X-API-Key": k, "Content-Type": "application/json" },
        body: JSON.stringify({ generate_text: input.text, voice_id: voice }),
        timeoutMs: 90_000,
      },
      "VUI Labs",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "mp3",
      voice,
      model: "luna-tts",
    };
  },
};

registerProvider(luna);
registerArenaModels([
  {
    id: "luna-tts",
    name: "Luna TTS",
    url: "https://www.vuilabs.ai/",
    icon: "/logos/vuilabs.webp",
    open: false,
    provider: "vuilabs",
    routerModel: "luna-tts",
    enabled: true,
  },
]);
