/**
 * Gradium TTS provider. Single model, rotates a curated voice list.
 *
 * The API responds with an NDJSON stream (application/x-ndjson): one JSON object
 * per line, either {"type":"text",...} word-timing events or
 * {"type":"audio","audio":"<base64 pcm>"} chunks. The audio is raw headerless
 * PCM (signed 16-bit LE, 48 kHz, mono). We concatenate the chunks and wrap them
 * in a WAV header so the result is a real, playable file.
 *
 * MODEL IDENTITY — read before touching this file.
 *
 * Gradium serves whichever model is their current default; we send no
 * `model_name`, so the model behind this endpoint changes when they ship. It
 * has changed twice: on 2026.08.31 (which silently redefined the original
 * `gradium` entry), and again in 2026.10 — an expressivity update Gradium
 * flagged, confirmed to be served under the same default endpoint (no new
 * identifier). Because a rating only means something if the thing being rated
 * holds still, each superseded entry is retired (kept on the board with the
 * rating it earned, but no longer drawn into battles) and the current model
 * competes as its own entry from zero. So far: `gradium` (pre-2026.08) and
 * `gradium-tts-202608` are retired; `gradium-tts-202610` is live.
 *
 * Their docs list `model_name` as an optional REST body field (default
 * "default"), which would let us pin and stop this recurring — but it is absent
 * from their OpenAPI schema and we have not confirmed it works on this
 * endpoint. If Gradium confirms a stable identifier for this model, send it as
 * `model_name` below; until then, expect to repeat this split on their next
 * default swap.
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

/**
 * The model live since Gradium's 2026.10 expressivity update. Gradium has not
 * published an identifier for it (their dropdown offers only "default"), so this
 * slug is ours, named after the release in their own `gradium-tts-YYYYMM` style.
 */
const MODEL_ID = "gradium-tts-202610";

/**
 * Arena ids of the retired entries, each superseded by a silent default swap.
 * Kept registered for their rating history; the default endpoint no longer
 * serves them, so the router won't offer them and synthesize() rejects them.
 */
const RETIRED_MODEL_IDS = ["gradium", "gradium-tts-202608"] as const;

/** Gradium's recommended English voices for this model (3 female, 3 male). */
const VOICES = [
  "D6COLz20Hw7uh3UK", // US Brooklyn (f)
  "Bla6SbVMczYnOhfK", // US Marlowe (f)
  "4rdlkbxRv4m3UQTW", // UK Tilly (f)
  "_6Aslh2DxfmnRLmP", // US Russell (m)
  "6MFfc37kq0sBjBjy", // US Sterling (m)
  "CF0NgaMwHMMrHZn0", // UK Reuben (m)
];

function key() {
  return env("GRADIUM_API_KEY");
}

export const gradium: TTSProvider = {
  id: "gradium",
  name: "Gradium",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: MODEL_ID, name: "Gradium TTS 2026.10" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Gradium: GRADIUM_API_KEY is not set",
        "not_configured",
      );
    }
    // The retired entries are disabled, so the router should never ask for one —
    // but reject explicitly rather than silently serving the current model under
    // an old model's name.
    const model = input.model ?? MODEL_ID;
    if (model !== MODEL_ID) {
      const retired = (RETIRED_MODEL_IDS as readonly string[]).includes(model);
      throw new ProviderError(
        retired
          ? `Gradium: "${model}" is retired — Gradium replaced it upstream with a new default and it can no longer be served`
          : `Gradium: unknown model "${model}"`,
        "unknown_model",
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
      model: MODEL_ID,
    };
  },
};

registerProvider(gradium);
registerArenaModels([
  {
    id: MODEL_ID,
    name: "Gradium TTS 2026.10",
    url: "https://gradium.ai/",
    icon: ICON,
    open: false,
    provider: "gradium",
    routerModel: MODEL_ID,
    enabled: true,
  },
  {
    // Retired: Gradium's 2026.10 expressivity update replaced the default model
    // underneath this entry, so its rating describes a model that is no longer
    // reachable. Disabled (the router won't offer it) but still registered, so
    // the leaderboard keeps showing what it earned.
    id: "gradium-tts-202608",
    name: "Gradium TTS 2026.08",
    url: "https://gradium.ai/",
    icon: ICON,
    open: false,
    provider: "gradium",
    routerModel: "gradium-tts-202608",
    enabled: false,
  },
  {
    // Retired: Gradium swapped their default model underneath this entry on
    // 2026.08.31, so its rating describes a model that is no longer reachable.
    // Disabled (the router won't offer it) but still registered, so the seed
    // keeps refreshing its name and the leaderboard keeps showing what it
    // earned. The id is permanent — votes key on it — so only the name moves.
    id: "gradium",
    name: "Gradium TTS (pre-2026.08)",
    url: "https://gradium.ai/",
    icon: ICON,
    open: false,
    provider: "gradium",
    routerModel: "gradium",
    enabled: false,
  },
]);
