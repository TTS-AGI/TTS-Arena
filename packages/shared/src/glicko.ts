/**
 * Glicko-2 rating system (Glickman, 2013).
 *
 * Each competitor has a rating, a rating deviation (RD — uncertainty), and a
 * volatility. Unlike plain Elo, RD lets a model appear on the board with few
 * games (high uncertainty) and "finalize" as it tightens. Ratings are stored
 * and displayed on the familiar ~1500 scale; the math runs on the internal
 * (μ, φ) scale and converts back.
 *
 * We update one game at a time (a "rating period" of a single match), which
 * suits a live arena where votes arrive continuously.
 */

/** Glicko-2 state on the public (display) scale. */
export type Glicko = {
  rating: number; // ~1500
  rd: number; // rating deviation
  vol: number; // volatility
};

export const DEFAULT_RATING = 1500;
/**
 * Initial rating deviation. The textbook default is 350, but that makes a
 * model's first few votes swing by >150 points — wildly out of scale with the
 * Elo (k=2) the rest of the system uses. 60 keeps early movement to ~10 points
 * and single digits once a model has some games, so Glicko-2 and Elo sit on
 * roughly the same scale and the Glicko→Bradley–Terry handoff isn't jarring.
 */
export const DEFAULT_RD = 60;
export const DEFAULT_VOL = 0.06;

/** System constant τ: constrains volatility change. 0.3–1.2 typical. */
const TAU = 0.5;
/** Conversion factor between display and internal scales. */
const SCALE = 173.7178;
const CONVERGENCE = 1e-6;

export function defaultGlicko(): Glicko {
  return { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL };
}

function toMu(rating: number): number {
  return (rating - DEFAULT_RATING) / SCALE;
}
function toPhi(rd: number): number {
  return rd / SCALE;
}
function fromMu(mu: number): number {
  return mu * SCALE + DEFAULT_RATING;
}
function fromPhi(phi: number): number {
  return phi * SCALE;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}
function expectedE(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Update `player` after games against `opponents`. `score` is 1 (win), 0
 * (loss), or 0.5 (draw) per opponent. Returns the new Glicko state.
 *
 * Passing a single opponent models one match (our live case); passing several
 * models a full rating period (used by batch recomputation).
 */
export function glickoUpdate(
  player: Glicko,
  games: Array<{ opponent: Glicko; score: number }>,
): Glicko {
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.vol;

  // Step 2: no games this period → only RD grows.
  if (games.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: fromPhi(phiStar), vol: sigma };
  }

  // Step 3: estimated variance v.
  let vInv = 0;
  for (const { opponent } of games) {
    const muJ = toMu(opponent.rating);
    const phiJ = toPhi(opponent.rd);
    const e = expectedE(mu, muJ, phiJ);
    const gj = g(phiJ);
    vInv += gj * gj * e * (1 - e);
  }
  const v = 1 / vInv;

  // Step 4: estimated improvement Δ.
  let deltaSum = 0;
  for (const { opponent, score } of games) {
    const muJ = toMu(opponent.rating);
    const phiJ = toPhi(opponent.rd);
    deltaSum += g(phiJ) * (score - expectedE(mu, muJ, phiJ));
  }
  const delta = v * deltaSum;

  // Step 5: new volatility via the iterative procedure (Illinois algorithm).
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) * (phi * phi + v + ex);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaNew = Math.exp(A / 2);

  // Step 6: pre-rating-period RD.
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);

  // Step 7: new RD and rating.
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;

  return {
    rating: fromMu(muNew),
    rd: fromPhi(phiNew),
    vol: sigmaNew,
  };
}

/**
 * Conservative public score: rating minus a multiple of RD. Ranking by this
 * lower bound means a model can't top the board on a lucky small sample — it
 * must also be *certain*. ~2× RD ≈ a 95% lower confidence bound.
 */
export function conservativeRating(g: Glicko, rdMultiplier = 2): number {
  return g.rating - rdMultiplier * g.rd;
}
