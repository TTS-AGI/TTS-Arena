/**
 * MARS (camb.ai) TTS provider. Uses predefined voices; returns FLAC bytes
 * which the router's normalization step transcodes to MP3.
 */
import {
  ProviderError,
  env,
  httpFetch,
  registerArenaModels,
  registerProvider,
  toBase64,
  type ProviderModel,
  type SynthesizeInput,
  type SynthesizeResult,
  type TTSProvider,
} from "@ttsa/provider-sdk";

const ENDPOINT = "https://mars-hf-leaderboard.camb.ai/predict";
const ICON = "/logos/camb.webp";

function key() {
  return env("MARS_API_KEY");
}

export const mars: TTSProvider = {
  id: "mars",
  name: "MARS",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: "mars", name: "MARS" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "MARS: MARS_API_KEY is not set",
        "not_configured",
      );
    }
    const res = await httpFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: { "X-API-Key": k, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input.text,
          language: "en-us",
          only_predefined_voices: true,
        }),
        timeoutMs: 120_000,
      },
      "MARS",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "flac",
      voice: "predefined",
      model: "mars",
    };
  },
};

registerProvider(mars);
registerArenaModels([
  {
    id: "mars",
    name: "MARS",
    url: "https://camb.ai/",
    icon: ICON,
    open: false,
    provider: "mars",
    routerModel: "mars",
    enabled: true,
  },
]);
