import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  conservativeRating,
  defaultGlicko,
  glickoUpdate,
} from "./glicko";

describe("glickoUpdate", () => {
  test("a win raises rating by a modest, Elo-scale amount", () => {
    const player = defaultGlicko();
    const opp = defaultGlicko();
    const after = glickoUpdate(player, [{ opponent: opp, score: 1 }]);
    expect(after.rating).toBeGreaterThan(DEFAULT_RATING);
    // With the tuned initial RD (~60), one even win moves ~10 points — the
    // same order of magnitude as Elo, not the >150 of the textbook RD=350.
    expect(after.rating - DEFAULT_RATING).toBeLessThan(20);
    // RD stays bounded (it equilibrates near its starting value, not exploding).
    expect(after.rd).toBeLessThanOrEqual(DEFAULT_RD + 1);
  });

  test("from a high RD, a win does shrink RD (uncertainty tightens)", () => {
    const player = { rating: 1500, rd: 350, vol: 0.06 };
    const after = glickoUpdate(player, [
      { opponent: defaultGlicko(), score: 1 },
    ]);
    expect(after.rd).toBeLessThan(350);
  });

  test("a loss lowers rating", () => {
    const after = glickoUpdate(defaultGlicko(), [
      { opponent: defaultGlicko(), score: 0 },
    ]);
    expect(after.rating).toBeLessThan(DEFAULT_RATING);
  });

  test("no games leaves rating unchanged and grows RD", () => {
    const after = glickoUpdate(defaultGlicko(), []);
    expect(after.rating).toBeCloseTo(DEFAULT_RATING, 6);
    expect(after.rd).toBeGreaterThanOrEqual(DEFAULT_RD);
  });

  test("beating a stronger opponent gains more than beating a weaker one", () => {
    const me = defaultGlicko();
    const strong = { rating: 1800, rd: 50, vol: 0.06 };
    const weak = { rating: 1200, rd: 50, vol: 0.06 };
    const vsStrong = glickoUpdate(me, [{ opponent: strong, score: 1 }]);
    const vsWeak = glickoUpdate(me, [{ opponent: weak, score: 1 }]);
    expect(vsStrong.rating - me.rating).toBeGreaterThan(
      vsWeak.rating - me.rating,
    );
  });

  test("RD converges downward over a long win streak then stabilizes", () => {
    let p = defaultGlicko();
    const opp = { rating: 1500, rd: 30, vol: 0.06 };
    for (let i = 0; i < 30; i++) {
      p = glickoUpdate(p, [{ opponent: opp, score: i % 2 }]);
    }
    expect(p.rd).toBeLessThan(DEFAULT_RD);
    expect(p.rd).toBeGreaterThan(0);
    expect(Number.isFinite(p.rating)).toBe(true);
  });

  test("known Glickman worked example (single period, 3 opponents)", () => {
    // From Glickman's 2013 paper: player r=1500 RD=200, vol=0.06 vs
    // (1400,30) W, (1550,100) L, (1700,300) L → r≈1464.05, RD≈151.52.
    const player = { rating: 1500, rd: 200, vol: 0.06 };
    const after = glickoUpdate(player, [
      { opponent: { rating: 1400, rd: 30, vol: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, vol: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, vol: 0.06 }, score: 0 },
    ]);
    expect(after.rating).toBeCloseTo(1464.05, 1);
    expect(after.rd).toBeCloseTo(151.52, 1);
    expect(after.vol).toBeCloseTo(0.05999, 3);
  });
});

describe("conservativeRating", () => {
  test("is rating minus a multiple of RD", () => {
    const g = { rating: 1600, rd: 80, vol: 0.06 };
    expect(conservativeRating(g, 2)).toBe(1600 - 160);
  });

  test("punishes uncertainty: same rating, higher RD ranks lower", () => {
    const certain = { rating: 1600, rd: 40, vol: 0.06 };
    const shaky = { rating: 1600, rd: 200, vol: 0.06 };
    expect(conservativeRating(certain)).toBeGreaterThan(
      conservativeRating(shaky),
    );
  });
});
