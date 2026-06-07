/**
 * Gradium TTS provider. Single model, rotates a curated voice list.
 *
 * The API responds with an NDJSON stream (application/x-ndjson): one JSON object
 * per line, either {"type":"text",...} word-timing events or
 * {"type":"audio","audio":"<base64 pcm>"} chunks. The audio is raw headerless
 * PCM (signed 16-bit LE, 48 kHz, mono). We concatenate the chunks and wrap them
 * in a WAV header so the result is a real, playable file.
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

/** Gradium streams raw PCM at this format (no header on the wire). */
const GRADIUM_SAMPLE_RATE = 48_000;

const ENDPOINT = "https://api.gradium.ai/api/post/speech/tts";
const ICON = "/logos/gradium.webp";
const VOICES = [
  "6MFfc37kq0sBjBjy",
  "_6Aslh2DxfmnRLmP",
  "POBHtemksfWQbng0",
  "cLONiZ4hQ8VpQ4Sz",
  "vtG8ddh4IN32Otad",
  "7aEKz4P1ogZ0UsRP",
];

function key() {
  return env("GRADIUM_API_KEY");
}

export const gradium: TTSProvider = {
  id: "gradium",
  name: "Gradium",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: "gradium", name: "Gradium TTS" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Gradium: GRADIUM_API_KEY is not set",
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
        headers: { "x-api-key": k, "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.text, voice_id: voice }),
        timeoutMs: 60_000,
      },
      "Gradium",
    );

    // Parse the NDJSON stream and gather the PCM audio chunks in order.
    const text = await res.text();
    const chunks: Buffer[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: { type?: string; audio?: string };
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue; // skip any partial/non-JSON line
      }
      if (event.type === "audio" && event.audio) {
        chunks.push(Buffer.from(event.audio, "base64"));
      }
    }
    if (chunks.length === 0) {
      throw new ProviderError(
        "Gradium: no audio in response stream",
        "upstream_error",
      );
    }
    const pcm = Buffer.concat(chunks);
    const wav = pcmToWav(pcm, { sampleRate: GRADIUM_SAMPLE_RATE });
    return {
      audioBase64: toBase64(wav),
      extension: "wav",
      voice,
      model: "gradium",
    };
  },
};

registerProvider(gradium);
registerArenaModels([
  {
    id: "gradium",
    name: "Gradium TTS",
    url: "https://gradium.ai/",
    icon: ICON,
    open: false,
    provider: "gradium",
    routerModel: "gradium",
    enabled: true,
  },
]);
