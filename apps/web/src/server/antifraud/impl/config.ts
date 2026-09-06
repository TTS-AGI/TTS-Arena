/**
 * STUB — permissive anti-fraud config.
 *
 * The real SECURITY (thresholds + signal weights) lives in TTS-AGI/Antifraud and
 * overwrites this file at deploy time. This stub exposes only what the public
 * arena reads across the seam — `disabled()` — so the app builds without the
 * private repo. With the stub in place the arena is UNDEFENDED by design.
 *
 * @antifraud-stub — do not replace this file in the public repo; see ../README.md
 */
export const SECURITY = {
  disabled: () => process.env.SECURITY_DISABLED === "1",
} as const;
