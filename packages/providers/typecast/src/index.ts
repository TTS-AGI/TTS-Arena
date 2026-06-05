/**
 * Typecast (SSFM) TTS provider. Single model, rotates a curated voice list,
 * returns the audio bytes the API streams back.
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

const ENDPOINT = "https://api.typecast.ai/v1/text-to-speech";
const MODEL_NAME = "ssfm-v30";
const VOICES = [
  "tc_65b34b05b3fb844f3d6b7aab",
  "tc_67b6985d4d5d632d97478263",
  "tc_67bfc776d41bad708fdf4ef9",
  "tc_67d238428572120c4aa644cc",
  "tc_660e5c29eef728e75f95f538",
  "tc_67a440ec1e05bd5665857efd",
  "tc_63aaebfaf95b9c23b311c88d",
  "tc_645349827a050a4142d49edf",
];

function key() {
  return env("TYPECAST_API_KEY");
}

export const typecast: TTSProvider = {
  id: "typecast",
  name: "Typecast",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "typecast", name: "Typecast SSFM 3.0" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Typecast: TYPECAST_API_KEY is not set",
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
        headers: { "X-API-KEY": k, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input.text,
          model: MODEL_NAME,
          voice_id: voice,
          prompt: { emotion_type: "preset", emotion_preset: "normal" },
        }),
        timeoutMs: 60_000,
      },
      "Typecast",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "wav",
      voice,
      model: "typecast",
    };
  },
};

registerProvider(typecast);
registerArenaModels([
  {
    id: "typecast",
    name: "Typecast SSFM 3.0",
    url: "https://typecast.ai/developers/",
    open: false,
    provider: "typecast",
    routerModel: "typecast",
    enabled: true,
  },
]);
