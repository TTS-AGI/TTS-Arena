/**
 * Elo rating + leaderboard tiering. Canonical rating logic for the arena,
 * faithful to TTS-Arena-V2 (models.py `calculate_elo_change`,
 * `get_leaderboard_data`): base 1500, k-factor 2, the /400 logistic scale, and
 * the `match_count > 250` public-ranking threshold.
 */

export const BASE_ELO = 1500;
/** Deliberately small so ratings move slowly and stay stable. */
export const ELO_K = 2;
/** A model needs strictly more than this many counted matches to be ranked. */
export const RANK_THRESHOLD = 250;

export type Tier = "S" | "A" | "B";

/** Expected score for `a` against `b` on the standard /400 logistic curve. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/**
 * New ratings after `winner` beats `loser`. Pure — returns both updated
 * values rather than mutating, so callers stay explicit about persistence.
 */
export function applyElo(
  winnerElo: number,
  loserElo: number,
  k: number = ELO_K,
): { winner: number; loser: number } {
  const expWinner = expectedScore(winnerElo, loserElo);
  const expLoser = expectedScore(loserElo, winnerElo);
  return {
    winner: winnerElo + k * (1 - expWinner),
    loser: loserElo + k * (0 - expLoser),
  };
}

/** Signed delta applied to the winner (loser receives its negation-ish). */
export function eloChange(
  winnerElo: number,
  loserElo: number,
  k: number = ELO_K,
): number {
  return k * (1 - expectedScore(winnerElo, loserElo));
}

/** Tier by 1-based rank: S (1–2), A (3–4), B (5–7), else none. */
export function tierFor(rank: number): Tier | null {
  if (rank <= 2) return "S";
  if (rank <= 4) return "A";
  if (rank <= 7) return "B";
  return null;
}

/** Whether a model with this many counted matches appears on the public board. */
export function isRanked(matchCount: number): boolean {
  return matchCount > RANK_THRESHOLD;
}
