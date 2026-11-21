/**
 * A software passkey built from a stored P-256 private key, for tests and chipnet demos only.
 * It produces the same byte layout as a platform authenticator (WebAuthn L3 6.1 authenticatorData,
 * 5.8.1 CollectedClientData, DER ECDSA signature over sha256(authenticatorData | sha256(clientDataJSON))).
 * Signing is synchronous so it can run inside SDK unlockers. Real users sign with navigator.credentials.get.
 */
import { p256 } from '@noble/curves/nist.js';
import { flattenBinArray, sha256, utf8ToBin } from '@bitauth/libauth';
import type { Point } from '../p256.js';
import { base64url, type Assertion } from '../webauthn.js';

export interface KeyedPasskey {
  readonly publicKey: Point;
  readonly rpId: string;
  assert(challenge: Uint8Array): Assertion;
}

export const keyedPasskey = (privateKey: Uint8Array, rpId: string): KeyedPasskey => {
  const pub = p256.getPublicKey(privateKey, false);
  const hex = (b: Uint8Array) => BigInt(`0x${Buffer.from(b).toString('hex')}`);
  const publicKey = { x: hex(pub.subarray(1, 33)), y: hex(pub.subarray(33, 65)) };
  let counter = 0;
  return {
    publicKey,
    rpId,
    assert(challenge) {
      counter += 1;
      const authenticatorData = flattenBinArray([
        sha256.hash(utf8ToBin(rpId)),
        Uint8Array.of(0x05),
        Uint8Array.of((counter >>> 24) & 0xff, (counter >>> 16) & 0xff, (counter >>> 8) & 0xff, counter & 0xff),
      ]);
      const json = `{"type":"webauthn.get","challenge":"${base64url(challenge)}","origin":"https://${rpId}","crossOrigin":false}`;
      const clientDataJSON = utf8ToBin(json);
      const message = flattenBinArray([authenticatorData, sha256.hash(clientDataJSON)]);
      // noble hashes the message with sha256 by default (prehash), matching WebAuthn ES256.
      const signature = p256.sign(message, privateKey, { format: 'der', lowS: false });
      return { authenticatorData, clientDataJSON, signature };
    },
  };
};

/** A fresh random P-256 private key (tests and demos). */
export const randomPasskeyKey = (): Uint8Array => p256.utils.randomSecretKey();
