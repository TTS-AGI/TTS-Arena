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
