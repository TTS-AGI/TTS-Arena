/**
 * Rumik TTS provider — Silk Mulberry 1.5.
 *
 * POST https://silk-api.rumik.ai/v1/tts with a Bearer key. The mulberry model is
 * steered by a natural-language `description` rather than a preset speaker.
 * Per Rumik (their engineer): the model defaults to an Indian accent, so the
 * description must request "american accent." for English-arena evaluation, and
 * max_new_tokens is raised to the API max (8192) so longer prompts aren't
 * truncated. Returns a 24 kHz mono WAV.
 */
import {
  ProviderError,
  env,
  httpFetch,
  registerArenaModels,
  registerProvider,
  toBase64,
  type ProviderModel,
  type SynthesizeInput,
  type SynthesizeResult,
  type TTSProvider,
} from "@ttsa/provider-sdk";

const ENDPOINT = "https://silk-api.rumik.ai/v1/tts";
const ICON = "/logos/rumik.webp";
const MODEL = "mulberry";
// Rumik-specified voice steering (see file header).
const DESCRIPTION = "american accent.";
const MAX_NEW_TOKENS = 8192;

function key() {
  return env("RUMIK_API_KEY");
}

export const rumik: TTSProvider = {
  id: "rumik",
  name: "Rumik",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "silk-mulberry-1.5", name: "Silk Mulberry 1.5" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Rumik: RUMIK_API_KEY is not set",
        "not_configured",
      );
    }
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
          description: DESCRIPTION,
          max_new_tokens: MAX_NEW_TOKENS,
        }),
        timeoutMs: 120_000,
      },
      "Rumik",
    );
    return {
      audioBase64: toBase64(await res.arrayBuffer()),
      extension: "wav",
      voice: DESCRIPTION,
      model: "silk-mulberry-1.5",
    };
  },
};

registerProvider(rumik);
registerArenaModels([
  {
    id: "silk-mulberry-1.5",
    name: "Silk Mulberry 1.5",
    url: "https://rumik.ai/",
    icon: ICON,
    open: false,
    provider: "rumik",
    routerModel: "silk-mulberry-1.5",
    enabled: true,
  },
]);
