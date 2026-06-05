/**
 * Hume Octave TTS provider. Single model; rotates a small set of named voices;
 * returns MP3.
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

const ENDPOINT = "https://api.hume.ai/v0/tts/file";
const VOICES = [
  "Male English Actor",
  "Female English Actor",
  "Colton Rivers",
  "Ava Song",
];

function key() {
  return env("HUME_API_KEY");
}

export const hume: TTSProvider = {
  id: "hume",
  name: "Hume",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: "octave", name: "Hume Octave" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Hume: HUME_API_KEY is not set",
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
        headers: { "X-Hume-Api-Key": k, "Content-Type": "application/json" },
        body: JSON.stringify({
          utterances: [
            { text: input.text, voice: { name: voice, provider: "HUME_AI" } },
          ],
          format: { type: "mp3" },
          num_generations: 1,
        }),
        timeoutMs: 60_000,
      },
      "Hume",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "mp3",
      voice,
      model: "octave",
    };
  },
};

registerProvider(hume);
registerArenaModels([
  {
    id: "hume-octave",
    name: "Hume Octave",
    url: "https://hume.ai/",
    open: false,
    provider: "hume",
    routerModel: "octave",
    enabled: true,
  },
]);
