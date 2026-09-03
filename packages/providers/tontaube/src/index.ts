/**
 * Tontaube TTS provider. Rotates a fixed voice set; returns MP4 audio bytes
 * which the router's normalization step transcodes to MP3.
 *
 * MODEL IDENTITY — the endpoint serves one model and takes no model parameter,
 * so shipping a new model upstream redefines what this provider returns.
 * Tontaube did that on 2026.08.31 (V0 -> V1, now open-weight) and retired V0's
 * voices at the same time, which made every V0 battle fail rather than quietly
 * serve V1 — so V0's rating is untouched and still means what it says. V0 is
 * kept on the board with that rating but disabled, because there is no longer
 * any way to serve it; V1 competes as its own entry from zero.
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

const ENDPOINT = "https://api.tontaube.ai/tts/arena";
const ICON = "/logos/tontaube.webp";

/** TontaubeV1, open-weight, live since 2026.08.31. */
const MODEL_ID = "tontaube-v1";

/** The arena id of the retired V0 entry. Kept for its rating history. */
const LEGACY_MODEL_ID = "tontaube";

/** V1's full voice set. Tontaube retired V0's voices when they shipped it. */
const VOICES = ["nora", "elias", "marcus"];

function key() {
  return env("TONTAUBE_API_KEY");
}

export const tontaube: TTSProvider = {
  id: "tontaube",
  name: "Tontaube",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: MODEL_ID, name: "Tontaube V1" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Tontaube: TONTAUBE_API_KEY is not set",
        "not_configured",
      );
    }
    // V0 is disabled, so the router should never ask for it — but refuse it
    // explicitly rather than serving V1 under V0's name.
    const model = input.model ?? MODEL_ID;
    if (model !== MODEL_ID) {
      throw new ProviderError(
        model === LEGACY_MODEL_ID
          ? `Tontaube: "${LEGACY_MODEL_ID}" (V0) is retired — Tontaube replaced it with V1 upstream on 2026.08.31 and its voices no longer resolve`
          : `Tontaube: unknown model "${model}"`,
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
        headers: { "X-Api-Key": k, "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.text, voice }),
        timeoutMs: 90_000,
      },
      "Tontaube",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "mp4",
      voice,
      model: MODEL_ID,
    };
  },
};

registerProvider(tontaube);
registerArenaModels([
  {
    id: MODEL_ID,
    name: "Tontaube V1",
    // Open-weight release, so point at the weights rather than the homepage —
    // that's the useful destination for a model badged "open".
    url: "https://huggingface.co/TontaubeAI/TontaubeV1",
    icon: ICON,
    open: true,
    provider: "tontaube",
    routerModel: MODEL_ID,
    enabled: true,
  },
  {
    // Retired: Tontaube shipped V1 over this endpoint and dropped V0's voices,
    // so V0 cannot be served at all — it was failing every battle it was drawn
    // into. Disabled (the router stops offering it) but still registered, so it
    // keeps the rating it earned on the board. The id is permanent; votes key
    // on it.
    id: LEGACY_MODEL_ID,
    name: "Tontaube V0",
    url: "https://tontaube.ai/",
    icon: ICON,
    open: false,
    provider: "tontaube",
    routerModel: LEGACY_MODEL_ID,
    enabled: false,
  },
]);
