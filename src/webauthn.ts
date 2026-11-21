/** WebAuthn assertion helpers (W3C WebAuthn Level 3). */
import { utf8ToBin } from '@bitauth/libauth';
import { CLIENT_DATA_PREFIX } from './covenant.js';

/** RFC 4648 section 5 alphabet. Encoding never emits padding; decoding accepts it. */
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const sextetChar = (n: number): string => {
  const ch = B64URL[n & 63];
  if (ch === undefined) throw new Error('base64url: invalid sextet');
  return ch;
};

const B64URL_TABLE = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64URL.length; i++) table[B64URL.charCodeAt(i)] = i;
  return table;
})();

/** Encode bytes as unpadded base64url. Works in Node and the browser (no Buffer encodings). */
export const base64url = (data: Uint8Array): string => {
  let out = '';
  const len = data.length;
  for (let i = 0; i < len; i += 3) {
    const a = data[i] ?? 0;
    const b = i + 1 < len ? (data[i + 1] ?? 0) : 0;
    const c = i + 2 < len ? (data[i + 2] ?? 0) : 0;
    const n = (a << 16) | (b << 8) | c;
    const remain = len - i;
    out += sextetChar(n >> 18);
    out += sextetChar(n >> 12);
    if (remain > 1) out += sextetChar(n >> 6);
    if (remain > 2) out += sextetChar(n);
  }
  return out;
};

/** Decode unpadded or padded base64url. Rejects invalid length and alphabet. */
export const fromBase64url = (s: string): Uint8Array => {
  const input = s.replace(/=+$/, '');
  if (input.length === 0) return new Uint8Array(0);
  if (input.length % 4 === 1) throw new Error('Invalid base64url');
  const out = new Uint8Array(Math.floor((input.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < input.length; i += 4) {
    const valueAt = (idx: number, required: boolean): number => {
      if (idx >= input.length) {
        if (required) throw new Error('Invalid base64url');
        return 0;
      }
      const v = B64URL_TABLE[input.charCodeAt(idx)] ?? -1;
      if (v < 0) throw new Error('Invalid base64url');
      return v;
    };
    const n =
      (valueAt(i, true) << 18) |
      (valueAt(i + 1, true) << 12) |
      (valueAt(i + 2, false) << 6) |
      valueAt(i + 3, false);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < input.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < input.length) out[o++] = n & 255;
  }
  return out;
};


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


/** Copy a view into a standalone ArrayBuffer (Safari rejects a shared backing buffer). */
export const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
};

/** Minimal CBOR reader for a WebAuthn attestation object (maps, bytes, ints). */
type Cbor = number | bigint | Uint8Array | Cbor[] | Map<Cbor, Cbor> | string;

export const decodeCbor = (bytes: Uint8Array, start = 0): { value: Cbor; offset: number } => {
  const byte = bytes[start];
  if (byte === undefined) throw new Error('CBOR: truncated');
  const major = byte >> 5;
  let addi = byte & 31;
  let offset = start + 1;
  const take = (n: number): Uint8Array => {
    const slice = bytes.subarray(offset, offset + n);
    if (slice.length !== n) throw new Error('CBOR: truncated');
    offset += n;
    return slice;
  };
  const lenOf = (): number => {
    if (addi < 24) return addi;
    if (addi === 24) return take(1)[0]!;
    if (addi === 25) { const v = take(2); return (v[0]! << 8) | v[1]!; }
    if (addi === 26) { const v = take(4); return Number((BigInt(v[0]!) << 24n) | (BigInt(v[1]!) << 16n) | (BigInt(v[2]!) << 8n) | BigInt(v[3]!)); }
    throw new Error('CBOR: length too large');
  };
  if (major === 0) return { value: lenOf(), offset };
  if (major === 1) return { value: -1 - lenOf(), offset };
  if (major === 2) { const n = lenOf(); return { value: take(n), offset }; }
  if (major === 3) { const n = lenOf(); return { value: new TextDecoder().decode(take(n)), offset }; }
  if (major === 4) {
    const n = lenOf();
    const arr: Cbor[] = [];
    for (let i = 0; i < n; i++) {
      const next = decodeCbor(bytes, offset);
      arr.push(next.value);
      offset = next.offset;
    }
    return { value: arr, offset };
  }
  if (major === 5) {
    const n = lenOf();
    const map = new Map<Cbor, Cbor>();
    for (let i = 0; i < n; i++) {
      const k = decodeCbor(bytes, offset);
      const v = decodeCbor(bytes, k.offset);
      map.set(k.value, v.value);
      offset = v.offset;
    }
    return { value: map, offset };
  }
  throw new Error(`CBOR: unsupported major type ${major}`);
};

const mapGet = (map: Map<Cbor, Cbor>, key: number): Cbor | undefined => {
  for (const [k, v] of map) if (k === key) return v;
  return undefined;
};

/** Read an uncompressed P-256 point from a COSE_Key map (kty=2, crv=1, x=-2, y=-3). */
export const publicKeyFromCose = (cose: Uint8Array): { x: bigint; y: bigint } => {
  const { value } = decodeCbor(cose);
  if (!(value instanceof Map)) throw new Error('COSE key is not a map');
  const kty = mapGet(value, 1);
  const crv = mapGet(value, -1);
  const x = mapGet(value, -2);
  const y = mapGet(value, -3);
  if (kty !== 2 || crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
    throw new Error('The phone lock did not return a P-256 public key.');
  }
  return { x: BigInt(`0x${Buffer.from(x).toString('hex')}`), y: BigInt(`0x${Buffer.from(y).toString('hex')}`) };
};

/** Pull the public key out of a WebAuthn attestation object when getPublicKey() is missing. */
export const publicKeyFromAttestationObject = (attestationObject: Uint8Array): { x: bigint; y: bigint } => {
  const { value } = decodeCbor(attestationObject);
  if (!(value instanceof Map)) throw new Error('attestation object is not a map');
  const authData = value.get('authData');
  if (!(authData instanceof Uint8Array) || authData.length < 55) throw new Error('The device did not return a public key.');
  const flags = authData[32]!;
  if ((flags & 0x40) === 0) throw new Error('The device did not return a public key.');
  const idLen = (authData[53]! << 8) | authData[54]!;
  const coseStart = 55 + idLen;
  if (coseStart >= authData.length) throw new Error('The device did not return a public key.');
  return publicKeyFromCose(authData.subarray(coseStart));
};

export const UP_UV = 0x05;

export const assertAuthenticatorFlags = (authenticatorData: Uint8Array, rpIdHash: Uint8Array): void => {
  if (authenticatorData.length < 37) throw new Error('The phone lock reply was too short.');
  if (Buffer.compare(authenticatorData.subarray(0, 32), rpIdHash) !== 0) {
    throw new Error('This phone lock belongs to a different website address. Open the live Cubby site and try again.');
  }
  const flags = authenticatorData[32]!;
  if ((flags & UP_UV) !== UP_UV) {
    throw new Error('The phone lock did not confirm it was you. Unlock the device and approve again.');
  }
};
