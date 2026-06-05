import { describe, expect, test } from "bun:test";
import {
  BASE_ELO,
  ELO_K,
  RANK_THRESHOLD,
  applyElo,
  eloChange,
  expectedScore,
  isRanked,
  tierFor,
} from "./elo";

describe("constants match upstream", () => {
  test("base, k-factor, and ranking threshold", () => {
    expect(BASE_ELO).toBe(1500);
    expect(ELO_K).toBe(2);
    expect(RANK_THRESHOLD).toBe(250);
  });
});

describe("expectedScore", () => {
  test("equal ratings expect 0.5", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
  });

  test("the two sides sum to 1", () => {
    expect(expectedScore(1700, 1300) + expectedScore(1300, 1700)).toBeCloseTo(
      1,
      10,
    );
  });

  test("a 400-point gap is ~0.909 favourite", () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 6);
  });
});

describe("applyElo", () => {
  test("equal ratings: winner +k/2, loser -k/2", () => {
    const { winner, loser } = applyElo(1500, 1500);
    expect(winner).toBeCloseTo(1500 + ELO_K / 2, 10);
    expect(loser).toBeCloseTo(1500 - ELO_K / 2, 10);
  });

  test("zero-sum: total rating is conserved", () => {
    const { winner, loser } = applyElo(1620, 1480);
    expect(winner + loser).toBeCloseTo(1620 + 1480, 6);
  });

  test("beating a stronger model gains more than beating a weaker one", () => {
    const upset = applyElo(1400, 1600).winner - 1400;
    const expected = applyElo(1600, 1400).winner - 1600;
    expect(upset).toBeGreaterThan(expected);
  });

  test("honors a custom k-factor", () => {
    expect(applyElo(1500, 1500, 32).winner).toBeCloseTo(1516, 10);
  });
});

describe("eloChange", () => {
  test("equal ratings give half the k-factor", () => {
    expect(eloChange(1500, 1500)).toBeCloseTo(ELO_K / 2, 10);
  });

  test("delta stays within (0, k)", () => {
    for (const [w, l] of [
      [1500, 1500],
      [1000, 2000],
      [2000, 1000],
    ] as const) {
      const d = eloChange(w, l);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(ELO_K);
    }
  });
});

describe("tierFor", () => {
  test("maps ranks to S/A/B then null", () => {
    expect(tierFor(1)).toBe("S");
    expect(tierFor(2)).toBe("S");
    expect(tierFor(3)).toBe("A");
    expect(tierFor(4)).toBe("A");
    expect(tierFor(5)).toBe("B");
    expect(tierFor(7)).toBe("B");
    expect(tierFor(8)).toBeNull();
  });
});

describe("isRanked", () => {
  test("strictly greater than the threshold", () => {
    expect(isRanked(RANK_THRESHOLD)).toBe(false);
    expect(isRanked(RANK_THRESHOLD + 1)).toBe(true);
    expect(isRanked(0)).toBe(false);
  });
});
