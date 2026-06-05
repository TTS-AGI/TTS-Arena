import { describe, expect, test } from "bun:test";
import { MIN_ACCOUNT_AGE_DAYS, ageInDays, normalizeAvatarUrl } from "./hf";

describe("normalizeAvatarUrl", () => {
  test("passes through absolute URLs unchanged", () => {
    const url = "https://cdn-avatars.huggingface.co/v1/production/x.png";
    expect(normalizeAvatarUrl(url)).toBe(url);
  });

  test("prefixes the HF origin onto site-relative paths", () => {
    expect(normalizeAvatarUrl("/avatars/abc.svg")).toBe(
      "https://huggingface.co/avatars/abc.svg",
    );
  });

  test("handles relative paths without a leading slash", () => {
    expect(normalizeAvatarUrl("avatars/abc.svg")).toBe(
      "https://huggingface.co/avatars/abc.svg",
    );
  });

  test("returns null for missing values", () => {
    expect(normalizeAvatarUrl(null)).toBeNull();
    expect(normalizeAvatarUrl(undefined)).toBeNull();
    expect(normalizeAvatarUrl("")).toBeNull();
  });
});

describe("ageInDays", () => {
  test("computes whole-day differences", () => {
    const now = new Date("2026-06-04T00:00:00Z");
    const created = new Date("2026-05-05T00:00:00Z"); // 30 days earlier
    expect(ageInDays(created, now)).toBeCloseTo(30, 6);
  });

  test("a brand-new account is below the gate", () => {
    const now = new Date("2026-06-04T00:00:00Z");
    const created = new Date("2026-06-01T00:00:00Z"); // 3 days
    expect(ageInDays(created, now)).toBeLessThan(MIN_ACCOUNT_AGE_DAYS);
  });

  test("an old account clears the gate", () => {
    const now = new Date("2026-06-04T00:00:00Z");
    const created = new Date("2024-01-01T00:00:00Z");
    expect(ageInDays(created, now)).toBeGreaterThan(MIN_ACCOUNT_AGE_DAYS);
  });
});
