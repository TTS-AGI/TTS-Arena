/**
 * Public anti-fraud contracts.
 *
 * These are the result/param shapes the arena passes across the seam — generic
 * risk output, not detection tactics. The scoring and thresholds that produce
 * them live in the private impl (TTS-AGI/Antifraud), cloned into ./impl at
 * deploy time.
 */
import type { UserRow } from "@/server/db/schema";

export type Severity = "info" | "warn" | "critical";

/** The outcome of an inline vote assessment. */
export type Assessment = {
  /** 0 = clean; higher = more suspicious. */
  riskScore: number;
  /** Reason codes that contributed to the score (audit trail). */
  reasons: string[];
  /** True → hard reject the vote. */
  block: boolean;
  /** True → store the vote but don't count it toward ratings (shadow exclude). */
  flag: boolean;
};

/** Inputs to an inline vote assessment. */
export type AssessParams = {
  user: UserRow;
  req: Request;
  /** Seconds between generation and the vote. */
  durationSeconds: number;
  fingerprint: string | null;
  captchaRequired: boolean;
  captchaOk: boolean;
};

/**
 * A per-request collector script.
 *
 * The public arena treats this as an opaque JavaScript body plus whatever
 * response headers the impl wants set. What the script measures, and how it is
 * built or encoded, is private — the arena only serves it.
 */
export type CollectorScript = {
  /** JavaScript source to serve as-is. */
  body: string;
  /** Extra response headers (content-type and no-store are set by the route). */
  headers?: Record<string, string>;
};

/**
 * Inputs to a client report ingest. The impl reads the request body itself, so
 * the wire encoding stays private and can change without touching the route.
 */
export type IngestParams = {
  req: Request;
  /** Signed-in user, or null for a collection that ran before sign-in. */
  userId: number | null;
};

/** What the ingest route should reply. Kept deliberately uninformative. */
export type IngestResult = {
  /** HTTP status to return. Default to 204 so a rejected report looks normal. */
  status: number;
};
