/**
 * MiniMax (Hailuo) TTS provider.
 *
 * Importing this module registers the provider. Models are a fixed catalogue;
 * the API returns audio as a hex string under `data.audio`, which we decode
 * and re-encode as base64. A voice is chosen at random and reported back.
 *
 * Docs: https://www.minimax.io/platform/document/T2A%20V2
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

const ENDPOINT = "https://api.minimaxi.chat/v1/t2a_v2";
const DEFAULT_MODEL = "speech-2.6-hd";

// Valid MiniMax model ids (verified against the API). The older tier is
// `speech-02-*`, not `speech-2.5-*` (those ids don't exist and return no audio).
const MODELS: ProviderModel[] = [
  { id: "speech-2.8-hd", name: "Hailuo Speech 2.8 HD" },
  { id: "speech-2.8-turbo", name: "Hailuo Speech 2.8 Turbo" },
  { id: "speech-2.6-hd", name: "Hailuo Speech 2.6 HD" },
  { id: "speech-2.6-turbo", name: "Hailuo Speech 2.6 Turbo" },
  { id: "speech-02-hd", name: "Hailuo Speech 02 HD" },
  { id: "speech-02-turbo", name: "Hailuo Speech 02 Turbo" },
];

// MiniMax exposes a large managed voice pool; this is a curated subset we
// rotate through so per-voice stats are meaningful.
const VOICES = [
  "English_Sweet_Female_4",
  "English_Gentle-voiced_man",
  "English_Graceful_Lady",
  "English_ReservedYoungMan",
];

function creds(): { apiKey: string; groupId: string } | null {
  const apiKey = env("MINIMAX_API_KEY");
  const groupId = env("MINIMAX_GROUP_ID");
  if (!apiKey || !groupId) return null;
  return { apiKey, groupId };
}

/** Decode a hex string to bytes. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export const minimax: TTSProvider = {
  id: "minimax",
  name: "MiniMax",

  isAvailable() {
    return creds() !== null;
  },

  listModels() {
    return creds() ? MODELS : [];
  },

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const c = creds();
    if (!c) {
      throw new ProviderError(
        "MiniMax: MINIMAX_API_KEY / MINIMAX_GROUP_ID are not set",
        "not_configured",
      );
    }

    const model = input.model ?? DEFAULT_MODEL;
    if (!MODELS.some((m) => m.id === model)) {
      throw new ProviderError(
        `MiniMax: unknown model "${model}"`,
        "unknown_model",
      );
    }
    const voice =
      input.voice && VOICES.includes(input.voice)
        ? input.voice
        : pickRandom(VOICES);

    const res = await httpFetch(
      `${ENDPOINT}?GroupId=${encodeURIComponent(c.groupId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          text: input.text,
          stream: false,
          voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0 },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1,
          },
        }),
        timeoutMs: 60_000,
      },
      "MiniMax",
    );

    const json = (await res.json()) as { data?: { audio?: string } };
    const hex = json.data?.audio;
    if (!hex) {
      throw new ProviderError(
        "MiniMax: response missing data.audio",
        "upstream_error",
      );
    }

    return {
      audioBase64: toBase64(hexToBytes(hex)),
      extension: "mp3",
      voice,
      model,
    };
  },
};

registerProvider(minimax);

const ICON = "/logos/minimax.svg";

registerArenaModels([
  {
    id: "minimax-speech-2.8-hd",
    name: "MiniMax Speech 2.8 HD",
    url: "https://minimax.io/",
    icon: ICON,
    open: false,
    provider: "minimax",
    routerModel: "speech-2.8-hd",
    enabled: true,
  },
  {
    id: "minimax-speech-2.8-turbo",
    name: "MiniMax Speech 2.8 Turbo",
    url: "https://minimax.io/",
    icon: ICON,
    open: false,
    provider: "minimax",
    routerModel: "speech-2.8-turbo",
    enabled: true,
  },
  {
    id: "minimax-speech-2.6-hd",
    name: "MiniMax Speech 2.6 HD",
    url: "https://minimax.io/",
    icon: ICON,
    open: false,
    provider: "minimax",
    routerModel: "speech-2.6-hd",
    enabled: true,
  },
  {
    id: "minimax-speech-2.6-turbo",
    name: "MiniMax Speech 2.6 Turbo",
    url: "https://minimax.io/",
    icon: ICON,
    open: false,
    provider: "minimax",
    routerModel: "speech-2.6-turbo",
    enabled: true,
  },
  {
    id: "minimax-speech-02-hd",
    name: "MiniMax Speech 02 HD",
    url: "https://minimax.io/",
    icon: ICON,
    open: false,
    provider: "minimax",
    routerModel: "speech-02-hd",
    enabled: true,
  },
  {
    id: "minimax-speech-02-turbo",
    name: "MiniMax Speech 02 Turbo",
    url: "https://minimax.io/",
    icon: ICON,
    open: false,
    provider: "minimax",
    routerModel: "speech-02-turbo",
    enabled: true,
  },
]);
