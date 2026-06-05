import { describe, expect, test } from "bun:test";
import { bradleyTerry, type Outcome } from "./bradley-terry";

/** Build `count` outcomes of winner beating loser. */
function games(winner: string, loser: string, count: number): Outcome[] {
  return Array.from({ length: count }, () => ({ winner, loser }));
}

describe("bradleyTerry", () => {
  test("a dominant competitor ranks first", () => {
    const ids = ["a", "b", "c"];
    const outcomes = [
      ...games("a", "b", 20),
      ...games("a", "c", 20),
      ...games("b", "c", 12),
    ];
    const ranked = bradleyTerry(ids, outcomes, 0);
    expect(ranked[0]!.id).toBe("a");
    expect(ranked[ranked.length - 1]!.id).toBe("c");
  });

  test("ratings are transitive for a clean ordering", () => {
    const ids = ["x", "y", "z"];
    const outcomes = [
      ...games("x", "y", 15),
      ...games("y", "z", 15),
      ...games("x", "z", 15),
    ];
    const ranked = bradleyTerry(ids, outcomes, 0);
    const byId = new Map(ranked.map((r) => [r.id, r.rating]));
    expect(byId.get("x")!).toBeGreaterThan(byId.get("y")!);
    expect(byId.get("y")!).toBeGreaterThan(byId.get("z")!);
  });

  test("is order-independent (shuffling outcomes gives same ratings)", () => {
    const ids = ["a", "b", "c"];
    const outcomes = [
      ...games("a", "b", 10),
      ...games("b", "c", 10),
      ...games("a", "c", 7),
    ];
    const shuffled = [...outcomes].reverse();
    const r1 = bradleyTerry(ids, outcomes, 0);
    const r2 = bradleyTerry(ids, shuffled, 0);
    const m1 = new Map(r1.map((r) => [r.id, r.rating]));
    const m2 = new Map(r2.map((r) => [r.id, r.rating]));
    for (const id of ids) expect(m1.get(id)!).toBeCloseTo(m2.get(id)!, 6);
  });

  test("bootstrap yields a CI bracketing the point rating", () => {
    const ids = ["a", "b"];
    const outcomes = games("a", "b", 40);
    const [top] = bradleyTerry(ids, outcomes, 50);
    expect(top!.ciLow).toBeLessThanOrEqual(top!.rating);
    expect(top!.ciHigh).toBeGreaterThanOrEqual(top!.rating);
  });

  test("ranks by CI lower bound: a sure win beats an uncertain one", () => {
    // 'sure' has many games, 'lucky' has few — both undefeated.
    const ids = ["sure", "lucky", "filler"];
    const outcomes = [
      ...games("sure", "filler", 60),
      ...games("lucky", "filler", 3),
    ];
    const ranked = bradleyTerry(ids, outcomes, 80);
    const sure = ranked.find((r) => r.id === "sure")!;
    const lucky = ranked.find((r) => r.id === "lucky")!;
    // The well-established model should have the higher (less negative) lower
    // bound even if raw ratings are close.
    expect(sure.ciLow).toBeGreaterThan(lucky.ciLow);
  });

  test("counts games per competitor", () => {
    const ranked = bradleyTerry(["a", "b"], games("a", "b", 5), 0);
    expect(ranked.find((r) => r.id === "a")!.games).toBe(5);
    expect(ranked.find((r) => r.id === "b")!.games).toBe(5);
  });

  test("empty outcomes produce centered ratings without throwing", () => {
    const ranked = bradleyTerry(["a", "b"], [], 0);
    expect(ranked).toHaveLength(2);
    for (const r of ranked) expect(Number.isFinite(r.rating)).toBe(true);
  });
});
