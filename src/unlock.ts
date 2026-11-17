/** Builds the push-only unlocking bytecode for a vault input. */
import { bigIntToVmNumber, encodeDataPush, flattenBinArray, sha256, type TransactionBch } from '@bitauth/libauth';
import type { Vault, VaultParams } from './covenant.js';
import { buildWitness, type Witness } from './hints.js';
import { intentHash } from './intent.js';
import { decodeUncompressed, parseDerSignature, splitClientData, type Assertion } from './webauthn.js';

export const HINTS_PER_CHUNK = 32; // 1,024 bytes per OP_PUSHDATA2 push
export const MAX_STANDARD_UNLOCKING = 10_000;

const pushNum = (n: bigint): Uint8Array => encodeDataPush(bigIntToVmNumber(n));

const le32 = (v: bigint): Uint8Array => {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x !== 0n) throw new Error('hint exceeds 32 bytes');
  return out;
};

export interface UnlockParts {
  readonly authenticatorData: Uint8Array;
  readonly clientDataSuffix: Uint8Array;
  readonly witness: Witness;
  readonly padBytes: number;
}

export const encodeUnlocking = (vault: Vault, parts: UnlockParts): Uint8Array => {
  const { witness: w } = parts;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < w.hints.length; i += HINTS_PER_CHUNK) {
    chunks.push(flattenBinArray(w.hints.slice(i, i + HINTS_PER_CHUNK).map(le32)));
  }
  return flattenBinArray([
    encodeDataPush(new Uint8Array(parts.padBytes)),
    encodeDataPush(parts.authenticatorData.subarray(32)),
    encodeDataPush(parts.clientDataSuffix),
    pushNum(w.s),
    pushNum(w.r),
    pushNum(w.ry),
    pushNum(w.alpha),
    pushNum(w.beta),
    pushNum(w.gamma),
    ...chunks.map((c) => encodeDataPush(c)),
    pushNum(BigInt(chunks.length)),
    encodeDataPush(vault.redeemBytecode),
  ]);
};

/** Message hash an authenticator signs: sha256(authenticatorData | sha256(clientDataJSON)). */
export const assertionMessageHash = (a: Assertion): bigint =>
  BigInt(`0x${Buffer.from(sha256.hash(flattenBinArray([a.authenticatorData, sha256.hash(a.clientDataJSON)]))).toString('hex')}`);

/**
 * Full path from a WebAuthn assertion to unlocking bytecode for input `inputIndex`.
 * `padBytes` raises the operation-cost budget: (41 + unlocking length) * 800.
 */
export const unlockFromAssertion = (
  vault: Vault,
  params: VaultParams,
  tx: TransactionBch,
  inputIndex: number,
  assertion: Assertion,
  padBytes = 0,
): Uint8Array => {
  if (Buffer.compare(assertion.authenticatorData.subarray(0, 32), params.rpIdHash) !== 0) {
    throw new Error('authenticatorData rpIdHash does not match this vault');
  }
  const suffix = splitClientData(assertion.clientDataJSON, intentHash(tx, inputIndex));
  const { r, s } = parseDerSignature(assertion.signature);
  const witness = buildWitness(assertionMessageHash(assertion), r, s, params.publicKey);
  const unlocking = encodeUnlocking(vault, { authenticatorData: assertion.authenticatorData, clientDataSuffix: suffix, witness, padBytes });
  if (unlocking.length > MAX_STANDARD_UNLOCKING) {
    // Rare (not seen in 300 test signatures). A fresh signature changes the size; ask the user to approve once more.
    throw new UnlockingTooLargeError(unlocking.length);
  }
  return unlocking;
};

export class UnlockingTooLargeError extends Error {
  constructor(readonly length: number) {
    super(`unlocking bytecode is ${length} bytes, over the ${MAX_STANDARD_UNLOCKING}-byte standard limit; request a fresh signature`);
  }
}

export { decodeUncompressed };
