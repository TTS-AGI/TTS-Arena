/**
 * STUB — async security sweep.
 *
 * The real cross-vote / cross-user sweep lives in TTS-AGI/Antifraud and
 * overwrites this at deploy. The stub is a no-op so the public arena's cleanup
 * interval has something to call.
 *
 * @antifraud-stub — do not replace this file in the public repo; see ../README.md
 */
export async function runSecuritySweep(): Promise<void> {
  // no-op (undefended public build)
}
