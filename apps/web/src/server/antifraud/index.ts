/**
 * Anti-fraud seam — the ONLY module the arena imports for fraud detection.
 *
 * The real detection logic lives in a private repo (TTS-AGI/Antifraud) and is
 * cloned into ./impl at deploy time, replacing the permissive stub the public
 * repo ships. Keeping every call site pointed at this file means logic can move
 * in or out of the private repo without touching the arena.
 *
 * See ./impl/README.md and the private repo for the mechanism.
 */
export { assessVote } from "./impl/assess";
export { SECURITY } from "./impl/config";
export { runSecuritySweep } from "./impl/sweep";
export { collectorScript } from "./impl/collector";
export { ingestReport } from "./impl/ingest";
export type {
  Assessment,
  AssessParams,
  CollectorScript,
  IngestParams,
  IngestResult,
  Severity,
} from "./types";
