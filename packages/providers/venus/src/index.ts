/**
 * Venus — codenamed arena entry.
 *
 * Submitted for blind evaluation under the codename "Venus". It is anonymous to
 * voters, not to us: we know the provider, but their real identity is kept off
 * this (public) repo on purpose and lives only in our private records. Per the
 * submission, anonymity is bounded to one calendar month from the day the entry
 * goes live; after that the entry is revealed. The arena id below is "venus"
 * and must stay that way even after the reveal — ratings and votes key on it,
 * so only the display metadata (name/url/icon) changes on reveal, never the id.
 *
 * The stealth mark on the leaderboard (ghost logo + "stealth model" modal) is
 * driven entirely by the arena entry's icon being "/logos/stealth.webp"; there
 * is no separate flag. Swapping that icon for the real logo is the reveal.
 *
 * The endpoint and key come from VENUS_BASE_URL / VENUS_API_KEY (Space secrets)
 * rather than constants: no endpoint URL or credential appears in the source,
 * and a rotation is a secret update, not a code change.
 *
 * Contract: POST {base}/tts, bearer auth, JSON { text, voice_id }. Returns raw
 * WAV bytes (24 kHz, mono, PCM16). Fixed pool of six voices, v01–v06; when the
 * caller doesn't pin one we pick at random.
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
 * Permanent arena slug (the public codename). Ratings and votes reference it,
 * so it cannot be renamed without a DB migration — it stays "venus" even after
 * the model is revealed.
 */
const MODEL_ID = "venus";

/** Codename shown to voters. */
const DISPLAY_NAME = "Venus";

/** Vendor-fixed pool of voices. Arena does no zero-shot cloning. */
const VOICES = ["v01", "v02", "v03", "v04", "v05", "v06"];

function cfg() {
  const baseUrl = env("VENUS_BASE_URL");
  const apiKey = env("VENUS_API_KEY");
  if (!baseUrl || !apiKey) return null;
  // Tolerate a trailing slash on the configured base.
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

export const venus: TTSProvider = {
  id: "venus",
  name: "Venus",
  isAvailable: () => cfg() !== null,
  listModels: (): ProviderModel[] => [{ id: MODEL_ID, name: DISPLAY_NAME }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const c = cfg();
    if (!c) {
      throw new ProviderError(
        `${DISPLAY_NAME}: VENUS_BASE_URL / VENUS_API_KEY not set`,
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
      `${c.baseUrl}/tts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: input.text, voice_id: voice }),
        timeoutMs: 90_000,
      },
      DISPLAY_NAME,
    );

    const audio = new Uint8Array(await res.arrayBuffer());
    // Guard against the endpoint answering 200 with a JSON error body, which
    // would otherwise be served to voters as "audio" and silently poison the
    // ratings.
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

registerProvider(venus);

registerArenaModels([
  {
    id: MODEL_ID,
    name: DISPLAY_NAME,
    // Stealth entries never render a link; keep this non-identifying.
    url: "https://ttsarena.org",
    // The ghost logo is what marks this row as a stealth/codenamed model.
    icon: "/logos/stealth.webp",
    open: false,
    provider: "venus",
    routerModel: MODEL_ID,
    enabled: true,
  },
]);
