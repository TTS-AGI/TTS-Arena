/**
 * Smallest AI TTS provider — Lightning v3.1 Pro. Calls the unified Waves REST
 * endpoint and rotates a small pool of recommended voices.
 *
 * The endpoint advertises content-type audio/wav but actually returns raw
 * headerless PCM (signed 16-bit LE, 44.1 kHz, mono), so we wrap it in a WAV
 * header to get a playable file.
 */
import {
  ProviderError,
  env,
  httpFetch,
  pcmToWav,
  pickRandom,
  registerArenaModels,
  registerProvider,
  toBase64,
  type ProviderModel,
  type SynthesizeInput,
  type SynthesizeResult,
  type TTSProvider,
} from "@ttsa/provider-sdk";

const ENDPOINT = "https://api.smallest.ai/waves/v1/tts";
const ICON = "/logos/smallest.webp";
const MODEL = "lightning_v3.1_pro";
const SAMPLE_RATE = 44_100;

// Smallest's recommended voices for benchmarking (2F, 2M, US/UK).
const VOICES = ["kaitlyn", "sophie", "blake", "sam"];

function key() {
  return env("SMALLEST_API_KEY");
}

export const smallest: TTSProvider = {
  id: "smallest",
  name: "Smallest AI",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "lightning_v3.1_pro", name: "Lightning v3.1 Pro" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Smallest: SMALLEST_API_KEY is not set",
        "not_configured",
      );
    }

    const synth = async (voice: string): Promise<SynthesizeResult> => {
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
            voice_id: voice,
            sample_rate: SAMPLE_RATE,
          }),
          timeoutMs: 90_000,
        },
        "Smallest",
      );
      const pcm = new Uint8Array(await res.arrayBuffer());
      const wav = pcmToWav(pcm, { sampleRate: SAMPLE_RATE });
      return {
        audioBase64: toBase64(wav),
        extension: "wav",
        voice,
        model: MODEL,
      };
    };

    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);
    try {
      return await synth(voice);
    } catch (err) {
      // If a voice ever stops resolving, retry once with a different one so a
      // single bad voice id doesn't fail the whole battle.
      const notFound =
        err instanceof ProviderError && /HTTP 40[34]/.test(err.message);
      const alt = VOICES.find((v) => v !== voice);
      if (notFound && alt) return await synth(alt);
      throw err;
    }
  },
};

registerProvider(smallest);
registerArenaModels([
  {
    id: "lightning-v3.1-pro",
    name: "Lightning v3.1 Pro",
    url: "https://smallest.ai/",
    icon: ICON,
    open: false,
    provider: "smallest",
    routerModel: "lightning_v3.1_pro",
    enabled: true,
  },
]);
