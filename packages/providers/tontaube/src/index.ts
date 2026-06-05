/**
 * Tontaube TTS provider. Rotates a fixed voice set; returns MP4 audio bytes
 * which the router's normalization step transcodes to MP3.
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

const ENDPOINT = "https://api.tontaube.ai/tts/arena";
const VOICES = [
  "wheeler",
  "malcom",
  "harvey",
  "barry",
  "miles",
  "jonny",
  "evie",
  "sahra",
];

function key() {
  return env("TONTAUBE_API_KEY");
}

export const tontaube: TTSProvider = {
  id: "tontaube",
  name: "Tontaube",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: "tontaube", name: "Tontaube" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Tontaube: TONTAUBE_API_KEY is not set",
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
        headers: { "X-Api-Key": k, "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.text, voice }),
        timeoutMs: 90_000,
      },
      "Tontaube",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "mp4",
      voice,
      model: "tontaube",
    };
  },
};

registerProvider(tontaube);
registerArenaModels([
  {
    id: "tontaube",
    name: "Tontaube",
    url: "https://tontaube.ai/",
    open: false,
    provider: "tontaube",
    routerModel: "tontaube",
    enabled: true,
  },
]);
