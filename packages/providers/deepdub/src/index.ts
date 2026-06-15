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

// Deepdub's official recommended voices (provided by Deepdub). Rotated across
// battles. NOTE: do not substitute SDK/CLI demo prompt ids here — those are
// generic placeholders and don't represent the model.
const VOICES = [
  "26c5f982-e80b-4252-b4c2-bd7e118fcd72_prompt-reading-neutral", // Samuel Gray
  "776aa833-fc77-4eac-9203-13da9021030c_prompt-reading-neutral", // Roy Rivera
  "8a12db1b-6c6d-4474-b8cf-3c0c2d3b105e_reading-neutral", // Terry Wood
  "337e4733-acc7-4bb8-aef8-6e9404c8b874", // Heather Long
  "33f02485-049f-4436-b6b7-0aaa7c7ff5d5_reading-neutral", // Anne Phillips
  "b532c72a-662a-41b7-8470-68c34181b734_reading-neutral", // Denise Cox
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
