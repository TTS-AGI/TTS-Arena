/**
 * Inline anti-fraud assessment, run at vote time.
 *
 * Fast, deterministic signal scoring. Each signal adds weighted points to a
 * risk score; the caller (recordVote) shadow-excludes a vote whose score crosses
 * FLAG_THRESHOLD (countsForPublic=false) and hard-rejects only on `block`.
 * Tuned conservative — we'd rather miss a borderline bot (the async sweep catches
 * coordinated patterns later) than flag a real listener.
 *
 * Everything here is read-only DB work; the write (flag fields) happens in the
 * recordVote transaction using the returned assessment.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { userLogins, votes } from "../db/schema";
import type { UserRow } from "../db/schema";
import { ageInDays } from "../auth/hf";
import { clientIp, userAgent } from "../request-info";

/** Central, tunable config — all thresholds and weights live here. */
export const SECURITY = {
  /** Master switch (set SECURITY_DISABLED=1 to bypass in an emergency). */
  disabled: () => process.env.SECURITY_DISABLED === "1",

  /** A vote at/above this score is shadow-excluded (countsForPublic=false). */
  flagThreshold: 50,
  /** At/above this, the vote is hard-rejected outright (very rare; clear bots). */
  blockThreshold: 100,

  /** Velocity windows (seconds → max counted votes before it's suspicious). */
  velocity: [
    { windowSec: 10, soft: 3, hard: 6 }, // >6 votes/10s ≈ impossible for a human
    { windowSec: 60, soft: 12, hard: 25 },
    { windowSec: 3600, soft: 120, hard: 300 },
  ],

  /** Decision-time floor: faster than this (gen→vote) is bot-like. */
  minDecisionSeconds: 2,

  /** HF account younger than this (days) adds risk (login gate is 30d). */
  freshAccountDays: 30,

  /** Distinct accounts sharing one IP / fingerprint recently → multi-account. */
  sharedIpAccounts: { soft: 3, hard: 6 },
  sharedFpAccounts: { soft: 2, hard: 4 },
  sharedLookbackDays: 7,

  /** Trust score below which a user's votes are always flagged. */
  trustFloor: 40,

  // Per-signal weights (points added to the risk score).
  weights: {
    velocitySoft: 25,
    velocityHard: 70,
    snapDecision: 30,
    verySnapDecision: 60, // sub-second
    freshAccount: 20,
    missingUa: 25,
    botUa: 60,
    missingFingerprint: 10,
    sharedIpSoft: 20,
    sharedIpHard: 45,
    sharedFpSoft: 25,
    sharedFpHard: 55,
    lowTrust: 40,
    quarantined: 100,
    missingCaptcha: 35, // when a captcha was required but absent/invalid
  },
} as const;

export type Assessment = {
  riskScore: number;
  reasons: string[];
  /** True → hard reject. */
  block: boolean;
  /** True → store but don't count toward ratings (shadow exclude). */
  flag: boolean;
};

const BOT_UA =
  /bot|crawl|spider|headless|python-requests|curl|wget|axios|node-fetch|http-client|scrapy|phantom|puppeteer|playwright/i;

async function countVotesSince(
  userId: number,
  sinceMs: number,
): Promise<number> {
  const since = new Date(sinceMs);
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(votes)
    .where(and(eq(votes.userId, userId), gte(votes.createdAt, since)));
  return rows[0]?.c ?? 0;
}

/** Distinct user ids seen on an IP / fingerprint in the lookback window. */
async function distinctAccountsForLogin(
  field: "ip" | "fingerprint",
  value: string,
  lookbackDays: number,
): Promise<number> {
  const since = new Date(Date.now() - lookbackDays * 86400_000);
  const col = field === "ip" ? userLogins.ip : userLogins.fingerprint;
  const rows = await db
    .select({ c: sql<number>`count(distinct ${userLogins.userId})` })
    .from(userLogins)
    .where(and(eq(col, value), gte(userLogins.createdAt, since)));
  return rows[0]?.c ?? 0;
}

/**
 * Assess a vote. `captchaOk` reflects whether a required captcha token validated
 * (the route resolves it before calling). `durationSeconds` is gen→vote time.
 */
export async function assessVote(params: {
  user: UserRow;
  req: Request;
  durationSeconds: number;
  fingerprint: string | null;
  captchaRequired: boolean;
  captchaOk: boolean;
}): Promise<Assessment> {
  const {
    user,
    req,
    durationSeconds,
    fingerprint,
    captchaRequired,
    captchaOk,
  } = params;

  if (SECURITY.disabled()) {
    return { riskScore: 0, reasons: [], block: false, flag: false };
  }

  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, reason: string) => {
    score += pts;
    reasons.push(reason);
  };
  const W = SECURITY.weights;

  // Quarantined user → everything they cast is excluded.
  if (user.quarantined) add(W.quarantined, "quarantined");

  // Low trust (set by the sweep).
  if (user.trustScore < SECURITY.trustFloor) add(W.lowTrust, "low_trust");

  // Velocity.
  const now = Date.now();
  for (const v of SECURITY.velocity) {
    const n = await countVotesSince(user.id, now - v.windowSec * 1000);
    if (n >= v.hard) {
      add(W.velocityHard, `velocity_hard_${v.windowSec}s:${n}`);
      break;
    } else if (n >= v.soft) {
      add(W.velocitySoft, `velocity_soft_${v.windowSec}s:${n}`);
    }
  }

  // Snap decision (gen→vote faster than a human could listen + choose).
  if (durationSeconds >= 0 && durationSeconds < 1) {
    add(W.verySnapDecision, `snap_decision:${durationSeconds.toFixed(2)}s`);
  } else if (
    durationSeconds >= 0 &&
    durationSeconds < SECURITY.minDecisionSeconds
  ) {
    add(W.snapDecision, `fast_decision:${durationSeconds.toFixed(2)}s`);
  }

  // Account age (re-checked here; login gate isn't re-enforced).
  if (
    user.hfAccountCreated &&
    ageInDays(user.hfAccountCreated) < SECURITY.freshAccountDays
  ) {
    add(W.freshAccount, "fresh_account");
  }

  // User-agent sanity.
  const ua = userAgent(req);
  if (!ua) add(W.missingUa, "missing_ua");
  else if (BOT_UA.test(ua)) add(W.botUa, "bot_ua");

  // Fingerprint presence.
  if (!fingerprint) add(W.missingFingerprint, "missing_fingerprint");

  // Shared-device multiplicity.
  const ip = clientIp(req);
  if (ip) {
    const n = await distinctAccountsForLogin(
      "ip",
      ip,
      SECURITY.sharedLookbackDays,
    );
    if (n >= SECURITY.sharedIpAccounts.hard) {
      add(W.sharedIpHard, `shared_ip_hard:${n}`);
    } else if (n >= SECURITY.sharedIpAccounts.soft) {
      add(W.sharedIpSoft, `shared_ip_soft:${n}`);
    }
  }
  if (fingerprint) {
    const n = await distinctAccountsForLogin(
      "fingerprint",
      fingerprint,
      SECURITY.sharedLookbackDays,
    );
    if (n >= SECURITY.sharedFpAccounts.hard) {
      add(W.sharedFpHard, `shared_fp_hard:${n}`);
    } else if (n >= SECURITY.sharedFpAccounts.soft) {
      add(W.sharedFpSoft, `shared_fp_soft:${n}`);
    }
  }

  // Captcha: when required (first vote of a session / risk-triggered) but the
  // token was absent or invalid.
  if (captchaRequired && !captchaOk) add(W.missingCaptcha, "captcha_failed");

  return {
    riskScore: score,
    reasons,
    block: score >= SECURITY.blockThreshold,
    flag: score >= SECURITY.flagThreshold,
  };
}

/** The most recent vote's age for a user, in seconds (for cooldown UX). */
export async function lastVoteAgeSeconds(
  userId: number,
): Promise<number | null> {
  const row = await db.query.votes.findFirst({
    where: eq(votes.userId, userId),
    orderBy: (v, { desc }) => desc(v.createdAt),
    columns: { createdAt: true },
  });
  if (!row) return null;
  return (Date.now() - row.createdAt.getTime()) / 1000;
}
