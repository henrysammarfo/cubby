import { describe, expect, it } from 'vitest';
import { createVirtualMachineBch2026, encodeLockingBytecodeP2pkh, sha256, utf8ToBin, type TransactionBch } from '@bitauth/libauth';
import { p256 } from '@noble/curves/nist.js';
import { buildVault, type VaultParams } from '../src/covenant.js';
import { keyedPasskey } from '../src/bounties/keyed-passkey.js';
import {
  attachManage,
  buildClaim,
  buildJar,
  claimSplit,
  jarUnlocking,
  manageChallenge,
  unsignedManage,
  type JarParams,
} from '../src/bounties/allowance.js';
import type { ChainUtxo } from '../src/chain.js';

const vm = createVirtualMachineBch2026(true);
const RP = 'allowance.cubby.test';
const passkey = keyedPasskey(p256.utils.randomSecretKey(), RP);
const vaultParams: VaultParams = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP)) };
const vault = buildVault(vaultParams);
const childLock = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(7));
const params: JarParams = { ownerVaultLock: vault.lockingBytecode, childLock, allowance: 20_000n, periodBlocks: 2n };
const jar = buildJar(params);
const utxo = (lockingBytecode: Uint8Array, satoshis: bigint, n: number): ChainUtxo => ({
  txid: n.toString(16).padStart(64, '0'),
  vout: 0,
  satoshis,
  lockingBytecode,
});
const jarUtxo = utxo(jar.lockingBytecode, 100_000n, 1);
const vaultUtxo = utxo(vault.lockingBytecode, 200_000n, 2);

const verify = (tx: TransactionBch, sats: bigint[], locks: Uint8Array[]) =>
  vm.verify({ transaction: tx, sourceOutputs: locks.map((l, i) => ({ lockingBytecode: l, valueSatoshis: sats[i]! })) });

describe('Cubby Allowance jar (SolidCash contract, checked by the 2026 VM)', () => {
  it('pays exactly one allowance to the child and returns the rest to the jar', () => {
    const built = buildClaim(params, jarUtxo);
    expect(built.tx.outputs[0]!.valueSatoshis).toBe(20_000n);
    expect(built.tx.outputs[1]!.valueSatoshis).toBe(100_000n - 20_000n - 1000n);
    expect(built.tx.inputs[0]!.sequenceNumber).toBe(2);
  });

  it('pays out everything that is left when the jar holds less than one allowance', () => {
    expect(claimSplit(15_000n, 20_000n)).toEqual({ pay: 14_000n, rest: 0n });
    const built = buildClaim(params, utxo(jar.lockingBytecode, 15_000n, 3));
    expect(built.tx.outputs).toHaveLength(1);
  });

  it('refuses a claim before the period is up (sequence below the period)', () => {
    const built = buildClaim(params, jarUtxo);
    const early = { ...built.tx, inputs: [{ ...built.tx.inputs[0]!, sequenceNumber: 1 }] };
    expect(verify(early, [jarUtxo.satoshis], [jar.lockingBytecode])).not.toBe(true);
  });

  it('refuses to pay someone other than the child', () => {
    const built = buildClaim(params, jarUtxo);
    const thief = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(9));
    const bad = { ...built.tx, outputs: [{ ...built.tx.outputs[0]!, lockingBytecode: thief }, built.tx.outputs[1]!] };
    expect(verify(bad, [jarUtxo.satoshis], [jar.lockingBytecode])).not.toBe(true);
  });

  it('refuses a short payout (griefing the clock with a tiny claim)', () => {
    const built = buildClaim(params, jarUtxo);
    const bad = {
      ...built.tx,
      outputs: [{ ...built.tx.outputs[0]!, valueSatoshis: 1000n }, { ...built.tx.outputs[1]!, valueSatoshis: 98_000n }],
    };
    expect(verify(bad, [jarUtxo.satoshis], [jar.lockingBytecode])).not.toBe(true);
  });

  it('refuses change that leaks out of the jar', () => {
    const built = buildClaim(params, jarUtxo);
    const bad = { ...built.tx, outputs: [built.tx.outputs[0]!, { ...built.tx.outputs[1]!, lockingBytecode: childLock }] };
    expect(verify(bad, [jarUtxo.satoshis], [jar.lockingBytecode])).not.toBe(true);
  });

  it('refuses a claim that merges two jar coins', () => {
    const built = buildClaim(params, jarUtxo);
    const second = { ...built.tx.inputs[0]!, outpointTransactionHash: new Uint8Array(32).fill(5) };
    const bad = { ...built.tx, inputs: [built.tx.inputs[0]!, second] };
    expect(verify(bad, [jarUtxo.satoshis, jarUtxo.satoshis], [jar.lockingBytecode, jar.lockingBytecode])).not.toBe(true);
  });

  it('lets the owner top up the jar when their passkey approves the Cubby vault spend', () => {
    const outputs = [
      { lockingBytecode: jar.lockingBytecode, valueSatoshis: 150_000n },
      { lockingBytecode: vault.lockingBytecode, valueSatoshis: 300_000n - 150_000n - 12_000n },
    ];
    const unsigned = unsignedManage(vaultUtxo, jarUtxo, outputs);
    const assertion = passkey.assert(manageChallenge(unsigned));
    const built = attachManage(vault, vaultParams, params, unsigned, vaultUtxo, jarUtxo, assertion);
    expect(built.tx.inputs[0]!.unlockingBytecode.length).toBeLessThanOrEqual(10_000);
  });

  it('refuses owner actions without the vault in the transaction', () => {
    const tx: TransactionBch = {
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: new Uint8Array(32).fill(1), outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: jarUnlocking(jar, 'manage') }],
      outputs: [{ lockingBytecode: childLock, valueSatoshis: 99_000n }],
    };
    expect(verify(tx, [jarUtxo.satoshis], [jar.lockingBytecode])).not.toBe(true);
  });

  it('refuses owner actions when the passkey signed different outputs', () => {
    const outputs = [{ lockingBytecode: vault.lockingBytecode, valueSatoshis: 280_000n }];
    const unsigned = unsignedManage(vaultUtxo, jarUtxo, outputs);
    const assertion = passkey.assert(manageChallenge(unsigned));
    const swapped = { ...unsigned, outputs: [{ lockingBytecode: childLock, valueSatoshis: 280_000n }] };
    expect(() => attachManage(vault, vaultParams, params, swapped, vaultUtxo, jarUtxo, assertion)).toThrow();
  });

  it('refuses owner actions approved by some other Cubby vault', () => {
    const other = keyedPasskey(p256.utils.randomSecretKey(), RP);
    const otherParams: VaultParams = { publicKey: other.publicKey, rpIdHash: vaultParams.rpIdHash };
    const otherVault = buildVault(otherParams);
    const otherUtxo = utxo(otherVault.lockingBytecode, 200_000n, 4);
    const unsigned = unsignedManage(otherUtxo, jarUtxo, [{ lockingBytecode: otherVault.lockingBytecode, valueSatoshis: 280_000n }]);
    const assertion = other.assert(manageChallenge(unsigned));
    expect(() => attachManage(otherVault, otherParams, params, unsigned, otherUtxo, jarUtxo, assertion)).toThrow(/local check/);
  });
});
