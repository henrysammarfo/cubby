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

import {
  assertAuthenticatorFlags,
  publicKeyFromCose,
  publicKeyFromAttestationObject,
  toArrayBuffer,
  UP_UV,
} from '../src/webauthn.js';
import { sha256, utf8ToBin } from '@bitauth/libauth';

describe('WebAuthn parsing for device locks', () => {
  it('copies a view into a standalone ArrayBuffer', () => {
    const bigger = new Uint8Array([0, 1, 2, 3, 4]);
    const view = bigger.subarray(1, 4);
    const buf = toArrayBuffer(view);
    expect(buf.byteLength).toBe(3);
    expect([...new Uint8Array(buf)]).toEqual([1, 2, 3]);
  });

  it('requires UP and UV flags and a matching website hash', () => {
    const rp = sha256.hash(utf8ToBin('cubby-liart-six.vercel.app'));
    const data = new Uint8Array(37);
    data.set(rp, 0);
    data[32] = UP_UV;
    expect(() => assertAuthenticatorFlags(data, rp)).not.toThrow();
    data[32] = 0x01; // UP only
    expect(() => assertAuthenticatorFlags(data, rp)).toThrow(/confirm it was you/);
    data[32] = UP_UV;
    if (data[0] !== undefined) data[0] ^= 1;
    expect(() => assertAuthenticatorFlags(data, rp)).toThrow(/different website address/);
  });

  it('reads a P-256 public key from a COSE map', () => {
    const x = new Uint8Array(32).fill(0x11);
    const y = new Uint8Array(32).fill(0x22);
    // a5 { 1: 2, 3: -7, -1: 1, -2: x, -3: y }
    const cose = Uint8Array.from([
      0xa5,
      0x01, 0x02,
      0x03, 0x26,
      0x20, 0x01,
      0x21, 0x58, 0x20, ...x,
      0x22, 0x58, 0x20, ...y,
    ]);
    const point = publicKeyFromCose(cose);
    expect(point.x.toString(16).padStart(64, '0')).toBe('11'.repeat(32));
    expect(point.y.toString(16).padStart(64, '0')).toBe('22'.repeat(32));
  });

  it('reads the public key from an attestation object when getPublicKey is missing', () => {
    const rp = sha256.hash(utf8ToBin('example.invalid'));
    const flags = 0x45; // UP | UV | AT
    const id = Uint8Array.from([9, 8, 7]);
    const x = new Uint8Array(32).fill(0x33);
    const y = new Uint8Array(32).fill(0x44);
    const cose = Uint8Array.from([
      0xa5,
      0x01, 0x02,
      0x03, 0x26,
      0x20, 0x01,
      0x21, 0x58, 0x20, ...x,
      0x22, 0x58, 0x20, ...y,
    ]);
    const authData = new Uint8Array(37 + 16 + 2 + id.length + cose.length);
    authData.set(rp, 0);
    authData[32] = flags;
    authData.set(new Uint8Array(16), 37); // aaguid
    authData[53] = 0;
    authData[54] = id.length;
    authData.set(id, 55);
    authData.set(cose, 55 + id.length);
    const encodeBytes = (b: Uint8Array) => (b.length < 24 ? Uint8Array.from([0x40 | b.length, ...b]) : Uint8Array.from([0x58, b.length, ...b]));
    const encodeText = (s: string) => Uint8Array.from([0x60 | s.length, ...Buffer.from(s)]);
    const authEnc = encodeBytes(authData);
    const fmt = Uint8Array.from([...encodeText('fmt'), ...encodeText('none')]);
    const ad = Uint8Array.from([...encodeText('authData'), ...authEnc]);
    const att = Uint8Array.from([0xa2, ...fmt, ...ad]);
    const point = publicKeyFromAttestationObject(att);
    expect(point.x.toString(16).padStart(64, '0')).toBe('33'.repeat(32));
    expect(point.y.toString(16).padStart(64, '0')).toBe('44'.repeat(32));
  });
});
