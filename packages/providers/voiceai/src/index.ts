/**
 * Voice.ai TTS provider. POSTs JSON to the Voice.ai TTS endpoint and gets raw
 * MP3 bytes back. A fixed set of curated voices (female + male) is rotated per
 * request. Stays inert until VOICEAI_API_KEY is present.
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

const ENDPOINT = "https://dev.voice.ai/api/v1/tts/speech";
const MODEL = "voiceai-tts-v1-latest";
const ICON = "/logos/voiceai.webp";

/** Curated voice ids supplied by Voice.ai (female + male). */
const VOICES = [
  // Female
  "d1bf0f33-8e0e-4fbf-acf8-45c3c6262513", // Ellie
  "c22f0e4c-e437-4877-9fce-09d33336ca92", // Lauren
  "44de4286-f7aa-4216-845f-807103e33ac8", // Emma
  "e16986bd-1ce9-4c1c-88e7-bbe02b1340d1", // Alicia
  "8dc5fae7-35f9-4040-af4c-7c5c8368e8a4", // Jamie
  "559d3b72-3e79-4f11-9b62-9ec702a6c057", // Evie
  // Male
  "49f8497a-3cb2-4db8-bf94-1c0785fe5e87", // Lachlan
  "c9530f8a-dcb5-4db3-aed0-690694247a1a", // Matt
  "567bace0-2fee-4585-856d-292c8caf71db", // Dalton
  "dbb271df-db25-4225-abb0-5200ba1426bc", // James
];

function key() {
  return env("VOICEAI_API_KEY");
}

export const voiceai: TTSProvider = {
  id: "voiceai",
  name: "Voice.ai",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "voiceai-tts-v1", name: "Voice.ai Text to Speech V1" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Voice.ai: VOICEAI_API_KEY is not set",
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
          language: "en",
          voice_id: voice,
          format: "mp3",
        }),
        timeoutMs: 90_000,
      },
      "Voice.ai",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "mp3",
      voice,
      model: "voiceai-tts-v1",
    };
  },
};

registerProvider(voiceai);
registerArenaModels([
  {
    id: "voiceai-tts-v1",
    name: "Voice.ai Text to Speech V1",
    url: "https://voice.ai/",
    icon: ICON,
    open: false,
    provider: "voiceai",
    routerModel: MODEL,
    enabled: true,
  },
]);
