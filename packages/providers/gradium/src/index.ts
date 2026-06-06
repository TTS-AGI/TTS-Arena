/**
 * Gradium TTS provider. Single model, rotates a curated voice list, returns
 * the audio bytes the API streams back.
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

const ENDPOINT = "https://api.gradium.ai/api/post/speech/tts";
const ICON = "/logos/gradium.webp";
const VOICES = [
  "6MFfc37kq0sBjBjy",
  "_6Aslh2DxfmnRLmP",
  "POBHtemksfWQbng0",
  "cLONiZ4hQ8VpQ4Sz",
  "vtG8ddh4IN32Otad",
  "7aEKz4P1ogZ0UsRP",
];

function key() {
  return env("GRADIUM_API_KEY");
}

export const gradium: TTSProvider = {
  id: "gradium",
  name: "Gradium",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: "gradium", name: "Gradium TTS" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Gradium: GRADIUM_API_KEY is not set",
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
        headers: { "x-api-key": k, "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.text, voice_id: voice }),
        timeoutMs: 60_000,
      },
      "Gradium",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "wav",
      voice,
      model: "gradium",
    };
  },
};

registerProvider(gradium);
registerArenaModels([
  {
    id: "gradium",
    name: "Gradium TTS",
    url: "https://gradium.ai/",
    icon: ICON,
    open: false,
    provider: "gradium",
    routerModel: "gradium",
    enabled: true,
  },
]);
