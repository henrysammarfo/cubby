/**
 * Off-chain prover: turns an ECDSA (r, s) over message hash e into the
 * half-size scalars and slope hints the covenant checks. Mirrors the script's
 * order of operations exactly.
 */
import { SCALAR_BITS, TABLE_SUMS } from './covenant.js';
import { addWithHint, doubleWithHint, G, G128, inv, mod, multiply, N, neg, P, type Point, add as padd } from './p256.js';

export interface Witness {
  readonly r: bigint;
  readonly ry: bigint;
  readonly s: bigint;
  readonly alpha: bigint;
  readonly beta: bigint;
  readonly gamma: bigint;
  readonly hints: readonly bigint[];
}

/**
 * Short lattice vectors (alpha, beta) with beta = alpha * u2 (mod n): extended
 * Euclid on (n, u2) stopped at the first remainder below 2^128, plus small
 * combinations of the last two rows. Every candidate satisfies the relation;
 * they differ only in how many table additions the script will need.
 */
export const halfScalarCandidates = (u2: bigint): Array<{ alpha: bigint; beta: bigint }> => {
  let r0 = N;
  let r1 = mod(u2, N);
  let t0 = 0n;
  let t1 = 1n;
  const bound = 1n << BigInt(SCALAR_BITS);
  while (r1 >= bound) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  // invariant: r_k == t_k * u2 (mod n) for both rows
  const abs = (v: bigint): bigint => (v < 0n ? -v : v);
  const out: Array<{ alpha: bigint; beta: bigint }> = [];
  for (let c1 = -3n; c1 <= 3n; c1++) {
    for (let c2 = -6n; c2 <= 6n; c2++) {
      const alpha = c1 * t0 + c2 * t1;
      const beta = c1 * r0 + c2 * r1;
      if (alpha === 0n || abs(alpha) >= bound || abs(beta) >= bound) continue;
      out.push({ alpha, beta });
    }
  }
  if (out.length === 0) throw new Error('half-scalar search failed');
  return out;
};

const additionsNeeded = (alpha: bigint, beta: bigint, gamma: bigint): number => {
  const v = (alpha < 0n ? -alpha : alpha) | (beta < 0n ? -beta : beta) | (gamma % (1n << 128n)) | (gamma >> 128n);
  // a digit is non-zero when any of the four scalars has that bit set
  let count = 0;
  for (let i = 0; i < SCALAR_BITS; i++) if ((v >> BigInt(i)) & 1n) count++;
  return count;
};

/** The candidate that needs the fewest additions (smallest unlocking bytecode). */
export const halfScalars = (u1: bigint, u2: bigint): { alpha: bigint; beta: bigint; gamma: bigint } => {
  let best: { alpha: bigint; beta: bigint; gamma: bigint } | undefined;
  let bestAdds = Infinity;
  for (const { alpha, beta } of halfScalarCandidates(u2)) {
    const gamma = mod(alpha * u1, N);
    const adds = additionsNeeded(alpha, beta, gamma);
    if (adds < bestAdds) {
      bestAdds = adds;
      best = { alpha, beta, gamma };
    }
  }
  if (best === undefined) throw new Error('unreachable');
  return best;
};

export const buildWitness = (e: bigint, r: bigint, s: bigint, Q: Point): Witness => {
  if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error('signature out of range');
  const w = inv(s, N);
  const u1 = mod(e * w, N);
  const u2 = mod(r * w, N);
  const R = padd(multiply(u1, G), multiply(u2, Q));
  if (R.x !== r) {
    if (mod(R.x, N) === r) throw new Error('rare case R.x = r + n is not supported; sign again');
    throw new Error('signature does not verify');
  }
  const { alpha, beta, gamma } = halfScalars(u1, u2);
  if (mod(beta * s - alpha * r, N) !== 0n || mod(gamma * s - alpha * e, N) !== 0n) throw new Error('internal: relations');

  const hints: bigint[] = [];
  const T: Array<Point | undefined> = new Array(16).fill(undefined);
  T[1] = alpha < 0n ? neg(R) : R;
  T[2] = beta < 0n ? Q : neg(Q);
  T[4] = neg(G);
  T[8] = neg(G128);
  for (const [k, i, j] of TABLE_SUMS) {
    const a = T[i];
    const b = T[j];
    if (a === undefined || b === undefined) throw new Error('internal: table order');
    const { point, lambda } = addWithHint(a, b);
    T[k] = point;
    hints.push(lambda);
  }
  const A = alpha < 0n ? -alpha : alpha;
  const Bb = beta < 0n ? -beta : beta;
  const g0 = gamma % (1n << 128n);
  const g1 = gamma >> 128n;
  let acc: Point = G;
  for (let i = SCALAR_BITS - 1; i >= 0; i--) {
    const dbl = doubleWithHint(acc);
    acc = dbl.point;
    hints.push(dbl.lambda);
    const bi = BigInt(i);
    const d = Number(((A >> bi) & 1n) | (((Bb >> bi) & 1n) << 1n) | (((g0 >> bi) & 1n) << 2n) | (((g1 >> bi) & 1n) << 3n));
    if (d !== 0) {
      const t = T[d];
      if (t === undefined) throw new Error('internal: table');
      const sum = addWithHint(acc, t);
      acc = sum.point;
      hints.push(sum.lambda);
    }
  }
  if (acc.x !== G128.x || acc.y !== G128.y) throw new Error('internal: accumulator mismatch');
  return { r, ry: mod(R.y, P), s, alpha, beta, gamma, hints };
};
