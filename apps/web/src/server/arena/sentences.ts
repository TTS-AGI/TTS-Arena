/**
 * Sentence helpers: hashing for the single-use pool, a lightweight English
 * heuristic, and consumed-sentence bookkeeping. The live prompt pool is the
 * shared PROMPTS list for now (a dataset import can replace it later without
 * changing this interface).
 */
import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { PROMPTS } from "@ttsa/shared";
import { db } from "../db/client";
import { consumedSentences } from "../db/schema";

export function hashSentence(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
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

/** Whether a prompt is part of the curated dataset (vs a user's custom text). */
export function isDatasetPrompt(text: string): boolean {
  return PROMPTS.includes(text.trim());
}

/** A random unconsumed dataset prompt, or null if all are consumed. */
export async function randomUnconsumed(): Promise<string | null> {
  const consumed = await db
    .select({ hash: consumedSentences.sentenceHash })
    .from(consumedSentences);
  const consumedHashes = new Set(consumed.map((c) => c.hash));
  const pool = PROMPTS.filter((p) => !consumedHashes.has(hashSentence(p)));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export async function sentenceStats(): Promise<{
  total: number;
  consumed: number;
  remaining: number;
  consumptionPct: number;
}> {
  const total = PROMPTS.length;
  const poolHashes = PROMPTS.map(hashSentence);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(consumedSentences)
    .where(inArray(consumedSentences.sentenceHash, poolHashes));
  const consumed = Math.min(total, rows[0]?.count ?? 0);
  return {
    total,
    consumed,
    remaining: total - consumed,
    consumptionPct:
      total === 0 ? 0 : Math.round((consumed / total) * 10000) / 100,
  };
}
