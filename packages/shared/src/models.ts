/**
 * TTS model registry — the single source of truth shared by the web app and
 * the router. Each entry carries display metadata plus the `provider` /
 * `routerModel` pair the router needs to dispatch synthesis.
 *
 * Ported from TTS-Arena-V2 (models.py) and tts-router-v2, restricted to
 * external-API providers (the self-hosted HF Spaces have been dropped).
 */

export type ModelType = "tts" | "conversational";

/** Provider keys understood by the router (see apps/router/src/providers). */
export type ProviderId =
  | "elevenlabs"
  | "cartesia"
  | "hume"
  | "minimax"
  | "playht"
  | "inworld"
  | "papla"
  | "typecast"
  | "gradium"
  | "deepdub"
  | "neuphonic"
  | "async"
  | "vocu"
  | "parmesan"
  | "tontaube"
  | "mars"
  | "veena"
  | "maya1"
  | "chatterbox"
  | "lanternfish"
  | "nls"
  | "wordcab";

export type TTSModel = {
  /** Arena-facing slug (DB primary key), e.g. "eleven-multilingual-v2". */
  id: string;
  /** Display name. */
  name: string;
  type: ModelType;
  /** Open-weights flag (`is_open` upstream). */
  open: boolean;
  /** Eligible to be selected for battles (`is_active` upstream). */
  active: boolean;
  /** Maker/info URL. */
  url: string;
  /** Router provider that synthesizes this model. */
  provider: ProviderId;
  /** Provider-specific model id passed through to the router (null = default). */
  routerModel: string | null;
};

/** The arena roster. Order is the canonical seed order for the database. */
export const MODELS: readonly TTSModel[] = [
  // ── ElevenLabs ───────────────────────────────────────────────────────
  {
    id: "eleven-multilingual-v2",
    name: "Eleven Multilingual v2",
    type: "tts",
    open: false,
    active: true,
    url: "https://elevenlabs.io/",
    provider: "elevenlabs",
    routerModel: "eleven_multilingual_v2",
  },
  {
    id: "eleven-turbo-v2.5",
    name: "Eleven Turbo v2.5",
    type: "tts",
    open: false,
    active: true,
    url: "https://elevenlabs.io/",
    provider: "elevenlabs",
    routerModel: "eleven_turbo_v2_5",
  },
  {
    id: "eleven-flash-v2.5",
    name: "Eleven Flash v2.5",
    type: "tts",
    open: false,
    active: true,
    url: "https://elevenlabs.io/",
    provider: "elevenlabs",
    routerModel: "eleven_flash_v2_5",
  },
  // ── Cartesia ─────────────────────────────────────────────────────────
  {
    id: "cartesia-sonic-2",
    name: "Cartesia Sonic 2",
    type: "tts",
    open: false,
    active: false,
    url: "https://cartesia.ai/",
    provider: "cartesia",
    routerModel: "sonic-2",
  },
  // ── Hume ─────────────────────────────────────────────────────────────
  {
    id: "hume-octave",
    name: "Hume Octave",
    type: "tts",
    open: false,
    active: true,
    url: "https://hume.ai/",
    provider: "hume",
    routerModel: "octave",
  },
  // ── MiniMax ──────────────────────────────────────────────────────────
  {
    id: "minimax-02-hd",
    name: "MiniMax Speech-02-HD",
    type: "tts",
    open: false,
    active: true,
    url: "https://minimax.io/",
    provider: "minimax",
    routerModel: "speech-02-hd",
  },
  {
    id: "minimax-02-turbo",
    name: "MiniMax Speech-02-Turbo",
    type: "tts",
    open: false,
    active: true,
    url: "https://minimax.io/",
    provider: "minimax",
    routerModel: "speech-02-turbo",
  },
  // ── PlayHT ───────────────────────────────────────────────────────────
  {
    id: "playht-2.0",
    name: "PlayHT 2.0",
    type: "tts",
    open: false,
    active: false,
    url: "https://play.ht/",
    provider: "playht",
    routerModel: "PlayHT2.0",
  },
  // ── Inworld ──────────────────────────────────────────────────────────
  {
    id: "inworld",
    name: "Inworld TTS",
    type: "tts",
    open: false,
    active: true,
    url: "https://inworld.ai/tts",
    provider: "inworld",
    routerModel: "inworld-tts-1",
  },
  {
    id: "inworld-max",
    name: "Inworld TTS MAX",
    type: "tts",
    open: false,
    active: true,
    url: "https://inworld.ai/tts",
    provider: "inworld",
    routerModel: "inworld-tts-1-max",
  },
  {
    id: "inworld-max-1.5",
    name: "Inworld TTS 1.5 MAX",
    type: "tts",
    open: false,
    active: true,
    url: "https://inworld.ai/tts",
    provider: "inworld",
    routerModel: "inworld-tts-1.5-max",
  },
  // ── Papla ────────────────────────────────────────────────────────────
  {
    id: "papla-p1",
    name: "Papla P1",
    type: "tts",
    open: false,
    active: true,
    url: "https://papla.media/",
    provider: "papla",
    routerModel: "papla_p1",
  },
  // ── Typecast ─────────────────────────────────────────────────────────
  {
    id: "typecast",
    name: "Typecast SSFM 3.0",
    type: "tts",
    open: false,
    active: true,
    url: "https://typecast.ai/developers/",
    provider: "typecast",
    routerModel: "typecast",
  },
  // ── Gradium ──────────────────────────────────────────────────────────
  {
    id: "gradium",
    name: "Gradium TTS",
    type: "tts",
    open: false,
    active: true,
    url: "https://gradium.ai/",
    provider: "gradium",
    routerModel: "gradium",
  },
  // ── Deepdub ──────────────────────────────────────────────────────────
  {
    id: "deepdub-etts-3.2",
    name: "Deepdub ETTS 3.2",
    type: "tts",
    open: false,
    active: true,
    url: "https://deepdub.ai/",
    provider: "deepdub",
    routerModel: "dd-etts-3.2",
  },
  // ── Neuphonic ────────────────────────────────────────────────────────
  {
    id: "neuphonic",
    name: "NeuTTS Max",
    type: "tts",
    open: false,
    active: true,
    url: "https://neuphonic.ai/",
    provider: "neuphonic",
    routerModel: null,
  },
  // ── async.ai ─────────────────────────────────────────────────────────
  {
    id: "async-1",
    name: "CastleFlow v1.0",
    type: "tts",
    open: false,
    active: true,
    url: "https://async.ai/",
    provider: "async",
    routerModel: null,
  },
  // ── Vocu ─────────────────────────────────────────────────────────────
  {
    id: "vocu",
    name: "Vocu V3.0",
    type: "tts",
    open: false,
    active: true,
    url: "https://vocu.ai/",
    provider: "vocu",
    routerModel: "vocu-balance",
  },
  // ── Parmesan (Phonic) ────────────────────────────────────────────────
  {
    id: "parmesan",
    name: "Parmesan",
    type: "tts",
    open: false,
    active: true,
    url: "https://phonic.co/",
    provider: "parmesan",
    routerModel: "parmesan-base",
  },
  // ── Tontaube ─────────────────────────────────────────────────────────
  {
    id: "tontaube",
    name: "Tontaube",
    type: "tts",
    open: false,
    active: true,
    url: "https://tontaube.ai/",
    provider: "tontaube",
    routerModel: null,
  },
  // ── MARS (camb.ai) ───────────────────────────────────────────────────
  {
    id: "mars",
    name: "MARS",
    type: "tts",
    open: false,
    active: true,
    url: "https://camb.ai/",
    provider: "mars",
    routerModel: "mars",
  },
  // ── Maya Research ────────────────────────────────────────────────────
  {
    id: "veena",
    name: "Veena",
    type: "tts",
    open: true,
    active: true,
    url: "https://mayaresearch.ai/",
    provider: "veena",
    routerModel: null,
  },
  {
    id: "maya1",
    name: "Maya 1",
    type: "tts",
    open: false,
    active: true,
    url: "https://mayaresearch.ai/",
    provider: "maya1",
    routerModel: null,
  },
  // ── Resemble Chatterbox ──────────────────────────────────────────────
  {
    id: "chatterbox",
    name: "Chatterbox",
    type: "tts",
    open: false,
    active: true,
    url: "https://www.resemble.ai/chatterbox/",
    provider: "chatterbox",
    routerModel: null,
  },
  // ── Fish Audio OpenAudio (Lanternfish) ───────────────────────────────
  {
    id: "lanternfish-1",
    name: "OpenAudio S1",
    type: "tts",
    open: false,
    active: false,
    url: "https://fish.audio/",
    provider: "lanternfish",
    routerModel: "lanternfish",
  },
  // ── Alibaba NLS ──────────────────────────────────────────────────────
  {
    id: "nls-pre-v1",
    name: "NLS Pre V1",
    type: "tts",
    open: false,
    active: true,
    url: "https://www.alibabacloud.com/",
    provider: "nls",
    routerModel: "tts-arena",
  },
  // ── Wordcab ──────────────────────────────────────────────────────────
  {
    id: "wordcab",
    name: "Wordcab TTS",
    type: "tts",
    open: false,
    active: true,
    url: "https://wordcab.com/",
    provider: "wordcab",
    routerModel: null,
  },
];

const MODELS_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): TTSModel | undefined {
  return MODELS_BY_ID.get(id);
}

export function activeModels(type: ModelType): TTSModel[] {
  return MODELS.filter((m) => m.type === type && m.active);
}

/**
 * Pick two distinct active models of a type. `rand` defaults to Math.random
 * but is injectable for deterministic selection/tests. Throws if fewer than
 * two active models exist for the type.
 */
export function pickPair(
  type: ModelType,
  rand: () => number = Math.random,
): [TTSModel, TTSModel] {
  const pool = activeModels(type);
  if (pool.length < 2) {
    throw new Error(
      `Need at least 2 active ${type} models, have ${pool.length}`,
    );
  }
  const i = Math.floor(rand() * pool.length);
  let j = Math.floor(rand() * pool.length);
  if (j === i) j = (j + 1) % pool.length;
  // pool[i]/pool[j] are defined: i,j are in range and pool has >= 2 entries.
  return [pool[i]!, pool[j]!];
}

/**
 * Weighted pick of `n` distinct active models, mirroring upstream
 * `get_weighted_random_models`: weight = 1 / (voteCount + 500), so
 * low-exposure models are surfaced slightly more often. `voteCounts` maps
 * model id → number of prior appearances.
 */
export function weightedPick(
  type: ModelType,
  n: number,
  voteCounts: Record<string, number>,
  rand: () => number = Math.random,
): TTSModel[] {
  const SMOOTHING = 500;
  const pool = activeModels(type);
  if (pool.length < n) {
    throw new Error(`Need ${n} active ${type} models, have ${pool.length}`);
  }
  const remaining = [...pool];
  const picked: TTSModel[] = [];
  for (let k = 0; k < n; k++) {
    const weights = remaining.map(
      (m) => 1 / ((voteCounts[m.id] ?? 0) + SMOOTHING),
    );
    const total = weights.reduce((s, w) => s + w, 0);
    let r = rand() * total;
    let idx = 0;
    for (let w = 0; w < weights.length; w++) {
      r -= weights[w]!;
      if (r <= 0) {
        idx = w;
        break;
      }
    }
    picked.push(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  return picked;
}

/**
 * Fallback prompts (public-domain Harvard sentences + a few neutral lines).
 * The live arena draws from the HF `TTS-AGI/arena-prompts` dataset; these
 * cover offline/dev and the UI "random line" button.
 */
export const PROMPTS: readonly string[] = [
  "The birch canoe slid on the smooth planks.",
  "Glue the sheet to the dark blue background.",
  "It's easy to tell the depth of a well.",
  "These days a chicken leg is a rare dish.",
  "The juice of lemons makes fine punch.",
  "The box was thrown beside the parked truck.",
  "Four hours of steady work faced us.",
  "The boy was there when the sun rose.",
  "A rod is used to catch pink salmon.",
  "The source of the huge river is the clear spring.",
  "Kick the ball straight and follow through.",
  "Help the woman get back to her feet.",
  "A pot of tea helps to pass the evening.",
  "Smoky fires lack flame and heat.",
  "The soft cushion broke the man's fall.",
  "Wait — did you really say the meeting got moved again?",
  "Honestly, that might be the best coffee I've had all year.",
  "Breaking news: scientists confirm water once flowed on Mars.",
  "She whispered that she thought we were being followed.",
  "The northern lights shimmered green and violet over the lake.",
];

export function randomPrompt(rand: () => number = Math.random): string {
  return PROMPTS[Math.floor(rand() * PROMPTS.length)]!;
}

/* ── Seeded RNG + waveform (UI rendering; deterministic for SSR) ───────── */

/** Deterministic 0–1 PRNG from a string seed (mulberry-style). */
export function seededRandom(seed: string): () => number {
  const s = String(seed ?? "");
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^= h >>> 16) >>> 0;
    return h / 4294967296;
  };
}

/** Stable waveform amplitudes (0–1) for a seed, shaped like speech. */
export function makeWaveform(seed: string, bars = 56): number[] {
  const rand = seededRandom(seed);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const t = i / (bars - 1);
    const envelope = Math.sin(t * Math.PI) * 0.6 + 0.4;
    out.push(Math.max(0.06, Math.min(1, rand() * envelope)));
  }
  return out;
}
