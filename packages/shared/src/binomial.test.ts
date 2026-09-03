import { describe, expect, it } from "bun:test";
import { binomialUpperTail } from "./binomial";

describe("binomialUpperTail", () => {
  it("is 1 for a vacuous threshold", () => {
    expect(binomialUpperTail(0, 10, 0.5)).toBe(1);
    expect(binomialUpperTail(-3, 10, 0.5)).toBe(1);
  });

  it("is 0 above the support", () => {
    expect(binomialUpperTail(11, 10, 0.5)).toBe(0);
  });

  it("matches exact values on small cases", () => {
    // P(X >= 1), n=1, p=0.5
    expect(binomialUpperTail(1, 1, 0.5)).toBeCloseTo(0.5, 12);
    // P(X >= 2), n=3, p=0.5 = (3 + 1)/8
    expect(binomialUpperTail(2, 3, 0.5)).toBeCloseTo(0.5, 12);
    // P(X >= 3), n=3, p=0.5 = 1/8
    expect(binomialUpperTail(3, 3, 0.5)).toBeCloseTo(0.125, 12);
    // P(X >= 10), n=10, p=0.6 = 0.6^10
    expect(binomialUpperTail(10, 10, 0.6)).toBeCloseTo(0.6 ** 10, 12);
  });

  it("sums to 1 over the whole support", () => {
    expect(binomialUpperTail(0, 25, 0.31)).toBe(1);
    expect(binomialUpperTail(1, 25, 0.31)).toBeCloseTo(1 - 0.69 ** 25, 10);
  });

  it("leaves an enthusiastic-but-honest voter unremarkable", () => {
    // Picked a genuinely good model 16 of 20 times; it wins 60% globally.
    expect(binomialUpperTail(16, 20, 0.6)).toBeGreaterThan(1e-3);
  });

  it("collapses for a voter who never misses", () => {
    // 30 of 30 for a model the population picks half the time.
    expect(binomialUpperTail(30, 30, 0.5)).toBeLessThan(1e-8);
    // And still, less dramatically, for a near-perfect record.
    expect(binomialUpperTail(28, 30, 0.5)).toBeLessThan(1e-5);
  });

  it("is monotone in the observed count", () => {
    let prev = 1;
    for (let k = 1; k <= 40; k++) {
      const p = binomialUpperTail(k, 40, 0.45);
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });
});
