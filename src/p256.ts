/**
 * Minimal affine P-256 (secp256r1) arithmetic used OFF-CHAIN to produce the
 * hints the covenant checks. Written from the curve definition in
 * SEC 2 v2 section 2.4.2 / FIPS 186-5. Not constant-time: it only ever sees
 * public data (signatures, public keys), never private keys.
 */
export const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
export const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
export const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
export const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
export const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

export interface Point {
  readonly x: bigint;
  readonly y: bigint;
}

export const G: Point = { x: GX, y: GY };

export const mod = (a: bigint, m: bigint): bigint => {
  const r = a % m;
  return r < 0n ? r + m : r;
};

export const modPow = (base: bigint, exp: bigint, m: bigint): bigint => {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
};

export const inv = (a: bigint, m: bigint): bigint => {
  const v = mod(a, m);
  if (v === 0n) throw new Error('inverse of zero');
  return modPow(v, m - 2n, m); // m is prime (P and N both are)
};

export const isOnCurve = (pt: Point): boolean =>
  mod(pt.y * pt.y - (pt.x * pt.x * pt.x - 3n * pt.x + B), P) === 0n;

export const neg = (pt: Point): Point => ({ x: pt.x, y: mod(-pt.y, P) });

/** Chord addition. Returns the slope used, which becomes the script hint. */
export const addWithHint = (a: Point, b: Point): { point: Point; lambda: bigint } => {
  const dx = mod(b.x - a.x, P);
  if (dx === 0n) throw new Error('edge case: adding points with equal x');
  const lambda = mod((b.y - a.y) * inv(dx, P), P);
  const x = mod(lambda * lambda - a.x - b.x, P);
  const y = mod(lambda * (a.x - x) - a.y, P);
  return { point: { x, y }, lambda };
};

/** Tangent doubling (curve a = -3). Returns the slope used as hint. */
export const doubleWithHint = (a: Point): { point: Point; lambda: bigint } => {
  if (mod(a.y, P) === 0n) throw new Error('edge case: doubling a 2-torsion point');
  const lambda = mod((3n * a.x * a.x - 3n) * inv(2n * a.y, P), P);
  const x = mod(lambda * lambda - 2n * a.x, P);
  const y = mod(lambda * (a.x - x) - a.y, P);
  return { point: { x, y }, lambda };
};

export const add = (a: Point, b: Point): Point => addWithHint(a, b).point;
export const double = (a: Point): Point => doubleWithHint(a).point;

/** Plain double-and-add, only for deriving constants and test data. */
export const multiply = (k: bigint, pt: Point): Point => {
  let acc: Point | undefined;
  let addend = pt;
  let e = mod(k, N);
  if (e === 0n) throw new Error('multiply by zero');
  while (e > 0n) {
    if (e & 1n) acc = acc === undefined ? addend : addCompleteish(acc, addend);
    addend = double(addend);
    e >>= 1n;
  }
  if (acc === undefined) throw new Error('unreachable');
  return acc;
};

const addCompleteish = (a: Point, b: Point): Point => {
  if (a.x === b.x) {
    if (a.y === b.y) return double(a);
    throw new Error('result is the point at infinity');
  }
  return add(a, b);
};

/** G' = 2^128 * G, the second fixed base. */
export const G128: Point = (() => {
  let acc = G;
  for (let i = 0; i < 128; i++) acc = double(acc);
  return acc;
})();

/** G + G', used for the constant table entry 12. */
export const G_PLUS_G128: Point = add(G, G128);

/** Lift an x-coordinate to a curve point (P = 3 mod 4, so sqrt is a power). */
export const liftX = (x: bigint, odd: boolean): Point => {
  const rhs = mod(x * x * x - 3n * x + B, P);
  const y = modPow(rhs, (P + 1n) / 4n, P);
  if (mod(y * y, P) !== rhs) throw new Error('x is not on the curve');
  const yy = (y & 1n) === (odd ? 1n : 0n) ? y : mod(-y, P);
  return { x, y: yy };
};
