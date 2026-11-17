/** WebAuthn assertion helpers (W3C WebAuthn Level 3). */
import { utf8ToBin } from '@bitauth/libauth';
import { CLIENT_DATA_PREFIX } from './covenant.js';

export const base64url = (data: Uint8Array): string => Buffer.from(data).toString('base64url');
export const fromBase64url = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64url'));

export interface Assertion {
  /** Raw authenticatorData bytes. */
  readonly authenticatorData: Uint8Array;
  /** Raw clientDataJSON bytes exactly as the browser produced them. */
  readonly clientDataJSON: Uint8Array;
  /** ASN.1 DER ECDSA signature as returned by navigator.credentials.get. */
  readonly signature: Uint8Array;
}

/** Split clientDataJSON into prefix | challenge | suffix and check the challenge. */
export const splitClientData = (clientDataJSON: Uint8Array, challenge: Uint8Array): Uint8Array => {
  const expected = utf8ToBin(base64url(challenge));
  const prefix = clientDataJSON.subarray(0, CLIENT_DATA_PREFIX.length);
  if (Buffer.compare(prefix, CLIENT_DATA_PREFIX) !== 0) {
    throw new Error(`clientDataJSON does not start with ${Buffer.from(CLIENT_DATA_PREFIX).toString()}`);
  }
  const chal = clientDataJSON.subarray(CLIENT_DATA_PREFIX.length, CLIENT_DATA_PREFIX.length + expected.length);
  if (Buffer.compare(chal, expected) !== 0) throw new Error('clientDataJSON challenge is not the intent hash');
  const suffix = clientDataJSON.subarray(CLIENT_DATA_PREFIX.length + expected.length);
  if (suffix[0] !== 0x22) throw new Error('challenge string is not closed after 43 chars');
  return suffix;
};

/** Parse a DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s }). */
export const parseDerSignature = (der: Uint8Array): { r: bigint; s: bigint } => {
  let i = 0;
  const byte = (): number => {
    const b = der[i++];
    if (b === undefined) throw new Error('DER: truncated');
    return b;
  };
  if (byte() !== 0x30) throw new Error('DER: expected SEQUENCE');
  const seqLen = byte();
  if (seqLen + 2 !== der.length) throw new Error('DER: bad length');
  const int = (): bigint => {
    if (byte() !== 0x02) throw new Error('DER: expected INTEGER');
    const len = byte();
    const bytes = der.subarray(i, i + len);
    i += len;
    if (bytes.length !== len || len === 0 || len > 33) throw new Error('DER: bad integer');
    return BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
  };
  const r = int();
  const s = int();
  if (i !== der.length) throw new Error('DER: trailing bytes');
  return { r, s };
};

/** Decode an uncompressed SEC1 point (0x04 | X | Y), e.g. from an SPKI's last 65 bytes. */
export const decodeUncompressed = (bytes: Uint8Array): { x: bigint; y: bigint } => {
  const pt = bytes.length === 65 ? bytes : bytes.subarray(bytes.length - 65);
  if (pt[0] !== 0x04) throw new Error('expected an uncompressed P-256 point');
  return {
    x: BigInt(`0x${Buffer.from(pt.subarray(1, 33)).toString('hex')}`),
    y: BigInt(`0x${Buffer.from(pt.subarray(33, 65)).toString('hex')}`),
  };
};
