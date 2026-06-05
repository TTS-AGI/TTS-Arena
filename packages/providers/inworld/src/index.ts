/**
 * Inworld TTS provider. Basic auth, rotates a fixed speaker set, returns the
 * base64 audio the API includes in its JSON response. The arena exposes three
 * engine models (TTS 1, MAX, 1.5 MAX) via routerModel.
 */
import {
  ProviderError,
  env,
  httpFetch,
  pickRandom,
  registerArenaModels,
  registerProvider,
  type ProviderModel,
  type SynthesizeInput,
  type SynthesizeResult,
  type TTSProvider,
} from "@ttsa/provider-sdk";

const ENDPOINT = "https://api.inworld.ai/tts/v1/voice";
const DEFAULT_MODEL = "inworld-tts-1";
const VOICES = [
  "Alex",
  "Olivia",
  "Mark",
  "Ashley",
  "Deborah",
  "Ronald",
  "Dennis",
  "Theodore",
  "Wendy",
  "Craig",
];

function key() {
  return env("INWORLD_API_KEY");
}

export const inworld: TTSProvider = {
  id: "inworld",
  name: "Inworld",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "inworld-tts-1", name: "Inworld TTS" },
    { id: "inworld-tts-1-max", name: "Inworld TTS MAX" },
    { id: "inworld-tts-1.5-max", name: "Inworld TTS 1.5 MAX" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Inworld: INWORLD_API_KEY is not set",
        "not_configured",
      );
    }
    const model = input.model ?? DEFAULT_MODEL;
    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);
    const res = await httpFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${k}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: input.text,
          voiceId: voice,
          modelId: model,
        }),
        timeoutMs: 60_000,
      },
      "Inworld",
    );
    const json = (await res.json()) as { audioContent?: string };
    if (!json.audioContent) {
      throw new ProviderError(
        "Inworld: response missing audioContent",
        "upstream_error",
      );
    }
    return {
      audioBase64: json.audioContent, // base64 wav
      extension: "wav",
      voice,
      model,
    };
  },
};

registerProvider(inworld);
registerArenaModels([
  {
    id: "inworld",
    name: "Inworld TTS",
    url: "https://inworld.ai/tts",
    open: false,
    provider: "inworld",
    routerModel: "inworld-tts-1",
    enabled: true,
  },
  {
    id: "inworld-max",
    name: "Inworld TTS MAX",
    url: "https://inworld.ai/tts",
    open: false,
    provider: "inworld",
    routerModel: "inworld-tts-1-max",
    enabled: true,
  },
  {
    id: "inworld-max-1.5",
    name: "Inworld TTS 1.5 MAX",
    url: "https://inworld.ai/tts",
    open: false,
    provider: "inworld",
    routerModel: "inworld-tts-1.5-max",
    enabled: true,
  },
]);
