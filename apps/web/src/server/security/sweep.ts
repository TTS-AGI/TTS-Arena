/**
 * Security sweep — thin public shim over the seam.
 *
 * The real cross-vote / cross-user sweep lives behind `@/server/antifraud`
 * (private repo TTS-AGI/Antifraud, cloned in at deploy; no-op stub in public).
 * Kept so the cleanup interval keeps importing from `@/server/security/sweep`.
 */
export { runSecuritySweep } from "@/server/antifraud";
