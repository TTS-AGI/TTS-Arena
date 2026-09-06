/**
 * STUB — per-request client collector script.
 *
 * The real generator lives in TTS-AGI/Antifraud and overwrites this at deploy.
 * It builds a fresh, obfuscated script per request with the probe set the
 * backend chose for that session embedded in it. The stub serves an inert
 * script, so a public build collects nothing.
 *
 * @antifraud-stub — do not replace this file in the public repo; see ../README.md
 */
import type { CollectorScript } from "../types";

export async function collectorScript(req: Request): Promise<CollectorScript> {
  void req; // unused in the stub; the real impl varies the script per request
  return { body: "/* no collector in this build */\n" };
}
