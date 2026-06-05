import { describe, expect, test } from "bun:test";
import { PROMPTS, makeWaveform, randomPrompt, seededRandom } from "./models";

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

describe("prompts", () => {
  test("are present and non-empty", () => {
    expect(PROMPTS.length).toBeGreaterThan(0);
    for (const p of PROMPTS) expect(p.trim().length).toBeGreaterThan(0);
  });

  test("randomPrompt returns a member of the pool", () => {
    expect(PROMPTS).toContain(randomPrompt(() => 0.5));
  });
});
