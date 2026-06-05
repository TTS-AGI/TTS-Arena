/**
 * Prompt pool, backed by the large `combined_prompts.txt` corpus.
 *
 * The corpus is ~62MB / ~500k lines, so we never load it into memory. On first
 * use we build a line-offset index (one pass, storing byte offsets), then serve
 * a random prompt by seeking to a random line's offset and reading just that
 * line. The index is an array of offsets — a few MB — kept for the process
 * lifetime.
 *
 * Location: PROMPTS_FILE (default apps/web/data/combined_prompts.txt locally;
 * /data/combined_prompts.txt on the Space). Throws if the file is missing —
 * the corpus is the single source of prompts.
 */
import { open, stat } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Resolve the corpus path lazily (not at module load — webpack doesn't populate
 * import.meta.dirname, and we don't want path work during `next build`). Prefer
 * PROMPTS_FILE; otherwise look in a few cwd-relative locations.
 */
function resolveFile(): string {
  if (process.env.PROMPTS_FILE) return resolve(process.env.PROMPTS_FILE);
  // next dev runs with cwd = apps/web; scripts may run from the repo root.
  const cwd = process.cwd();
  return cwd.endsWith("apps/web")
    ? resolve(cwd, "data/combined_prompts.txt")
    : resolve(cwd, "apps/web/data/combined_prompts.txt");
}

type Index = { offsets: number[]; size: number; file: string };
let indexPromise: Promise<Index> | null = null;

/** Build the line-offset index in a single streaming pass. */
async function buildIndex(): Promise<Index> {
  const file = resolveFile();
  const { size } = await stat(file);
  const fh = await open(file, "r");
  try {
    const offsets: number[] = [0];
    const buf = Buffer.allocUnsafe(1 << 20); // 1 MiB chunks
    let pos = 0;
    while (pos < size) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (bytesRead === 0) break;
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0x0a /* \n */) offsets.push(pos + i + 1);
      }
      pos += bytesRead;
    }
    // Drop a trailing empty "line" if the file ends with a newline.
    if (offsets[offsets.length - 1] === size) offsets.pop();
    return { offsets, size, file };
  } finally {
    await fh.close();
  }
}

function getIndex(): Promise<Index> {
  if (!indexPromise) indexPromise = buildIndex();
  return indexPromise;
}

/** Read the line starting at `start` (up to the next newline or EOF). */
async function readLineAt(
  file: string,
  start: number,
  end: number,
): Promise<string> {
  const fh = await open(file, "r");
  try {
    const len = Math.max(0, end - start);
    const buf = Buffer.allocUnsafe(len);
    const { bytesRead } = await fh.read(buf, 0, len, start);
    return buf
      .toString("utf8", 0, bytesRead)
      .replace(/\r?\n$/, "")
      .trim();
  } finally {
    await fh.close();
  }
}

/** Total number of prompts in the corpus. */
export async function promptCount(): Promise<number> {
  return (await getIndex()).offsets.length;
}

/** A uniformly random prompt from the corpus. */
export async function randomPrompt(): Promise<string> {
  const { offsets, size, file } = await getIndex();
  const i = Math.floor(Math.random() * offsets.length);
  const start = offsets[i]!;
  const end = i + 1 < offsets.length ? offsets[i + 1]! : size;
  return readLineAt(file, start, end);
}
