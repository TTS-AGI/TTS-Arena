/**
 * Shared model-adjacent types and the prompt pool.
 *
 * The arena *catalog* (which models exist, their provider/routing, enabled
 * state) lives in the router's provider registry — that's the single source of
 * truth. This module only holds the cross-cutting `ModelType`, the fallback
 * prompt pool, and the deterministic helpers the UI uses.
 */

export type ModelType = "tts" | "conversational";

/**
 * Fallback prompts (public-domain Harvard sentences + a few neutral lines).
 * The live arena can draw from a dataset later; these cover offline/dev.
 */
export const PROMPTS: readonly string[] = [
  "The birch canoe slid on the smooth planks.",
  "Glue the sheet to the dark blue background.",
  "It's easy to tell the depth of a well.",
  "These days a chicken leg is a rare dish.",
  "The juice of lemons makes fine punch.",
  "The box was thrown beside the parked truck.",
  "Four hours of steady work faced us.",
  "The boy was there when the sun rose.",
  "A rod is used to catch pink salmon.",
  "The source of the huge river is the clear spring.",
  "Kick the ball straight and follow through.",
  "Help the woman get back to her feet.",
  "A pot of tea helps to pass the evening.",
  "Smoky fires lack flame and heat.",
  "The soft cushion broke the man's fall.",
  "Wait — did you really say the meeting got moved again?",
  "Honestly, that might be the best coffee I've had all year.",
  "Breaking news: scientists confirm water once flowed on Mars.",
  "She whispered that she thought we were being followed.",
  "The northern lights shimmered green and violet over the lake.",
];

export function randomPrompt(rand: () => number = Math.random): string {
  return PROMPTS[Math.floor(rand() * PROMPTS.length)]!;
}

/* ── Seeded RNG + waveform (UI rendering; deterministic for SSR) ───────── */

/** Deterministic 0–1 PRNG from a string seed (mulberry-style). */
export function seededRandom(seed: string): () => number {
  const s = String(seed ?? "");
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^= h >>> 16) >>> 0;
    return h / 4294967296;
  };
}

/** Stable waveform amplitudes (0–1) for a seed, shaped like speech. */
export function makeWaveform(seed: string, bars = 56): number[] {
  const rand = seededRandom(seed);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const t = i / (bars - 1);
    const envelope = Math.sin(t * Math.PI) * 0.6 + 0.4;
    out.push(Math.max(0.06, Math.min(1, rand() * envelope)));
  }
  return out;
}
