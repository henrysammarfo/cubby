/**
 * Software passkey for tests and local runs: a WebCrypto P-256 key that
 * produces byte-exact WebAuthn assertions (authenticatorData, clientDataJSON,
 * DER signature). The private key is non-extractable and lives only in memory.
 */
import { webcrypto } from 'node:crypto';
import { flattenBinArray, sha256, utf8ToBin } from '@bitauth/libauth';
import type { Point } from './p256.js';
import type { Assertion } from './webauthn.js';
import { base64url, decodeUncompressed } from './webauthn.js';

const toDer = (raw: Uint8Array): Uint8Array => {
  const int = (b: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.subarray(i);
    if ((v[0] ?? 0) & 0x80) v = flattenBinArray([Uint8Array.of(0), v]);
    return flattenBinArray([Uint8Array.of(0x02, v.length), v]);
  };
  const body = flattenBinArray([int(raw.subarray(0, 32)), int(raw.subarray(32, 64))]);
  return flattenBinArray([Uint8Array.of(0x30, body.length), body]);
};

export interface AssertOptions {
  readonly origin?: string;
  /** Extra JSON members after crossOrigin, e.g. Chrome's other_keys_can_be_added_here. */
  readonly extra?: string;
  /** authenticatorData flags byte. 0x05 = UP | UV. */
  readonly flags?: number;
  /** Override the rpId hashed into authenticatorData. */
  readonly rpId?: string;
  readonly type?: string;
}

export interface SoftPasskey {
  readonly publicKey: Point;
  readonly rpId: string;
  assert(challenge: Uint8Array, options?: AssertOptions): Promise<Assertion>;
}

export const createSoftPasskey = async (rpId: string): Promise<SoftPasskey> => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  let counter = 0;
  return {
    publicKey: decodeUncompressed(raw),
    rpId,
    async assert(challenge, o = {}) {
      counter += 1;
      const authenticatorData = flattenBinArray([
        sha256.hash(utf8ToBin(o.rpId ?? rpId)),
        Uint8Array.of(o.flags ?? 0x05),
        Uint8Array.of((counter >>> 24) & 0xff, (counter >>> 16) & 0xff, (counter >>> 8) & 0xff, counter & 0xff),
      ]);
      const origin = o.origin ?? `https://${rpId}`;
      const json = `{"type":"${o.type ?? 'webauthn.get'}","challenge":"${base64url(challenge)}","origin":"${origin}","crossOrigin":false${o.extra ?? ''}}`;
      const clientDataJSON = utf8ToBin(json);
      const signed = flattenBinArray([authenticatorData, sha256.hash(clientDataJSON)]);
      const sig = new Uint8Array(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new Uint8Array(signed)));
      return { authenticatorData, clientDataJSON, signature: toDer(sig) };
    },
  };
};
