/**
 * STUB — client report ingest.
 *
 * The real ingest lives in TTS-AGI/Antifraud and overwrites this at deploy. It
 * verifies the report's issued token, decodes the wire format, stores the raw
 * components in `signal_reports`, and derives signals from them. The stub
 * accepts and discards, so a public build stores nothing.
 *
 * @antifraud-stub — do not replace this file in the public repo; see ../README.md
 */
import type { IngestParams, IngestResult } from "../types";

export async function ingestReport(
  params: IngestParams,
): Promise<IngestResult> {
  void params; // unused in the stub; the real impl decodes and stores the report
  return { status: 204 };
}
