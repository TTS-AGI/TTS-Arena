/**
 * Deepdub TTS provider (eTTS 3.2). Calls Deepdub's REST endpoint directly — no
 * client library — and rotates a small pool of preset prompt voices. Returns
 * MP3 bytes.
 *
 * The Python SDK exposes streaming over websockets, but there's a plain
 * `POST /api/v1/tts` underneath that returns the audio in one response, which is
 * all the arena needs.
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

const ENDPOINT = "https://restapi.deepdub.ai/api/v1/tts";
const ICON = "/logos/deepdub.webp";
const MODEL = "dd-etts-3.2";
const LOCALE = "en-US";

// Deepdub preset voice prompt ids. Rotated across battles.
const VOICES = [
  "26c5f982-e80b-4252-b4c2-bd7e118fcd72_prompt-reading-neutral",
  "5d3dc622-69bd-4c00-9513-05df47dbdea6_authoritative",
];

function key() {
  return env("DEEPDUB_API_KEY");
}

export const deepdub: TTSProvider = {
  id: "deepdub",
  name: "Deepdub",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "dd-etts-3.2", name: "Deepdub eTTS 3.2" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Deepdub: DEEPDUB_API_KEY is not set",
        "not_configured",
      );
    }

    const synth = async (voice: string): Promise<SynthesizeResult> => {
      const res = await httpFetch(
        ENDPOINT,
        {
          method: "POST",
          headers: { "x-api-key": k, "Content-Type": "application/json" },
          body: JSON.stringify({
            targetText: input.text,
            model: MODEL,
            voicePromptId: voice,
            locale: LOCALE,
            temperature: 1.0,
            variance: 0.75,
            promptBoost: true,
            format: "mp3",
          }),
          timeoutMs: 90_000,
        },
        "Deepdub",
      );
      return {
        audioBase64: toBase64(await res.arrayBuffer()),
        extension: "mp3",
        voice,
        model: "dd-etts-3.2",
      };
    };

    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);
    try {
      return await synth(voice);
    } catch (err) {
      // If a preset voice ever stops resolving, retry once with another so a
      // single bad voice id doesn't fail the whole battle.
      const notFound =
        err instanceof ProviderError && /HTTP 40[34]/.test(err.message);
      const alt = VOICES.find((v) => v !== voice);
      if (notFound && alt) return await synth(alt);
      throw err;
    }
  },
};

registerProvider(deepdub);
registerArenaModels([
  {
    id: "deepdub-etts-3.2",
    name: "Deepdub eTTS 3.2",
    url: "https://deepdub.ai/",
    icon: ICON,
    open: false,
    provider: "deepdub",
    routerModel: "dd-etts-3.2",
    enabled: true,
  },
]);
