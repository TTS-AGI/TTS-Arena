import { describe, expect, test } from "bun:test";
import {
  MODELS,
  PROMPTS,
  activeModels,
  getModel,
  makeWaveform,
  pickPair,
  randomPrompt,
  seededRandom,
  weightedPick,
  type ModelType,
} from "./models";

const TYPES: ModelType[] = ["tts", "conversational"];

describe("registry integrity", () => {
  test("model ids are unique", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every model has a name, https url, and provider", () => {
    for (const m of MODELS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.url).toMatch(/^https?:\/\//);
      expect(m.provider.length).toBeGreaterThan(0);
    }
  });

  test("getModel finds by id and misses cleanly", () => {
    expect(getModel(MODELS[0]!.id)?.id).toBe(MODELS[0]!.id);
    expect(getModel("nope")).toBeUndefined();
  });

  test("there are at least two active TTS models for battles", () => {
    expect(activeModels("tts").length).toBeGreaterThanOrEqual(2);
  });
});

describe("seededRandom", () => {
  test("deterministic per seed, varies across seeds", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    expect(a()).toBe(b());
    expect(seededRandom("a")()).not.toBe(seededRandom("b")());
  });

  test("stays in [0, 1)", () => {
    const r = seededRandom("range");
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("does not throw on undefined/empty seed", () => {
    // @ts-expect-error intentional: assert resilience to undefined
    expect(() => seededRandom(undefined)()).not.toThrow();
    expect(() => seededRandom("")()).not.toThrow();
  });
});

describe("makeWaveform", () => {
  test("returns requested bars within [0.06, 1]", () => {
    const w = makeWaveform("seed", 40);
    expect(w).toHaveLength(40);
    for (const a of w) {
      expect(a).toBeGreaterThanOrEqual(0.06);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  test("is deterministic", () => {
    expect(makeWaveform("same")).toEqual(makeWaveform("same"));
  });
});

describe("pickPair", () => {
  test("returns two distinct active models of the type", () => {
    for (const type of TYPES) {
      const pool = activeModels(type);
      if (pool.length < 2) continue;
      for (let i = 0; i < 30; i++) {
        const seq = mulberry(`pp-${type}-${i}`);
        const [a, b] = pickPair(type, seq);
        expect(a.id).not.toBe(b.id);
        expect(a.type).toBe(type);
        expect(b.active).toBe(true);
      }
    }
  });

  test("is deterministic for the same rng sequence", () => {
    const [a1, b1] = pickPair("tts", mulberry("fixed"));
    const [a2, b2] = pickPair("tts", mulberry("fixed"));
    expect(a1.id).toBe(a2.id);
    expect(b1.id).toBe(b2.id);
  });
});

describe("weightedPick", () => {
  test("returns n distinct active models", () => {
    const picked = weightedPick("tts", 2, {}, mulberry("wp"));
    expect(picked).toHaveLength(2);
    expect(picked[0]!.id).not.toBe(picked[1]!.id);
    for (const m of picked) expect(m.active).toBe(true);
  });

  test("favours low-vote models over saturated ones", () => {
    const pool = activeModels("tts");
    const cold = pool[0]!;
    // Give every other model a huge vote count so weight collapses.
    const counts: Record<string, number> = {};
    for (const m of pool) if (m.id !== cold.id) counts[m.id] = 1_000_000;
    let coldFirst = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const [first] = weightedPick("tts", 1, counts, mulberry(`fav-${i}`));
      if (first!.id === cold.id) coldFirst++;
    }
    // The near-zero-vote model should dominate first picks.
    expect(coldFirst).toBeGreaterThan(trials * 0.8);
  });
});

describe("prompts", () => {
  test("are present and non-empty", () => {
    expect(PROMPTS.length).toBeGreaterThan(0);
    for (const p of PROMPTS) expect(p.trim().length).toBeGreaterThan(0);
  });

  test("randomPrompt returns a member of the pool", () => {
    expect(PROMPTS).toContain(randomPrompt(mulberry("rp")));
  });
});

/** Small standalone PRNG for tests (independent of the module under test). */
function mulberry(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
