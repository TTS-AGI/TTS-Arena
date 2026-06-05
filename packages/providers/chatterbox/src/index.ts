/**
 * Resemble Chatterbox TTS provider. Wraps text in SSML, rotates a fixed voice
 * set, and returns the base64 audio the API includes in its JSON response.
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

const ENDPOINT = "https://p.cluster.resemble.ai/synthesize";
const VOICES = ["4e228dba", "01bcc102", "ecbe5d97", "ae8223ca"];

function key() {
  return env("CHATTERBOX_API_KEY");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const chatterbox: TTSProvider = {
  id: "chatterbox",
  name: "Chatterbox",
  isAvailable: () => key() !== undefined,
  listModels: (): ProviderModel[] => [{ id: "chatterbox", name: "Chatterbox" }],
  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const k = key();
    if (!k) {
      throw new ProviderError(
        "Chatterbox: CHATTERBOX_API_KEY is not set",
        "not_configured",
      );
    }
    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);
    const ssml = input.text.trim().startsWith("<speak")
      ? input.text
      : `<speak exaggeration="0.6">${escapeXml(input.text)}</speak>`;

    const res = await httpFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: { Authorization: k, "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_uuid: voice,
          data: ssml,
          output_format: "wav",
        }),
        timeoutMs: 60_000,
      },
      "Chatterbox",
    );
    const json = (await res.json()) as { audio_content?: string };
    if (!json.audio_content) {
      throw new ProviderError(
        "Chatterbox: response missing audio_content",
        "upstream_error",
      );
    }
    return {
      audioBase64: json.audio_content, // already base64
      extension: "wav",
      voice,
      model: "chatterbox",
    };
  },
};

registerProvider(chatterbox);
registerArenaModels([
  {
    id: "chatterbox",
    name: "Chatterbox",
    url: "https://www.resemble.ai/chatterbox/",
    open: false,
    provider: "chatterbox",
    routerModel: "chatterbox",
    enabled: true,
  },
]);
