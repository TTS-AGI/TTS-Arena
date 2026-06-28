/**
 * Hithink (Readify) TTS provider — "Hithink Speech 2.6".
 *
 * Public zero-shot endpoint: POST { text, voiceId } → JSON
 * { code, data: { audio } } where `audio` is base64 of a complete WAV
 * (pcm_s16le, 24 kHz, mono). No API key; availability is gated on the endpoint
 * URL being configured (HITHINK_API_URL) so it only activates where intended.
 *
 * The endpoint occasionally returns a transient code 12001
 * (DISCOVER_RESOURCE_ERROR), so we retry a few times before giving up.
 */
import {
  ProviderError,
  env,
  httpFetch,
  pickRandom,
  registerArenaModels,
  registerProvider,
  type ProviderModel,
  type SynthesizeInput,
  type SynthesizeResult,
  type TTSProvider,
} from "@ttsa/provider-sdk";

const ICON = "/logos/hithink.webp";
const SUCCESS_CODE = 10000;
const MAX_ATTEMPTS = 3;

const VOICES = [
  "prompt_Hiwi",
  "prompt_MinaLe",
  "prompt_PatFlynn",
  "prompt_Aesthetics",
];

function endpoint(): string | undefined {
  return env("HITHINK_API_URL");
}

type HithinkResponse = {
  code?: number;
  msg?: string;
  data?: { audio?: string } | null;
};

export const hithink: TTSProvider = {
  id: "hithink",
  name: "Hithink",
  isAvailable: () => endpoint() !== undefined,
  listModels: (): ProviderModel[] => [
    { id: "hithink-speech-2.6", name: "Hithink Speech 2.6" },
  ],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const url = endpoint();
    if (!url) {
      throw new ProviderError(
        "Hithink: HITHINK_API_URL is not set",
        "not_configured",
      );
    }
    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);

    let lastError = "";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await httpFetch(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ text: input.text, voiceId: voice }),
          timeoutMs: 90_000,
        },
        "Hithink",
      );
      const body = (await res.json()) as HithinkResponse;
      const audio = body.data?.audio;
      if (body.code === SUCCESS_CODE && audio) {
        return {
          audioBase64: audio,
          extension: "wav",
          voice,
          model: "hithink-speech-2.6",
        };
      }
      // Transient backend error (e.g. 12001 DISCOVER_RESOURCE_ERROR) — retry.
      lastError = `code ${body.code ?? "?"}${body.msg ? ` ${body.msg}` : ""}`;
    }
    throw new ProviderError(
      `Hithink: synthesis failed after ${MAX_ATTEMPTS} attempts (${lastError})`,
      "upstream_error",
    );
  },
};

registerProvider(hithink);
registerArenaModels([
  {
    id: "hithink-speech-2.6",
    name: "Hithink Speech 2.6",
    url: "https://readifyai.com/",
    icon: ICON,
    open: false,
    provider: "hithink",
    routerModel: "hithink-speech-2.6",
    enabled: true,
  },
]);
