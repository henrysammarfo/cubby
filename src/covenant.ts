/**
 * Cubby signing gate covenant (S1).
 *
 * One P2SH32 input verifies a WebAuthn (passkey, P-256 ECDSA) assertion whose
 * challenge is an intent hash the script rebuilds from the spending
 * transaction by introspection. Written from scratch for Cubby.
 *
 * Verification strategy (see DOCS_NOTES.md for sources):
 *  - ECDSA check  R = u1*G + u2*Q  is rewritten with half-size scalars
 *    (Antipa et al., "Accelerated verification of ECDSA signatures", SAC 2005):
 *    the spender supplies a, b with |a|,|b| < 2^128 and b*s = a*r (mod n),
 *    and gamma = a*u1 (mod n) proven by gamma*s = a*e (mod n). The script then
 *    checks  |a|*R~ + |b|*Q~ + g0*(-G) + g1*(-G') = O  where G' = 2^128 G,
 *    with a 4-way joint double-and-add over 128 bits.
 *  - Every elliptic-curve step uses affine coordinates with a supplied slope
 *    (lambda) that the script checks with one multiplication, so no modular
 *    inversion runs on chain.
 *  - The accumulator starts at G, so it never reaches the point at infinity
 *    and the final value must equal 2^128 * G.
 */
import { binToHex, cashAssemblyToBin, hash256, encodeLockingBytecodeP2sh32, utf8ToBin } from '@bitauth/libauth';
import { Asm } from './asm.js';
import { B, G, G128, N, P, type Point } from './p256.js';

export const FN = { MODP: 1, HINT: 2, ADD: 3, DBL: 4, B64: 5, N: 6 } as const;

/** WebAuthn CollectedClientData always serializes type then challenge first (WebAuthn L3, 5.8.1.1). */
export const CLIENT_DATA_PREFIX = utf8ToBin('{"type":"webauthn.get","challenge":"');

export const SCALAR_BITS = 128;

export interface VaultParams {
  /** Passkey public key (uncompressed affine point). */
  readonly publicKey: Point;
  /** sha256 of the WebAuthn relying party ID, e.g. sha256("cubby.cash"). */
  readonly rpIdHash: Uint8Array;
  /**
   * Optional "never stuck" backup. When set, a coin that has not moved for
   * `delayBlocks` blocks may be spent with no passkey, but only to
   * `lockingBytecode` (the owner's own backup wallet), as the single output,
   * keeping any tokens, and paying at most RECOVERY_MAX_FEE_SATS in fee.
   * Leaving it unset gives the exact same script (and address) as before.
   */
  readonly backup?: BackupParams;
}

export interface BackupParams {
  /** Locking bytecode of the backup wallet (P2PKH, P2SH20 or P2SH32). */
  readonly lockingBytecode: Uint8Array;
  /** Relative timelock in blocks (BIP68 block units), 1 to 65,535. */
  readonly delayBlocks: number;
}

/** Most the recovery path may pay in fee. A recovery spend is about 1,250 bytes, so 1 sat per byte fits with room. */
export const RECOVERY_MAX_FEE_SATS = 3_000n;
/** BIP68 block-based relative locks use the low 16 bits of the sequence number. */
export const MAX_RECOVERY_DELAY_BLOCKS = 0xffff;

const isStandardPayLocking = (b: Uint8Array): boolean => {
  const hex = binToHex(b);
  return (
    /^76a914[0-9a-f]{40}88ac$/u.test(hex) || // P2PKH
    /^a914[0-9a-f]{40}87$/u.test(hex) || // P2SH20
    /^aa20[0-9a-f]{64}87$/u.test(hex) // P2SH32
  );
};

/**
 * Recovery branch, run when the top unlocking item is empty (a passkey spend
 * always ends with the hint chunk count, which is at least 1).
 * Opcodes: OP_CHECKSEQUENCEVERIFY (BIP112, relative lock checked against this
 * input's sequence number, BIP68), and the native introspection opcodes from
 * the 2022 CashTokens and introspection upgrades (OP_TXINPUTCOUNT,
 * OP_TXOUTPUTCOUNT, OP_OUTPUTBYTECODE, OP_OUTPUTVALUE, OP_UTXOVALUE,
 * OP_OUTPUTTOKEN* and OP_UTXOTOKEN*).
 */
export const recoveryAsm = (backup: BackupParams): string => {
  const d = backup.delayBlocks;
  if (!Number.isInteger(d) || d < 1 || d > MAX_RECOVERY_DELAY_BLOCKS) {
    throw new Error(`backup delay must be 1 to ${MAX_RECOVERY_DELAY_BLOCKS} blocks`);
  }
  if (!isStandardPayLocking(backup.lockingBytecode)) throw new Error('backup must be a standard P2PKH or P2SH address');
  return [
    'OP_DROP',
    // The coin must be at least `d` blocks old (the node enforces the age; the VM checks the sequence number).
    `<${d}> OP_CHECKSEQUENCEVERIFY OP_DROP`,
    // Exactly one input (so OP_0 below is this coin) and one output.
    'OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY',
    // The only output pays the backup wallet chosen at setup.
    `OP_0 OP_OUTPUTBYTECODE <0x${binToHex(backup.lockingBytecode)}> OP_EQUALVERIFY`,
    // Tokens on the coin, if any, move with it unchanged (nobody can burn them).
    'OP_0 OP_OUTPUTTOKENCATEGORY OP_0 OP_UTXOTOKENCATEGORY OP_EQUALVERIFY',
    'OP_0 OP_OUTPUTTOKENCOMMITMENT OP_0 OP_UTXOTOKENCOMMITMENT OP_EQUALVERIFY',
    'OP_0 OP_OUTPUTTOKENAMOUNT OP_0 OP_UTXOTOKENAMOUNT OP_NUMEQUALVERIFY',
    // Fee cap: output value + max fee >= coin value, so nobody can burn the coins as fee.
    `OP_0 OP_OUTPUTVALUE <${RECOVERY_MAX_FEE_SATS}> OP_ADD OP_0 OP_UTXOVALUE OP_GREATERTHANOREQUAL`,
  ].join('\n');
};

export const compileAsm = (source: string): Uint8Array => {
  const result = cashAssemblyToBin(source);
  if (typeof result === 'string') throw new Error(`asm compile failed: ${result}`);
  return result;
};

const define = (id: number, body: string): string => `<0x${toHex(compileAsm(body))}> <${id}> OP_DEFINE`;
const toHex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

const modp = (a: Asm, out: string): Asm => a.invoke(FN.MODP, 1, [out]);

/** Next 32-byte little-endian hint from the altstack chunks, as a positive number. */
const hintBody = [
  'OP_FROMALTSTACK OP_SIZE OP_NOTIF OP_DROP OP_FROMALTSTACK OP_ENDIF',
  '<32> OP_SPLIT OP_TOALTSTACK <0x00> OP_CAT OP_BIN2NUM',
].join(' ');

/** x1 y1 x2 y2 -> x3 y3 (chord rule, slope from hint). */
const addBody = (): string => {
  const a = new Asm(['x1', 'y1', 'x2', 'y2']);
  a.invoke(FN.HINT, 0, ['L']);
  a.pick('x2').pick('x1').raw('OP_SUB', 2, ['dx']);
  // x1 != x2 (mod p): rejects P + P and P + (-P), the only cases where the slope is not unique.
  a.pick('dx');
  modp(a, 'dxm').raw('OP_VERIFY', 1);
  // L * dx == dy (mod p)
  a.roll('dx').pick('L').raw('OP_MUL', 2, ['t']);
  a.roll('y2').raw('OP_SUB', 2, ['t']).pick('y1').raw('OP_ADD', 2, ['t']);
  modp(a, 't').raw('OP_NOT OP_VERIFY', 1);
  // x3 = L^2 - x1 - x2
  a.pick('L').raw('OP_DUP OP_MUL', 1, ['t']).roll('x2').raw('OP_SUB', 2, ['t']);
  a.pick('x1').raw('OP_SUB', 2, ['t']);
  modp(a, 'x3');
  // y3 = L (x1 - x3) - y1
  a.roll('x1').pick('x3').raw('OP_SUB', 2, ['t']).roll('L').raw('OP_MUL', 2, ['t']);
  a.roll('y1').raw('OP_SUB', 2, ['t']);
  modp(a, 'y3');
  a.assertStack(['x3', 'y3']);
  if (a.stack.length !== 2) throw new Error(`add: leftover ${a.stack.join(' ')}`);
  return a.source();
};

/** x y -> x3 y3 (tangent rule for curve a = -3, slope from hint). */
const dblBody = (): string => {
  const a = new Asm(['x', 'y']);
  a.invoke(FN.HINT, 0, ['L']);
  // L * 2y == 3x^2 - 3 (mod p). P-256 has prime order, so y != 0 for every valid point.
  a.pick('y').raw('OP_DUP OP_ADD', 1, ['t']).pick('L').raw('OP_MUL', 2, ['t']);
  a.pick('x').raw('OP_DUP OP_MUL <3> OP_MUL', 1, ['xx3']).raw('OP_SUB <3> OP_ADD', 2, ['t']);
  modp(a, 't').raw('OP_NOT OP_VERIFY', 1);
  // x3 = L^2 - 2x
  a.pick('L').raw('OP_DUP OP_MUL', 1, ['t']).pick('x').raw('OP_DUP OP_ADD OP_SUB', 2, ['t']);
  modp(a, 'x3');
  // y3 = L (x - x3) - y
  a.roll('x').pick('x3').raw('OP_SUB', 2, ['t']).roll('L').raw('OP_MUL', 2, ['t']);
  a.roll('y').raw('OP_SUB', 2, ['t']);
  modp(a, 'y3');
  a.assertStack(['x3', 'y3']);
  if (a.stack.length !== 2) throw new Error(`dbl: leftover ${a.stack.join(' ')}`);
  return a.source();
};

/** sextet (0..63) -> base64url ASCII code. */
const b64Body = [
  'OP_DUP <26> OP_LESSTHAN OP_IF <65> OP_ELSE',
  'OP_DUP <52> OP_LESSTHAN OP_IF <71> OP_ELSE',
  'OP_DUP <62> OP_LESSTHAN OP_IF <-4> OP_ELSE',
  'OP_DUP <62> OP_EQUAL OP_IF <-17> OP_ELSE <32>',
  'OP_ENDIF OP_ENDIF OP_ENDIF OP_ENDIF OP_ADD',
].join(' ');

const APPEND = 'OP_ROT OP_SWAP OP_CAT OP_SWAP';

/**
 * Intent preimage, rebuilt by introspection (mirrored off chain in intent.ts):
 * outpoint txid (wire order) | outpoint index LE4 | version LE4 | locktime LE4 | output count LE2 |
 * per output: value LE8 | len1 | token category+capability | len2 | commitment | amount LE8 | len2 | locking bytecode
 */
const intentAsm = [
  'OP_INPUTINDEX OP_OUTPOINTTXHASH OP_INPUTINDEX OP_OUTPOINTINDEX <4> OP_NUM2BIN OP_CAT',
  'OP_TXVERSION <4> OP_NUM2BIN OP_CAT OP_TXLOCKTIME <4> OP_NUM2BIN OP_CAT',
  'OP_TXOUTPUTCOUNT <2> OP_NUM2BIN OP_CAT OP_0',
  'OP_BEGIN',
  `OP_DUP OP_OUTPUTVALUE <8> OP_NUM2BIN ${APPEND}`,
  `OP_DUP OP_OUTPUTTOKENCATEGORY OP_SIZE <1> OP_NUM2BIN OP_SWAP OP_CAT ${APPEND}`,
  `OP_DUP OP_OUTPUTTOKENCOMMITMENT OP_SIZE <2> OP_NUM2BIN OP_SWAP OP_CAT ${APPEND}`,
  `OP_DUP OP_OUTPUTTOKENAMOUNT <8> OP_NUM2BIN ${APPEND}`,
  `OP_DUP OP_OUTPUTBYTECODE OP_SIZE <2> OP_NUM2BIN OP_SWAP OP_CAT ${APPEND}`,
  'OP_1ADD OP_DUP OP_TXOUTPUTCOUNT OP_NUMEQUAL OP_UNTIL OP_DROP OP_SHA256',
].join('\n');

/** 32-byte hash -> 43-char base64url (no padding). */
const base64Asm = [
  '<0x00> OP_CAT OP_0 OP_SWAP',
  'OP_BEGIN <3> OP_SPLIT OP_TOALTSTACK OP_REVERSEBYTES <0x00> OP_CAT OP_BIN2NUM',
  ...[18, 12, 6, 0].map(
    (k) => `OP_DUP ${k > 0 ? `<${k}> OP_RSHIFTNUM ` : ''}<64> OP_MOD <${FN.B64}> OP_INVOKE OP_ROT OP_SWAP OP_CAT OP_SWAP`,
  ),
  'OP_DROP OP_FROMALTSTACK OP_SIZE OP_NOT OP_UNTIL OP_DROP <43> OP_SPLIT OP_DROP',
].join('\n');

/** Unlocking stack order, bottom to top (the redeem script is pushed last). */
export const UNLOCK_ORDER = ['pad', 'authDataTail', 'clientDataSuffix', 's', 'r', 'ry', 'alpha', 'beta', 'gamma'] as const;

/** Table entries built from earlier ones: k = i + j. 4 (-G) and 8 (-G') are constants. */
export const TABLE_SUMS: ReadonlyArray<readonly [number, number, number]> = [
  [3, 1, 2], [5, 1, 4], [6, 2, 4], [7, 3, 4],
  [9, 1, 8], [10, 2, 8], [11, 3, 8],
  [12, 4, 8], [13, 1, 12], [14, 2, 12], [15, 3, 12],
];

export const buildRedeemAsm = (params: VaultParams): string => {
  if (params.rpIdHash.length !== 32) throw new Error('rpIdHash must be 32 bytes');
  const parts: string[] = [];
  parts.push(define(FN.MODP, `<${P}> OP_MOD`));
  parts.push(define(FN.HINT, hintBody));
  parts.push(define(FN.ADD, addBody()));
  parts.push(define(FN.DBL, dblBody()));
  parts.push(define(FN.B64, b64Body));
  parts.push(define(FN.N, `<${N}>`));

  const a = new Asm([...UNLOCK_ORDER, 'K']);
  // Move hint chunks (pushed between gamma and K) to the altstack, first chunk on top.
  a.raw('OP_BEGIN OP_SWAP OP_TOALTSTACK OP_1SUB OP_DUP OP_NOT OP_UNTIL OP_DROP', 1);

  // Padding only raises the operation-cost budget; it must be zero bytes.
  a.roll('pad').raw('OP_BIN2NUM OP_NOT OP_VERIFY', 1);

  // 1. Intent hash and its base64url form (the WebAuthn challenge).
  a.raw(intentAsm, 0, ['intent']);
  a.raw(base64Asm, 1, ['chal']);

  // 2. clientDataJSON = prefix | challenge | suffix ; suffix must close the challenge string.
  a.bytes(CLIENT_DATA_PREFIX, 'pfx').roll('chal').raw('OP_CAT', 2, ['cdj']);
  a.pick('clientDataSuffix').raw('<1> OP_SPLIT OP_DROP <0x22> OP_EQUALVERIFY', 1);
  a.roll('clientDataSuffix').raw('OP_CAT OP_SHA256', 2, ['cdjHash']);

  // 3. authenticatorData = rpIdHash (fixed in the script) | flags | signCount | extensions.
  //    Flags must have UP (0x01) and UV (0x04).
  a.pick('authDataTail').raw('<1> OP_SPLIT OP_DROP <0x05> OP_AND <0x05> OP_EQUALVERIFY', 1);
  a.bytes(params.rpIdHash, 'rpid').roll('authDataTail').raw('OP_CAT', 2, ['authData']);

  // 4. e = sha256(authData | sha256(clientDataJSON)) as a big-endian integer.
  a.roll('authData').roll('cdjHash').raw('OP_CAT OP_SHA256 OP_REVERSEBYTES <0x00> OP_CAT OP_BIN2NUM', 2, ['e']);

  // 5. Signature range checks: 1 <= r, s < n.
  for (const v of ['r', 's']) {
    a.pick(v).num(1).invoke(FN.N, 0, ['n']).raw('OP_WITHIN OP_VERIFY', 3);
  }
  // R = (r, ry) is on the curve: ry^2 - r^3 + 3r - b == 0 (mod p).
  a.pick('ry').raw('OP_DUP OP_MUL', 1, ['t']);
  a.pick('r').raw('OP_DUP OP_DUP OP_MUL OP_MUL', 1, ['r3']).raw('OP_SUB', 2, ['t']);
  a.pick('r').raw('<3> OP_MUL', 1, ['r3x']).raw('OP_ADD', 2, ['t']);
  a.num(B).raw('OP_SUB', 2, ['t']);
  modp(a, 't').raw('OP_NOT OP_VERIFY', 1);

  // 6. Half-size scalars: 0 < |alpha| < 2^128, |beta| < 2^128, 0 <= gamma < 2^256.
  a.pick('alpha').raw('OP_ABS', 1, ['A']);
  a.pick('A').raw('OP_DUP <128> OP_RSHIFTNUM OP_NOT OP_VERIFY OP_VERIFY', 1);
  a.pick('beta').raw('OP_ABS', 1, ['Bb']);
  a.pick('Bb').raw('<128> OP_RSHIFTNUM OP_NOT OP_VERIFY', 1);
  a.pick('gamma').raw('<128> OP_RSHIFTNUM', 1, ['G1']);
  a.pick('G1').raw('<128> OP_RSHIFTNUM OP_NOT OP_VERIFY', 1);
  a.pick('gamma').raw('<1> <128> OP_LSHIFTNUM OP_MOD', 1, ['G0']);

  // beta*s == alpha*r (mod n)   and   gamma*s == alpha*e (mod n)
  a.pick('beta').pick('s').raw('OP_MUL', 2, ['t']).pick('alpha').pick('r').raw('OP_MUL', 2, ['u']);
  a.raw('OP_SUB', 2, ['t']).invoke(FN.N, 0, ['n']).raw('OP_MOD OP_NOT OP_VERIFY', 2);
  a.roll('gamma').roll('s').raw('OP_MUL', 2, ['t']).pick('alpha').roll('e').raw('OP_MUL', 2, ['u']);
  a.raw('OP_SUB', 2, ['t']).invoke(FN.N, 0, ['n']).raw('OP_MOD OP_NOT OP_VERIFY', 2);

  // 7. Signs: R~ = sign(alpha) R ; Q~ = -sign(beta) Q.
  a.roll('ry').roll('alpha').raw('<0> OP_LESSTHAN OP_IF OP_NEGATE OP_ENDIF', 2, ['T1y']);
  a.rename('T1y', 'ry~');
  a.num(params.publicKey.y, 'qy').roll('beta').raw('<0> OP_LESSTHAN OP_NOTIF OP_NEGATE OP_ENDIF', 2, ['qy~']);

  // 8. Joint table T[1..15], T[d] = sum of the bases selected by the bits of d.
  a.roll('r', 'T1x').roll('ry~', 'T1y');
  a.num(params.publicKey.x, 'T2x').roll('qy~', 'T2y');
  const constants: Record<number, Point> = { 4: G, 8: G128 };
  for (let k = 3; k <= 15; k++) {
    const c = constants[k];
    if (c !== undefined) {
      a.num(c.x, `T${k}x`).num(-c.y, `T${k}y`);
      continue;
    }
    const sum = TABLE_SUMS.find(([kk]) => kk === k);
    if (sum === undefined) throw new Error(`table: no rule for ${k}`);
    const [, i, j] = sum;
    a.pick(`T${i}x`).pick(`T${i}y`).pick(`T${j}x`).pick(`T${j}y`).invoke(FN.ADD, 4, [`T${k}x`, `T${k}y`]);
  }
  a.roll('A').roll('Bb').roll('G0').roll('G1');
  a.num(SCALAR_BITS - 1, 'i');
  a.pick('T4x').rename(a.top(), 'ax').pick('T4y').raw('OP_NEGATE', 1, ['ay']);
  const loopTop = ['T15y', 'A', 'Bb', 'G0', 'G1', 'i', 'ax', 'ay'];
  a.assertStack(loopTop);

  // 9. Main loop, bit i from 127 down to 0.
  a.raw('OP_BEGIN', 0);
  a.invoke(FN.DBL, 2, ['ax', 'ay']);
  a.pick('A').pick('i').raw('OP_RSHIFTNUM <2> OP_MOD', 2, ['d']);
  a.pick('Bb').pick('i').raw('OP_RSHIFTNUM <2> OP_MOD OP_DUP OP_ADD OP_ADD', 3, ['d']);
  a.pick('G0').pick('i').raw('OP_RSHIFTNUM <2> OP_MOD <2> OP_LSHIFTNUM OP_ADD', 3, ['d']);
  a.pick('G1').pick('i').raw('OP_RSHIFTNUM <2> OP_MOD <3> OP_LSHIFTNUM OP_ADD', 3, ['d']);
  a.assertStack([...loopTop, 'd']);
  // depth of T[d].x after popping the pick index = 38 - 2d (see DOCS_NOTES.md)
  a.raw(
    `OP_DUP OP_IF <38> OP_SWAP OP_DUP OP_ADD OP_SUB OP_DUP OP_1ADD OP_PICK OP_SWAP OP_PICK <${FN.ADD}> OP_INVOKE OP_ELSE OP_DROP OP_ENDIF`,
    3,
    ['ax', 'ay'],
  );
  a.raw('OP_ROT OP_1SUB OP_DUP <0> OP_LESSTHAN OP_TOALTSTACK OP_ROT OP_ROT OP_FROMALTSTACK OP_UNTIL', 3, ['i', 'ax', 'ay']);
  a.assertStack(loopTop);

  // 10. Accumulator must equal 2^128 G = -T8 (T8 holds -G').
  a.roll('ax').pick('T8x').raw('OP_SUB', 2, ['ex']);
  modp(a, 'ex');
  a.roll('ay').pick('T8y').raw('OP_ADD', 2, ['ey']);
  modp(a, 'ey');
  a.raw('OP_BOOLOR OP_NOT', 2, ['ok']);
  // 11. Clean stack: keep only the result.
  a.raw('OP_TOALTSTACK OP_BEGIN OP_DROP OP_DEPTH OP_NOT OP_UNTIL OP_FROMALTSTACK', a.stack.length, ['ok']);

  if (params.backup === undefined) {
    parts.push(a.source());
    return parts.join('\n');
  }
  // Backup on: OP_DUP OP_NOTIF <recovery> OP_ELSE <passkey path> OP_ENDIF.
  // The passkey path is byte for byte the same code; only 4 control bytes plus the recovery body are added.
  parts.push('OP_DUP OP_NOTIF', recoveryAsm(params.backup), 'OP_ELSE', a.source(), 'OP_ENDIF');
  return parts.join('\n');
};

export interface Vault {
  readonly redeemBytecode: Uint8Array;
  readonly lockingBytecode: Uint8Array;
}

export const buildVault = (params: VaultParams): Vault => {
  const redeemBytecode = compileAsm(buildRedeemAsm(params));
  const lockingBytecode = encodeLockingBytecodeP2sh32(hash256(redeemBytecode));
  return { redeemBytecode, lockingBytecode };
};
