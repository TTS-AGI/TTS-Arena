/**
 * Unisound U2-TTS.
 *
 * Submitted for blind evaluation under the codename "uni-tts-preview" and
 * revealed on 2026.09.02 after clearing the vote threshold. The arena id is
 * still `uni-tts-preview` and must stay that way — votes key on it, and this
 * model carries several hundred of them. Only the display metadata changed.
 *
 * The endpoint comes from UNI_BASE_URL rather than a constant on purpose: the
 * vendor serves it from a bare IP that has already rotated once, so a rotation
 * must be a secret update, not a code change. The env names are still UNI_*
 * from the codenamed era; they are secrets on the Space, so renaming them means
 * re-provisioning rather than an edit here.
 *
 * SECURITY: the endpoint is plain HTTP. The request — bearer token included —
 * crosses the wire in cleartext, so treat UNI_API_KEY as exposed to any on-path
 * observer. TLS has been requested from the vendor.
 *
 * Everything except the text is fixed by the vendor: one voice, 22.05 kHz, WAV,
 * English. Returns raw WAV bytes.
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

/**
 * Permanent arena slug, inherited from the pre-release codename. Ratings and
 * votes reference it, so it cannot be renamed without a DB migration.
 */
const MODEL_ID = "uni-tts-preview";

/** Public model name, as the vendor asked it be shown. */
const DISPLAY_NAME = "U2-TTS";

/** Upstream model id sent in the request body. */
const UPSTREAM_MODEL = "u2-tts";

/** The vendor currently exposes exactly one voice. */
const VOICES = ["jane"];

/** Vendor-fixed output settings — only the input text is configurable. */
const SAMPLE_RATE = 22050;
const LANGUAGE = "en";

function cfg() {
  const baseUrl = env("UNI_BASE_URL");
  const apiKey = env("UNI_API_KEY");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export const unisound: TTSProvider = {
  id: "unisound",
  name: "Unisound",
  isAvailable: () => cfg() !== null,
  listModels: (): ProviderModel[] => [{ id: MODEL_ID, name: DISPLAY_NAME }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const c = cfg();
    if (!c) {
      throw new ProviderError(
        `${DISPLAY_NAME}: UNI_BASE_URL / UNI_API_KEY not set`,
        "not_configured",
      );
    }
    const model = input.model ?? MODEL_ID;
    if (model !== MODEL_ID) {
      throw new ProviderError(
        `${DISPLAY_NAME}: unknown model "${model}"`,
        "unknown_model",
      );
    }
    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);

    const res = await httpFetch(
      c.baseUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: UPSTREAM_MODEL,
          text: input.text,
          voice_setting: { voice_id: voice, language: LANGUAGE },
          audio_setting: { sample_rate: SAMPLE_RATE, format: "wav" },
        }),
        timeoutMs: 90_000,
      },
      DISPLAY_NAME,
    );

    const audio = new Uint8Array(await res.arrayBuffer());
    // The endpoint is a bespoke deployment; guard against it answering 200 with
    // a JSON error body, which would otherwise be served to voters as "audio"
    // and silently poison the ratings.
    const riff = String.fromCharCode(...audio.slice(0, 4));
    if (audio.byteLength < 44 || riff !== "RIFF") {
      throw new ProviderError(
        `${DISPLAY_NAME}: expected WAV bytes, got ${audio.byteLength}B starting "${riff}"`,
        "upstream_error",
      );
    }

    return {
      audioBase64: toBase64(audio),
      extension: "wav",
      voice,
      model: MODEL_ID,
    };
  },
};

registerProvider(unisound);

registerArenaModels([
  {
    id: MODEL_ID,
    name: DISPLAY_NAME,
    url: "https://www.unisound.com/",
    icon: "/logos/unisound.webp",
    open: false,
    provider: "unisound",
    routerModel: MODEL_ID,
    enabled: true,
  },
]);
