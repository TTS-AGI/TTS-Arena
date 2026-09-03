/**
 * Tontaube TTS provider. Rotates a fixed voice set; returns MP4 audio bytes
 * which the router's normalization step transcodes to MP3.
 *
 * MODEL IDENTITY — the endpoint serves one model and takes no model parameter,
 * so anything Tontaube changes upstream silently redefines what this provider
 * returns. Each distinct serving therefore gets its OWN arena id, and a rating
 * never carries across one:
 *
 *   tontaube        V0. Retired 2026.08.31 when V1 replaced it upstream. Its
 *                   voices were dropped at the same time, so every V0 battle
 *                   failed outright rather than quietly serving V1 — which is
 *                   why V0's 567-vote rating still means exactly what it says.
 *   tontaube-v1     V1 as first served. Tontaube later found an output filter
 *                   wasn't being applied and fixed it, materially changing the
 *                   audio, so the votes cast against this serving no longer
 *                   describe anything the endpoint produces.
 *   tontaube-v1-r2  V1 with the filter applied — what we serve today.
 *
 * The last two are the same weights; they are separate entries because they are
 * not the same *output*. Re-baselining on a material output change is symmetric
 * — it applies whether the change helped or hurt — and it only happens while a
 * model is still below the public ranking floor. Past that, a changed endpoint
 * gets a new entry on the board instead of a fresh start.
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
const WEIGHTS_URL = "https://huggingface.co/TontaubeAI/TontaubeV1";

/** TontaubeV1 with the output filter applied — the serving live since 2026.09.03. */
const MODEL_ID = "tontaube-v1-r2";

/** V1 as first served, before the output filter was applied. Retired. */
const UNFILTERED_V1_ID = "tontaube-v1";

/** V0. Retired upstream on 2026.08.31; kept for its rating history. */
const V0_ID = "tontaube";

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
    // Both older entries are disabled, so the router should never ask for one —
    // but refuse explicitly rather than serving today's audio under an id whose
    // rating was earned by different output.
    const model = input.model ?? MODEL_ID;
    if (model !== MODEL_ID) {
      let why: string;
      if (model === V0_ID) {
        why = `"${V0_ID}" (V0) is retired — Tontaube replaced it with V1 upstream on 2026.08.31 and its voices no longer resolve`;
      } else if (model === UNFILTERED_V1_ID) {
        why = `"${UNFILTERED_V1_ID}" is retired — it is V1 as served before Tontaube applied a missing output filter, and that audio can no longer be reproduced`;
      } else {
        why = `unknown model "${model}"`;
      }
      throw new ProviderError(`Tontaube: ${why}`, "unknown_model");
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
    url: WEIGHTS_URL,
    icon: ICON,
    open: true,
    provider: "tontaube",
    routerModel: MODEL_ID,
    enabled: true,
  },
  {
    // Retired: same weights as the entry above, but served before Tontaube
    // applied a missing output filter. They reported the change themselves, so
    // rather than let a rating built on superseded audio follow the model, this
    // entry keeps those votes and the live one starts clean. Disabled — that
    // output no longer exists to serve. The display name distinguishes it in
    // admin; it sits below the public ranking floor, so the board never shows
    // two rows named "Tontaube V1".
    id: UNFILTERED_V1_ID,
    name: "Tontaube V1 (pre-filter-fix)",
    url: WEIGHTS_URL,
    icon: ICON,
    open: true,
    provider: "tontaube",
    routerModel: UNFILTERED_V1_ID,
    enabled: false,
  },
  {
    // Retired: Tontaube shipped V1 over this endpoint and dropped V0's voices,
    // so V0 cannot be served at all — it was failing every battle it was drawn
    // into. Disabled (the router stops offering it) but still registered, so it
    // keeps the rating it earned on the board. The id is permanent; votes key
    // on it.
    id: V0_ID,
    name: "Tontaube V0",
    url: "https://tontaube.ai/",
    icon: ICON,
    open: false,
    provider: "tontaube",
    routerModel: V0_ID,
    enabled: false,
  },
]);
