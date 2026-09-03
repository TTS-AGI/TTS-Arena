/**
 * Binomial tail probability — the statistical core of the anti-fraud
 * preference test.
 *
 * The question it answers: a voter saw model M in `n` battles and picked it `k`
 * times, while everyone else picks M `p` of the time. How surprising is that?
 * An honest voter who simply likes M sits a few points above p; a voter who can
 * *recognise* M sits at or near 1.0, and the tail probability collapses toward
 * zero fast enough to separate the two without a hand-tuned ratio cutoff.
 */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log Γ(x) for x > 0 (Lanczos, g=7). Used only for log binomial coefficients. */
function lgamma(x: number): number {
  if (x < 0.5) {
    // Reflection, so the approximation is only ever evaluated for x >= 0.5.
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i]! / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

/** log C(n, k). */
function logChoose(n: number, k: number): number {
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

/**
 * P(X >= k) for X ~ Binomial(n, p) — the one-sided upper tail.
 *
 * Summed in log space from k upward, which is the *short* side whenever the
 * observation is above the mean (the only case we test). Terms that underflow
 * to zero contribute nothing, so an astronomically small tail returns 0 rather
 * than a wrong number — still the right answer for "this is not chance".
 */
export function binomialUpperTail(k: number, n: number, p: number): number {
  if (n <= 0 || k <= 0) return 1;
  if (k > n) return 0;
  // Clamp away from the degenerate ends: a global rate of exactly 0 or 1 is an
  // artifact of a thin sample, not a real certainty.
  const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9);

  const logP = Math.log(q);
  const logQ = Math.log1p(-q);
  let sum = 0;
  for (let i = k; i <= n; i++) {
    sum += Math.exp(logChoose(n, i) + i * logP + (n - i) * logQ);
  }
  return Math.min(1, sum);
}
