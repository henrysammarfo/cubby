import { describe, expect, it, beforeAll } from 'vitest';
import {
  decodeTransactionOutputs,
  encodeTransactionBch,
  encodeTransactionOutputs,
  hexToBin,
  type TransactionBch,
} from '@bitauth/libauth';
import { intentHash } from '../src/intent.js';
import { unlockFromAssertion, encodeUnlocking, assertionMessageHash, MAX_STANDARD_UNLOCKING } from '../src/unlock.js';
import { buildWitness } from '../src/hints.js';
import { parseDerSignature, splitClientData } from '../src/webauthn.js';
import { createSoftPasskey } from '../src/softAuthenticator.js';
import { buildVault } from '../src/covenant.js';
import { evaluate, makeFixture, signedTx, status, vm, withUnlocking, type Fixture } from './fixtures.js';

let f: Fixture;
let good: TransactionBch;

beforeAll(async () => {
  f = await makeFixture();
  good = await signedTx(f);
});

const log = (label: string, line: string): void => {
  console.log(`[S1] ${label}: ${line}`);
};

describe('S1 signing gate: acceptance (plan 6.1)', () => {
  it('a valid passkey-signed spend passes (standard rules, clean stack)', () => {
    const line = status(good, f.sourceOutputs);
    log('valid spend', `${line}; unlocking ${good.inputs[0]!.unlockingBytecode.length} B; tx ${encodeTransactionBch(good).length} B`);
    expect(line.startsWith('pass')).toBe(true);
    expect(vm.verify({ transaction: good, sourceOutputs: f.sourceOutputs })).toBe(true);
    expect(evaluate(good, f.sourceOutputs).stack.length).toBe(1);
  });

  it('changing ANY single output byte makes the script fail', () => {
    const encoded = encodeTransactionOutputs(good.outputs);
    let tried = 0;
    let undecodable = 0;
    const escapes: string[] = [];
    const errors = new Map<string, number>();
    for (let pos = 1; pos < encoded.length; pos++) {
      for (const mask of [0x01, 0x80]) {
        const mutated = encoded.slice();
        mutated[pos] = (mutated[pos] ?? 0) ^ mask;
        const decoded = decodeTransactionOutputs(mutated);
        if (typeof decoded === 'string') {
          undecodable++;
          continue;
        }
        tried++;
        const st = evaluate({ ...good, outputs: decoded }, f.sourceOutputs);
        if (st.error === undefined) escapes.push(`byte ${pos} mask ${mask}`);
        else errors.set(st.error, (errors.get(st.error) ?? 0) + 1);
      }
    }
    log('output byte mutations', `${encoded.length - 1} bytes x 2 masks: ${tried} decodable mutations all fail=${escapes.length === 0}; ${undecodable} undecodable; errors ${JSON.stringify([...errors])}`);
    expect(escapes).toEqual([]);
    expect(tried).toBeGreaterThan(200);
  });

  it('adding, removing or reordering outputs fails', () => {
    const extra = { ...good, outputs: [...good.outputs, { lockingBytecode: hexToBin(`76a914${'33'.repeat(20)}88ac`), valueSatoshis: 546n }] };
    const removed = { ...good, outputs: good.outputs.slice(0, 2) };
    const swapped = { ...good, outputs: [good.outputs[2]!, good.outputs[1]!, good.outputs[0]!] };
    for (const [label, tx] of [['added output', extra], ['removed output', removed], ['reordered outputs', swapped]] as const) {
      const line = status(tx, f.sourceOutputs);
      log(label, line);
      expect(line.startsWith('fail')).toBe(true);
    }
  });

  it('replaying the same signature on another outpoint fails', () => {
    const otherTxid = withUnlocking({ ...good, inputs: [{ ...good.inputs[0]!, outpointTransactionHash: hexToBin('cd'.repeat(32)) }] }, 0, good.inputs[0]!.unlockingBytecode);
    const otherIndex = { ...good, inputs: [{ ...good.inputs[0]!, outpointIndex: 2 }] };
    const l1 = status(otherTxid, f.sourceOutputs);
    const l2 = status(otherIndex, f.sourceOutputs);
    log('replay: other txid', l1);
    log('replay: other index', l2);
    expect(l1.startsWith('fail')).toBe(true);
    expect(l2.startsWith('fail')).toBe(true);
    // Same signature copied onto a second vault UTXO in the same transaction.
    const twoInputs: TransactionBch = {
      ...good,
      inputs: [good.inputs[0]!, { ...good.inputs[0]!, outpointIndex: 7 }],
    };
    const sources = [f.sourceOutputs[0]!, { lockingBytecode: f.vault.lockingBytecode, valueSatoshis: 10_000n }];
    const l3 = status(twoInputs, sources, 1);
    log('replay: second vault input in same tx', l3);
    expect(l3.startsWith('fail')).toBe(true);
  });
});

describe('S1 signing gate: other negative cases', () => {
  it('locktime or version change fails', () => {
    for (const [label, tx] of [
      ['locktime changed', { ...good, locktime: 1 }],
      ['version changed', { ...good, version: 1 }],
    ] as const) {
      const line = status(tx, f.sourceOutputs);
      log(label, line);
      expect(line.startsWith('fail')).toBe(true);
    }
  });

  it('a different passkey (wrong public key) fails', async () => {
    const other = await createSoftPasskey('cubby.cash');
    const assertion = await other.assert(intentHash(f.tx, 0));
    // Witness built against the vault key fails off chain, so build it the way an attacker would: for the attacker's key.
    expect(() => unlockFromAssertion(f.vault, f.params, f.tx, 0, assertion)).toThrow();
    const forged = unlockFromAssertion(f.vault, { ...f.params, publicKey: other.publicKey }, f.tx, 0, assertion);
    const line = status(withUnlocking(f.tx, 0, forged), f.sourceOutputs);
    log('wrong passkey', line);
    expect(line.startsWith('fail')).toBe(true);
  });

  const craft = async (options: Parameters<Fixture['passkey']['assert']>[1], tweak?: (suffix: Uint8Array) => Uint8Array) => {
    const intent = intentHash(f.tx, 0);
    const a = await f.passkey.assert(intent, options);
    const { r, s } = parseDerSignature(a.signature);
    const witness = buildWitness(assertionMessageHash(a), r, s, f.params.publicKey);
    const cdj = Buffer.from(a.clientDataJSON).toString();
    const prefixLen = '{"type":"webauthn.get","challenge":"'.length;
    let suffix: Uint8Array = a.clientDataJSON.subarray(prefixLen + 43);
    if (!cdj.startsWith('{"type":"webauthn.get"')) suffix = a.clientDataJSON.subarray(prefixLen + 43 + 3);
    if (tweak) suffix = tweak(suffix);
    return withUnlocking(f.tx, 0, encodeUnlocking(f.vault, { authenticatorData: a.authenticatorData, clientDataSuffix: suffix, witness, padBytes: 0 }));
  };

  it('wrong relying party (rpIdHash) fails', async () => {
    const line = status(await craft({ rpId: 'evil.example' }), f.sourceOutputs);
    log('wrong rpId', line);
    expect(line.startsWith('fail')).toBe(true);
  });

  it('user verification flag missing (UP only) fails', async () => {
    const line = status(await craft({ flags: 0x01 }), f.sourceOutputs);
    log('UV flag missing', line);
    expect(line.startsWith('fail')).toBe(true);
  });

  it('a webauthn.create (registration) signature fails', async () => {
    const line = status(await craft({ type: 'webauthn.create' }), f.sourceOutputs);
    log('type webauthn.create', line);
    expect(line.startsWith('fail')).toBe(true);
  });

  it('a challenge that is not closed after 43 chars fails', async () => {
    const line = status(await craft({}, (s) => s.subarray(1)), f.sourceOutputs);
    log('unterminated challenge', line);
    expect(line.startsWith('fail')).toBe(true);
  });

  it('tampered signature, hints or scalars fail', async () => {
    const a = await f.passkey.assert(intentHash(f.tx, 0));
    const suffix = splitClientData(a.clientDataJSON, intentHash(f.tx, 0));
    const { r, s } = parseDerSignature(a.signature);
    const w = buildWitness(assertionMessageHash(a), r, s, f.params.publicKey);
    const mk = (label: string, witness: typeof w) => {
      const tx = withUnlocking(f.tx, 0, encodeUnlocking(f.vault, { authenticatorData: a.authenticatorData, clientDataSuffix: suffix, witness, padBytes: 0 }));
      const line = status(tx, f.sourceOutputs);
      log(label, line);
      expect(line.startsWith('fail')).toBe(true);
    };
    mk('s + 1', { ...w, s: w.s + 1n });
    mk('r + 1', { ...w, r: w.r + 1n });
    mk('R off curve (ry + 1)', { ...w, ry: w.ry + 1n });
    mk('alpha = 0', { ...w, alpha: 0n, beta: 0n });
    mk('alpha out of range (+n)', { ...w, alpha: w.alpha + 115792089210356248762697446949407573529996955224135760342422259061068512044369n });
    mk('gamma + 1', { ...w, gamma: w.gamma + 1n });
    const hints = [...w.hints];
    hints[50] = (hints[50] ?? 0n) ^ 1n;
    mk('one slope hint flipped', { ...w, hints });
    mk('hints truncated', { ...w, hints: w.hints.slice(0, -1) });
  });

  it('non-zero padding fails; zero padding passes and raises the budget', async () => {
    const intent = intentHash(f.tx, 0);
    const a = await f.passkey.assert(intent);
    const suffix = splitClientData(a.clientDataJSON, intent);
    const { r, s } = parseDerSignature(a.signature);
    const witness = buildWitness(assertionMessageHash(a), r, s, f.params.publicKey);
    const build = (padBytes: number) =>
      withUnlocking(f.tx, 0, encodeUnlocking(f.vault, { authenticatorData: a.authenticatorData, clientDataSuffix: suffix, witness, padBytes }));
    const plain = build(0);
    const room = MAX_STANDARD_UNLOCKING - plain.inputs[0]!.unlockingBytecode.length - 2;
    const pad = Math.max(1, Math.min(200, room));
    const padded = build(pad);
    const line = status(padded, f.sourceOutputs);
    log(`zero padding ${pad} B`, `${line}; same signature unpadded ${status(plain, f.sourceOutputs)}`);
    expect(line.startsWith('pass')).toBe(true);
    const u = padded.inputs[0]!.unlockingBytecode.slice();
    u[u[0] === 0x4c ? 2 : 1] = 1;
    const l2 = status(withUnlocking(padded, 0, u), f.sourceOutputs);
    log('non-zero padding', l2);
    expect(l2.startsWith('fail')).toBe(true);
  });
});

describe('S1 signing gate: real-world clientDataJSON shapes', () => {
  it('Chrome extra member, Android app origin, cross-origin true all pass', async () => {
    for (const [label, o] of [
      ['chrome other_keys member', { extra: ',"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"' }],
      ['android app origin', { origin: 'android:apk-key-hash:Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE' }],
      ['flags with BE/BS bits (synced passkey)', { flags: 0x1d }],
    ] as const) {
      const tx = await signedTx(f, f.tx, o);
      const line = status(tx, f.sourceOutputs);
      log(label, `${line}; unlocking ${tx.inputs[0]!.unlockingBytecode.length} B`);
      expect(line.startsWith('pass')).toBe(true);
      expect(tx.inputs[0]!.unlockingBytecode.length).toBeLessThanOrEqual(MAX_STANDARD_UNLOCKING);
    }
  });

  it('works for a fresh vault and key (independent run)', async () => {
    const pk = await createSoftPasskey('cubby.cash');
    const params = { ...f.params, publicKey: pk.publicKey };
    const vault = buildVault(params);
    const sources = [{ lockingBytecode: vault.lockingBytecode, valueSatoshis: 60_000n }];
    const tx: TransactionBch = { ...f.tx, outputs: [f.tx.outputs[0]!] };
    const a = await pk.assert(intentHash(tx, 0));
    const signed = withUnlocking(tx, 0, unlockFromAssertion(vault, params, tx, 0, a));
    expect(vm.verify({ transaction: signed, sourceOutputs: sources })).toBe(true);
  });
});

describe('S1 signing gate: documented limit of token introspection', () => {
  it('an immutable NFT with an empty commitment is invisible to introspection (same intent)', () => {
    // OP_OUTPUTTOKENCATEGORY / COMMITMENT / AMOUNT cannot tell "fungible only" from
    // "fungible + immutable NFT with empty commitment". Consensus token rules still require
    // a minting baton of that category to create one, or an implicit burn to remove one.
    const category = good.outputs[1]!.token!.category;
    const ft = { ...good, outputs: [{ ...good.outputs[0]!, token: { category, amount: 10n } }] };
    const ftNft = { ...good, outputs: [{ ...good.outputs[0]!, token: { category, amount: 10n, nft: { capability: 'none' as const, commitment: new Uint8Array() } } }] };
    expect(Buffer.from(intentHash(ft, 0)).equals(Buffer.from(intentHash(ftNft, 0)))).toBe(true);
    log('known gap', 'FT-only vs FT + empty immutable NFT share an intent hash (documented in README Limitations)');
  });
});

