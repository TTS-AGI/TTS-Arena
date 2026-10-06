/**
 * STUB — inline vote assessment.
 *
 * Real scoring lives in TTS-AGI/Antifraud and overwrites this at deploy. The
 * stub scores every vote clean so the public arena builds and runs undefended.
 *
 * @antifraud-stub — do not replace this file in the public repo; see ../README.md
 */
import type { Assessment, AssessParams } from "../types";

export async function assessVote(params: AssessParams): Promise<Assessment> {
  void params; // unused in the stub; the real impl scores these inputs
  return { riskScore: 0, reasons: [], block: false, flag: false };
}
