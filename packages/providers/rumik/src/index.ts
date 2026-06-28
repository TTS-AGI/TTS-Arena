/**
 * Rumik TTS provider — Silk Mulberry 1.5.
 *
 * POST https://silk-api.rumik.ai/v1/tts with a Bearer key. The mulberry model
 * exposes four preset studio voices (speaker_1..4), which we rotate across
 * battles — no tone-tag injection or invented descriptions needed. Returns a
 * 24 kHz mono WAV.
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

const ENDPOINT = "https://silk-api.rumik.ai/v1/tts";
const ICON = "/logos/rumik.webp";
const MODEL = "mulberry";

const VOICES = ["speaker_1", "speaker_2", "speaker_3", "speaker_4"];

function key() {
  return env("RUMIK_API_KEY");
}

export const rumik: TTSProvider = {
  id: "rumik",
  name: "Rumik",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "silk-mulberry-1.5", name: "Silk Mulberry 1.5" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Rumik: RUMIK_API_KEY is not set",
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
        headers: {
          Authorization: `Bearer ${k}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: input.text,
          model: MODEL,
          speaker: voice,
        }),
        timeoutMs: 120_000,
      },
      "Rumik",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "wav",
      voice,
      model: "silk-mulberry-1.5",
    };
  },
};

registerProvider(rumik);
registerArenaModels([
  {
    id: "silk-mulberry-1.5",
    name: "Silk Mulberry 1.5",
    url: "https://rumik.ai/",
    icon: ICON,
    open: false,
    provider: "rumik",
    routerModel: "silk-mulberry-1.5",
    enabled: true,
  },
]);
