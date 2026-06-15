/**
 * Sentence helpers: hashing for the single-use pool, a lightweight English
 * heuristic, and consumed-sentence bookkeeping. The live prompt pool is the
 * `combined_prompts.txt` corpus (see prompt-pool), accessed by random line.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { consumedSentences } from "../db/schema";
import { serverEnv } from "../env";
import { promptCount, randomPrompt } from "./prompt-pool";

const PROMPT_TOKEN_TTL_MS = 30 * 60 * 1000;

export function hashSentence(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

function signPayload(payload: string): string {
  return createHmac("sha256", serverEnv.sessionSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signed proof that a prompt was served by the random corpus endpoint. */
export function signPromptToken(text: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      h: hashSentence(text),
      exp: Date.now() + PROMPT_TOKEN_TTL_MS,
    }),
  ).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function verifyPromptToken(text: string, token: string | null): boolean {
  if (!token) return false;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return false;
  if (!safeEqual(signPayload(payload), sig)) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { h?: unknown; exp?: unknown };
    return (
      parsed.h === hashSentence(text) &&
      typeof parsed.exp === "number" &&
      parsed.exp >= Date.now()
    );
  } catch {
    return false;
  }
}

/**
 * Cheap English check. Full langdetect is overkill for short prompts; we accept
 * text that is dominantly Latin-script ASCII letters/punctuation. Rejects
 * scripts (CJK, Cyrillic, Arabic, etc.) the arena doesn't support yet.
 */
export function isEnglish(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length === 0) return false;
  const latin = letters.replace(/[^a-zA-ZÀ-ɏ]/g, "");
  return latin.length / letters.length >= 0.9;
}

export async function isConsumed(text: string): Promise<boolean> {
  const row = await db.query.consumedSentences.findFirst({
    where: eq(consumedSentences.sentenceHash, hashSentence(text)),
  });
  return row !== undefined;
}

export async function markConsumed(text: string): Promise<void> {
  await db
    .insert(consumedSentences)
    .values({ sentenceHash: hashSentence(text), sentenceText: text.trim() })
    .onConflictDoNothing();
}

/**
 * Whether a prompt came from the corpus rather than free-typed by the user.
 * The corpus has ~500k lines, so membership isn't checked exhaustively; a
 * prompt is treated as "dataset" only when it was served via the random
 * endpoint (which marks it consumed). Free-typed text is "custom".
 */
export async function isDatasetPrompt(text: string): Promise<boolean> {
  return isConsumed(text);
}

/**
 * A random unconsumed prompt from the corpus. Tries a few random draws and
 * returns the first not-yet-consumed one (the corpus is far larger than the
 * consumed set, so a hit is near-certain in one or two tries).
 */
export async function randomUnconsumed(): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = await randomPrompt();
    if (!(await isConsumed(candidate))) return candidate;
  }
  // Extremely unlikely (corpus exhausted-ish); return a fresh draw anyway.
  return randomPrompt();
}

export async function sentenceStats(): Promise<{
  total: number;
  consumed: number;
  remaining: number;
  consumptionPct: number;
}> {
  const [total, rows] = await Promise.all([
    promptCount(),
    db.select({ count: sql<number>`count(*)` }).from(consumedSentences),
  ]);
  const consumed = Math.min(total, rows[0]?.count ?? 0);
  return {
    total,
    consumed,
    remaining: total - consumed,
    consumptionPct:
      total === 0 ? 0 : Math.round((consumed / total) * 10000) / 100,
  };
}
