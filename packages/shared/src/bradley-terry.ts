/**
 * Bradley–Terry model fit for the canonical leaderboard.
 *
 * Given all pairwise win/loss outcomes, BT finds the maximum-likelihood
 * "strength" of each competitor — an order-independent global ranking that
 * pools information far better than sequential Elo. We fit via the standard MM
 * (minorization–maximization) iteration, scale strengths onto the familiar
 * ~1500 display range, and bootstrap over the games to get confidence
 * intervals. Ranking by the CI lower bound keeps small-sample models honest.
 */

export type Outcome = {
  winner: string;
  loser: string;
};

export type BTRating = {
  id: string;
  /** Display rating (~1500 scale). */
  rating: number;
  /** 95% confidence interval on the display scale. */
  ciLow: number;
  ciHigh: number;
  wins: number;
  games: number;
};

const BT_SCALE = 400 / Math.LN10; // map log-strength to Elo-like points
const BT_CENTER = 1500;
const DEFAULT_BOOTSTRAPS = 400;

/**
 * Strength of virtual prior games. Without a prior, BT's maximum likelihood is
 * DEGENERATE for extreme records: an undefeated model's MLE strength is +∞ (and
 * a winless one's is 0), so a single lucky win produces a nonsense rating like
 * 2400. We add a symmetric Bayesian prior — PRIOR_GAMES virtual games, half won
 * half lost, against a phantom opponent fixed at the average strength (1) — to
 * every model. This pulls extreme records toward the mean (1500) by an amount
 * that VANISHES as real games accumulate (a few virtual games are negligible
 * against hundreds of real ones), so it only disciplines tiny samples. 2 is a
 * light touch: one real win still moves a new model up, just not to infinity.
 */
const PRIOR_GAMES = 2;

/**
 * Fit BT strengths (as natural-log abilities, mean-centered over active
 * competitors only) via MM iteration, regularized by a symmetric prior (see
 * PRIOR_GAMES). Returns a map id → log-ability. Competitors with no games get
 * 0 and do not shift the scale for active competitors.
 */
function fitLogAbilities(
  ids: string[],
  outcomes: Outcome[],
  maxIter = 200,
  tol = 1e-9,
): Map<string, number> {
  // wins[i] = total wins; pairCount[i][j] = games between i and j.
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const wins = new Array(n).fill(0);
  const played = new Array(n).fill(0);
  const games: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0),
  );

  for (const { winner, loser } of outcomes) {
    const wi = index.get(winner);
    const li = index.get(loser);
    if (wi === undefined || li === undefined) continue;
    wins[wi] += 1;
    played[wi] += 1;
    played[li] += 1;
    games[wi]![li]! += 1;
    games[li]![wi]! += 1;
  }

  const active = played.map((g) => g > 0);
  const activeCount = active.filter(Boolean).length;
  if (activeCount === 0) {
    return new Map(ids.map((id) => [id, 0]));
  }

  // Prior: each model plays PRIOR_GAMES games (half won) vs a phantom opponent
  // pinned at strength 1 (the geometric-mean-normalized average). priorWins is
  // added to the numerator; the phantom appears in the denominator below.
  const priorWins = PRIOR_GAMES / 2;
  const PHANTOM = 1;

  // Strengths p (positive). Initialize to 1.
  let p = new Array(n).fill(1);

  for (let iter = 0; iter < maxIter; iter++) {
    const next = new Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;

      // Real opponents.
      let denom = 0;
      for (let j = 0; j < n; j++) {
        const nij = games[i]![j]!;
        if (nij === 0) continue;
        denom += nij / (p[i] + p[j]);
      }
      // Prior: PRIOR_GAMES virtual games vs the phantom average opponent.
      denom += PRIOR_GAMES / (p[i] + PHANTOM);
      // numerator = real wins + prior wins; denom always > 0 now, so no model
      // (undefeated or winless) needs the old "hold steady" special case.
      next[i] = (wins[i] + priorWins) / denom;
    }
    // Normalize active competitors (geometric mean = 1) to fix the scale.
    // Inactive competitors remain pinned to the display center and must not
    // move the active ratings merely by existing in the catalog.
    const logMean =
      next.reduce(
        (s, v, i) => s + (active[i] ? Math.log(v > 0 ? v : 1e-12) : 0),
        0,
      ) / activeCount;
    const norm = Math.exp(logMean);
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const v = active[i] ? next[i] / norm : 1;
      maxDelta = Math.max(maxDelta, Math.abs(v - p[i]));
      next[i] = v;
    }
    p = next;
    if (maxDelta < tol) break;
  }

  const out = new Map<string, number>();
  ids.forEach((id, i) => out.set(id, Math.log(p[i] > 0 ? p[i] : 1e-12)));
  return out;
}

function toDisplay(logAbility: number): number {
  return BT_CENTER + logAbility * BT_SCALE;
}

function expectedWin(logA: number, logB: number): number {
  return 1 / (1 + Math.exp(logB - logA));
}

/** Seedable PRNG so bootstrap results are reproducible per call. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fit BT ratings with bootstrap confidence intervals.
 *
 * @param ids competitors to rank
 * @param outcomes pairwise win/loss results
 * @param bootstrap number of parametric bootstrap resamples (0 = no CI)
 */
export function bradleyTerry(
  ids: string[],
  outcomes: Outcome[],
  bootstrap = DEFAULT_BOOTSTRAPS,
  seed = 1,
): BTRating[] {
  const point = fitLogAbilities(ids, outcomes);
  const gameCount = new Map(ids.map((id) => [id, 0]));
  const winCount = new Map(ids.map((id) => [id, 0]));
  for (const { winner, loser } of outcomes) {
    if (gameCount.has(winner)) {
      gameCount.set(winner, gameCount.get(winner)! + 1);
      winCount.set(winner, winCount.get(winner)! + 1);
    }
    if (gameCount.has(loser)) gameCount.set(loser, gameCount.get(loser)! + 1);
  }

  // Parametric bootstrap: keep the observed matchup schedule, simulate winners
  // from the fitted BT probabilities, refit, and collect distributions. A
  // nonparametric resample of observed winners is overconfident for perfect
  // records: 1-0 and 100-0 can otherwise produce a zero-width interval.
  const samples = new Map<string, number[]>(ids.map((id) => [id, []]));
  if (bootstrap > 0 && outcomes.length > 0) {
    const rand = rng(seed);
    for (let b = 0; b < bootstrap; b++) {
      const simulated: Outcome[] = new Array(outcomes.length);
      for (let i = 0; i < outcomes.length; i++) {
        const { winner, loser } = outcomes[i]!;
        const pWinner = expectedWin(
          point.get(winner) ?? 0,
          point.get(loser) ?? 0,
        );
        simulated[i] =
          rand() < pWinner
            ? { winner, loser }
            : { winner: loser, loser: winner };
      }
      const fit = fitLogAbilities(ids, simulated);
      for (const id of ids) samples.get(id)!.push(toDisplay(fit.get(id) ?? 0));
    }
  }

  const result: BTRating[] = ids.map((id) => {
    const rating = toDisplay(point.get(id) ?? 0);
    const dist = samples.get(id)!;
    let ciLow = rating;
    let ciHigh = rating;
    if (dist.length > 0) {
      const sorted = [...dist].sort((a, b) => a - b);
      const low = sorted[Math.floor(0.025 * (sorted.length - 1))]!;
      const high = sorted[Math.ceil(0.975 * (sorted.length - 1))]!;
      ciLow = Math.min(rating, low);
      ciHigh = Math.max(rating, high);
    }
    return {
      id,
      rating,
      ciLow,
      ciHigh,
      wins: winCount.get(id) ?? 0,
      games: gameCount.get(id) ?? 0,
    };
  });

  // Rank by conservative lower bound, then point rating, evidence, and id for
  // deterministic output under ties/symmetric graphs.
  result.sort(
    (a, b) =>
      b.ciLow - a.ciLow ||
      b.rating - a.rating ||
      b.games - a.games ||
      a.id.localeCompare(b.id),
  );
  return result;
}
