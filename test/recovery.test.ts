import { beforeAll, describe, expect, it } from 'vitest';
import { binToHex, encodeTransactionBch, hexToBin, sha256, utf8ToBin, type Output, type TransactionBch } from '@bitauth/libauth';
import { buildRedeemAsm, buildVault, compileAsm, recoveryAsm, RECOVERY_MAX_FEE_SATS, type Vault, type VaultParams } from '../src/covenant.js';
import { buildRecoverySpend, recoveryUnlocking } from '../src/recovery.js';
import { createSoftPasskey, type SoftPasskey } from '../src/softAuthenticator.js';
import { intentHash } from '../src/intent.js';
import { unlockFromAssertion } from '../src/unlock.js';
import { RP_ID, status, withUnlocking } from './fixtures.js';

const BACKUP = hexToBin(`76a914${'33'.repeat(20)}88ac`);
const OTHER = hexToBin(`76a914${'44'.repeat(20)}88ac`);
const DELAY = 4_320;
const CATEGORY = hexToBin('2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544');
const TOKEN = { category: CATEGORY, amount: 5_000n, nft: { capability: 'mutable' as const, commitment: hexToBin('c0ffee') } };

let passkey: SoftPasskey;
let plain: VaultParams;
let params: VaultParams;
let vault: Vault;
let coin: Output;

const recoveryTx = (over: Partial<TransactionBch> = {}, input: Partial<TransactionBch['inputs'][number]> = {}): TransactionBch => {
  const base = buildRecoverySpend(vault, params, { txid: 'ab'.repeat(32), vout: 0, satoshis: coin.valueSatoshis, token: coin.token }).tx;
  return { ...base, ...over, inputs: (over.inputs ?? base.inputs).map((i, n) => (n === 0 ? { ...i, ...input } : i)) };
};

beforeAll(async () => {
  passkey = await createSoftPasskey(RP_ID);
  plain = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP_ID)) };
  params = { ...plain, backup: { lockingBytecode: BACKUP, delayBlocks: DELAY } };
  vault = buildVault(params);
  coin = { lockingBytecode: vault.lockingBytecode, valueSatoshis: 50_000n, token: TOKEN };
});

describe('backup recovery script', () => {
  it('leaves boxes without a backup byte for byte unchanged', () => {
    const before = compileAsm(buildRedeemAsm(plain));
    expect(buildVault(plain).redeemBytecode).toEqual(before);
  });

  it('adds only the recovery body plus 4 control bytes, and gives a new address', () => {
    const before = buildVault(plain);
    const body = compileAsm(recoveryAsm(params.backup!));
    expect(vault.redeemBytecode.length - before.redeemBytecode.length).toBe(body.length + 4);
    expect(binToHex(vault.lockingBytecode)).not.toBe(binToHex(before.lockingBytecode));
    // The passkey path itself is the same bytes: after = defines | DUP NOTIF | body | ELSE | passkey | ENDIF.
    const a = vault.redeemBytecode;
    const b = before.redeemBytecode;
    let i = 0;
    while (a[i] === b[i]) i++;
    expect([a[i], a[i + 1]]).toEqual([0x76, 0x64]);
    expect(binToHex(a.subarray(i + 2, i + 2 + body.length))).toBe(binToHex(body));
    expect(a[i + 2 + body.length]).toBe(0x67);
    expect(binToHex(a.subarray(i + 3 + body.length, a.length - 1))).toBe(binToHex(b.subarray(i)));
    expect(a[a.length - 1]).toBe(0x68);
  });

  it('refuses unsafe settings', () => {
    expect(() => buildVault({ ...plain, backup: { lockingBytecode: BACKUP, delayBlocks: 0 } })).toThrow();
    expect(() => buildVault({ ...plain, backup: { lockingBytecode: BACKUP, delayBlocks: 65_536 } })).toThrow();
    expect(() => buildVault({ ...plain, backup: { lockingBytecode: BACKUP, delayBlocks: 1.5 } })).toThrow();
    expect(() => buildVault({ ...plain, backup: { lockingBytecode: hexToBin('6a'), delayBlocks: DELAY } })).toThrow();
    expect(() => buildVault({ ...plain, backup: { lockingBytecode: hexToBin(`a914${'11'.repeat(20)}87`), delayBlocks: DELAY } })).not.toThrow();
    expect(() => buildVault({ ...plain, backup: { lockingBytecode: hexToBin(`aa20${'11'.repeat(32)}87`), delayBlocks: DELAY } })).not.toThrow();
  });
});

describe('passkey path with a backup set (libauth BCH 2026 VM)', () => {
  it('a Face ID spend still verifies and stays under 10,000 unlocking bytes', async () => {
    const tx: TransactionBch = {
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: hexToBin('ab'.repeat(32)), outpointIndex: 1, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
      outputs: [
        { lockingBytecode: OTHER, valueSatoshis: 20_000n },
        { lockingBytecode: vault.lockingBytecode, valueSatoshis: 1_000n, token: TOKEN },
        { lockingBytecode: vault.lockingBytecode, valueSatoshis: 18_000n },
      ],
    };
    for (let i = 0; i < 4; i++) {
      const assertion = await passkey.assert(intentHash(tx, 0));
      const unlocking = unlockFromAssertion(vault, params, tx, 0, assertion);
      expect(unlocking.length).toBeLessThanOrEqual(10_000);
      expect(status(withUnlocking(tx, 0, unlocking), [coin])).toMatch(/^pass /u);
    }
  });

  it('a Face ID spend works before the delay (sequence 0), so the owner is never locked out', async () => {
    const tx: TransactionBch = {
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: hexToBin('ab'.repeat(32)), outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
      outputs: [{ lockingBytecode: OTHER, valueSatoshis: 30_000n, token: TOKEN }],
    };
    const assertion = await passkey.assert(intentHash(tx, 0));
    expect(status(withUnlocking(tx, 0, unlockFromAssertion(vault, params, tx, 0, assertion)), [coin])).toMatch(/^pass /u);
  });
});

describe('recovery path (libauth BCH 2026 VM)', () => {
  it('moves an old coin to the backup wallet with no passkey', () => {
    const tx = recoveryTx();
    expect(tx.inputs[0]!.sequenceNumber).toBe(DELAY);
    expect(tx.outputs).toHaveLength(1);
    expect(status(tx, [coin])).toMatch(/^pass /u);
  });

  it('works for a plain coin with no tokens', () => {
    const bare: Output = { lockingBytecode: vault.lockingBytecode, valueSatoshis: 50_000n };
    const tx = buildRecoverySpend(vault, params, { txid: 'cd'.repeat(32), vout: 2, satoshis: 50_000n }).tx;
    expect(status(tx, [bare])).toMatch(/^pass /u);
  });

  it('accepts a longer wait than required', () => {
    expect(status(recoveryTx({}, { sequenceNumber: DELAY + 100 }), [coin])).toMatch(/^pass /u);
  });

  it('is about 1,250 bytes, so the fee cap covers 1 sat per byte twice over', () => {
    const { bytes } = buildRecoverySpend(vault, params, { txid: 'ab'.repeat(32), vout: 0, satoshis: 50_000n, token: TOKEN });
    expect(bytes).toBeLessThan(1_400);
    expect(BigInt(bytes) * 2n).toBeLessThanOrEqual(RECOVERY_MAX_FEE_SATS);
  });

  const fails = (tx: TransactionBch, sources: Output[] = [coin]) => expect(status(tx, sources)).toMatch(/^fail /u);

  it('fails before the delay (sequence too small)', () => fails(recoveryTx({}, { sequenceNumber: DELAY - 1 })));
  it('fails with the relative lock switched off (disable flag)', () => fails(recoveryTx({}, { sequenceNumber: 0x80000000 | DELAY })));
  it('fails with time units instead of blocks (type flag)', () => fails(recoveryTx({}, { sequenceNumber: 0x00400000 | DELAY })));
  it('fails on a version 1 transaction (no relative locks)', () => fails(recoveryTx({ version: 1 })));
  it('fails when paying anyone but the backup', () => {
    const t = recoveryTx();
    fails({ ...t, outputs: [{ ...t.outputs[0]!, lockingBytecode: OTHER }] });
  });
  it('fails with a second output (no skimming)', () => {
    const t = recoveryTx();
    fails({ ...t, outputs: [{ ...t.outputs[0]!, valueSatoshis: 40_000n }, { lockingBytecode: OTHER, valueSatoshis: 8_000n }] });
  });
  it('fails with a second input', () => {
    const t = recoveryTx();
    const extra = { outpointTransactionHash: hexToBin('ef'.repeat(32)), outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: new Uint8Array() };
    fails({ ...t, inputs: [t.inputs[0]!, extra] }, [coin, { lockingBytecode: OTHER, valueSatoshis: 10_000n }]);
  });
  it('fails when the fee is above the cap (burning coins as fee)', () => {
    const t = recoveryTx();
    fails({ ...t, outputs: [{ ...t.outputs[0]!, valueSatoshis: coin.valueSatoshis - RECOVERY_MAX_FEE_SATS - 1n }] });
    expect(status({ ...t, outputs: [{ ...t.outputs[0]!, valueSatoshis: coin.valueSatoshis - RECOVERY_MAX_FEE_SATS }] }, [coin])).toMatch(/^pass /u);
  });
  it('fails when the tokens are dropped', () => {
    const t = recoveryTx();
    const { token: _drop, ...noToken } = t.outputs[0]!;
    fails({ ...t, outputs: [noToken] });
  });
  it('fails when the token amount or the NFT changes', () => {
    const t = recoveryTx();
    fails({ ...t, outputs: [{ ...t.outputs[0]!, token: { ...TOKEN, amount: 4_999n } }] });
    fails({ ...t, outputs: [{ ...t.outputs[0]!, token: { ...TOKEN, nft: { capability: 'mutable', commitment: hexToBin('beef') } } }] });
    fails({ ...t, outputs: [{ ...t.outputs[0]!, token: { ...TOKEN, nft: { capability: 'none', commitment: hexToBin('c0ffee') } } }] });
  });
  it('a box without a backup has no recovery path at all', () => {
    const noBackup = buildVault(plain);
    const src: Output = { lockingBytecode: noBackup.lockingBytecode, valueSatoshis: 50_000n };
    const t = recoveryTx();
    fails(withUnlocking(t, 0, recoveryUnlocking(noBackup)), [src]);
  });
  it('a non-empty selector cannot reach the recovery rules with other data', () => {
    const t = recoveryTx();
    // "1" selects the passkey path, which then fails with no proof.
    const unlocking = Uint8Array.from([0x51, ...recoveryUnlocking(vault).subarray(1)]);
    fails(withUnlocking(t, 0, unlocking));
  });
  it('the builder refuses bad fees and dust', () => {
    expect(() => buildRecoverySpend(vault, params, { txid: 'ab'.repeat(32), vout: 0, satoshis: 50_000n }, RECOVERY_MAX_FEE_SATS + 1n)).toThrow();
    expect(() => buildRecoverySpend(vault, params, { txid: 'ab'.repeat(32), vout: 0, satoshis: 2_000n })).toThrow();
    expect(() => buildRecoverySpend(buildVault(plain), plain, { txid: 'ab'.repeat(32), vout: 0, satoshis: 50_000n })).toThrow();
  });
  it('encodes as a standard transaction', () => {
    expect(encodeTransactionBch(recoveryTx()).length).toBeGreaterThan(100);
  });
});

describe('recovery note', () => {
  it('round trips and rebuilds the same box from the note alone', async () => {
    const { encodeRecoveryNote, decodeRecoveryNote } = await import('../src/recovery.js');
    const { encodeCashAddress } = await import('@bitauth/libauth');
    const backupAddress = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hexToBin('33'.repeat(20)) }).address;
    const note = {
      network: 'chipnet' as const,
      rpId: RP_ID,
      publicKeyX: passkey.publicKey.x.toString(16).padStart(64, '0'),
      publicKeyY: passkey.publicKey.y.toString(16).padStart(64, '0'),
      backupAddress,
      delayBlocks: DELAY,
    };
    const text = encodeRecoveryNote(note);
    expect(text.startsWith('cubby-recovery-v1:')).toBe(true);
    const back = decodeRecoveryNote(`  ${text}\n`);
    expect(back).toEqual(note);
    if (typeof back === 'string') return;
    const rebuilt = buildVault({
      publicKey: { x: BigInt(`0x${back.publicKeyX}`), y: BigInt(`0x${back.publicKeyY}`) },
      rpIdHash: sha256.hash(utf8ToBin(back.rpId)),
      backup: { lockingBytecode: BACKUP, delayBlocks: back.delayBlocks },
    });
    expect(rebuilt.lockingBytecode).toEqual(vault.lockingBytecode);
  });

  it('rejects broken notes in plain words', async () => {
    const { decodeRecoveryNote } = await import('../src/recovery.js');
    const good = `cubby-recovery-v1:mainnet/cubby.cash/${'1'.repeat(64)}/${'2'.repeat(64)}/bitcoincash:qq/4320`;
    expect(typeof decodeRecoveryNote(good)).toBe('object');
    for (const bad of ['hello', good.replace('mainnet', 'testnet'), good.replace('/4320', '/0'), good.replace('/4320', '/70000'), good.replace(`/${'1'.repeat(64)}`, '/xyz'), good.replace('/4320', ''), good.replace('cubby.cash', 'Evil Site')]) {
      expect(typeof decodeRecoveryNote(bad)).toBe('string');
    }
  });
});
