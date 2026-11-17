import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { halfScalarCandidates, halfScalars } from '../src/hints.js';
import { G, G128, N, P, double, isOnCurve, liftX, mod, multiply } from '../src/p256.js';
import { parseDerSignature } from '../src/webauthn.js';

const rand = (): bigint => BigInt(`0x${Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex')}`) % N;

describe('P-256 helpers', () => {
  it('constants are on the curve and G\' = 2^128 G', () => {
    expect(isOnCurve(G)).toBe(true);
    expect(isOnCurve(G128)).toBe(true);
    let acc = G;
    for (let i = 0; i < 128; i++) acc = double(acc);
    expect(acc).toEqual(G128);
    expect(multiply(1n << 128n, G)).toEqual(G128);
  });

  it('liftX recovers G', () => {
    expect(liftX(G.x, (G.y & 1n) === 1n)).toEqual(G);
  });

  it('half-size scalars satisfy beta = alpha * u2 (mod n) with both below 2^128', () => {
    for (let i = 0; i < 300; i++) {
      const u1 = rand();
      const u2 = rand();
      for (const { alpha, beta } of halfScalarCandidates(u2)) {
        expect(mod(beta - alpha * u2, N)).toBe(0n);
        expect(alpha !== 0n).toBe(true);
        expect((alpha < 0n ? -alpha : alpha) < 1n << 128n).toBe(true);
        expect((beta < 0n ? -beta : beta) < 1n << 128n).toBe(true);
      }
      const best = halfScalars(u1, u2);
      expect(mod(best.gamma - best.alpha * u1, N)).toBe(0n);
    }
  });

  it('parses DER signatures with and without leading zero bytes', () => {
    const der = Uint8Array.from([0x30, 0x08, 0x02, 0x02, 0x00, 0x80, 0x02, 0x02, 0x01, 0x02]);
    expect(parseDerSignature(der)).toEqual({ r: 0x80n, s: 0x0102n });
    expect(() => parseDerSignature(Uint8Array.from([0x31, 0x00]))).toThrow();
  });

  it('field prime is the NIST P-256 prime', () => {
    expect(P).toBe((1n << 256n) - (1n << 224n) + (1n << 192n) + (1n << 96n) - 1n);
  });
});
