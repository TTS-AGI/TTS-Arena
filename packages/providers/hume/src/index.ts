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
const ICON = "/logos/hume.webp";
// Hume shared-voice library names. These must match Hume's current catalog
// (HUME_AI provider) — a removed/renamed name 404s the request. "Female English
// Actor" was retired by Hume; the set below was verified against the live API.
const VOICES = [
  "Male English Actor",
  "Classical Film Actress",
  "Warm American Female",
  "Conversational English Guy",
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

    const synth = async (voice: string): Promise<SynthesizeResult> => {
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
    };

    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);
    try {
      return await synth(voice);
    } catch (err) {
      // Hume occasionally retires a shared voice; a stale name 404s. Rather than
      // failing the whole battle, retry once with a different voice from the set.
      const notFound =
        err instanceof ProviderError && /HTTP 404/.test(err.message);
      const alt = VOICES.find((v) => v !== voice);
      if (notFound && alt) return await synth(alt);
      throw err;
    }
  },
};

registerProvider(hume);
registerArenaModels([
  {
    id: "hume-octave",
    name: "Hume Octave",
    url: "https://hume.ai/",
    icon: ICON,
    open: false,
    provider: "hume",
    routerModel: "octave",
    enabled: true,
  },
]);
