/**
 * Provider SDK — the contract every TTS provider implements and the result it
 * returns. Kept dependency-free so public *and* private provider packages can
 * depend on it without pulling in the router or web app.
 */

/** A voice a provider can speak with. `id` is provider-scoped. */
export type Voice = {
  id: string;
  name?: string;
};

/** A model a provider exposes (a provider may expose several). */
export type ProviderModel = {
  id: string;
  name: string;
  description?: string;
};

export type SynthesizeInput = {
  text: string;
  /** Provider-specific model id; null/undefined means the provider default. */
  model?: string | null;
  /**
   * Optional explicit voice. When omitted the provider picks one (usually at
   * random from its pool) and MUST report it back in the result so the arena
   * can track per-voice performance.
   */
  voice?: string | null;
};

export type SynthesizeResult = {
  /** Base64-encoded audio. */
  audioBase64: string;
  /** Container/extension, e.g. "mp3" | "wav". */
  extension: string;
  /** The voice actually used (provider-scoped id), for per-voice stats. */
  voice: string;
  /** The model actually used (resolved from input or default). */
  model: string;
};

/**
 * A TTS provider. Implementations are typically a single object literal
 * registered via `registerProvider`. `synthesize` is the only hot path; the
 * rest is metadata/health.
 */
export type TTSProvider = {
  /** Stable registry key clients send as `provider` (lowercase). */
  readonly id: string;
  /** Human-readable provider name. */
  readonly name: string;

  /**
   * True when the provider has the configuration it needs (API keys, etc.).
   * Unavailable providers stay registered but are skipped by `/providers` and
   * rejected by `/tts` with a clear error.
   */
  isAvailable(): boolean;

  /** Models this provider can serve (may be static or fetched/cached). */
  listModels(): Promise<ProviderModel[]> | ProviderModel[];

  /** Synthesize speech. Throws ProviderError on failure. */
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
};

/** Typed error so the router can distinguish config vs upstream failures. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_configured"
      | "unknown_model"
      | "upstream_error"
      | "invalid_input" = "upstream_error",
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
