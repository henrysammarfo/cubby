/**
 * SolidHat tests for CubbyAllowance.scash: compiled by `solidhat test`, run through the SolidCash SDK
 * (Contract, TransactionBuilder, MockNetworkProvider) under the production profile (real BCH limits).
 * The owner's Cubby vault input is unlocked with a real WebAuthn-format P-256 assertion checked on chain.
 */
import { describe, expect, it } from 'vitest';
import { Contract, TransactionBuilder, type Unlocker } from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import { binToHex, encodeLockingBytecodeP2pkh, lockingBytecodeToCashAddress, sha256, utf8ToBin } from '@bitauth/libauth';
import artifact from '../artifacts/solidcash/CubbyAllowance.json' with { type: 'json' };
import { buildJar, jarUnlocking, type JarParams } from '../../../src/bounties/allowance.js';
import { buildVault, type VaultParams } from '../../../src/covenant.js';
import { keyedPasskey, randomPasskeyKey } from '../../../src/bounties/keyed-passkey.js';
import { intentHash } from '../../../src/intent.js';
import { unlockFromAssertion } from '../../../src/unlock.js';

const RP = 'solidhat.cubby.test';
const passkey = keyedPasskey(randomPasskeyKey(), RP);
const vaultParams: VaultParams = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP)) };
const vault = buildVault(vaultParams);
const childLock = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(7));
const params: JarParams = { ownerVaultLock: vault.lockingBytecode, childLock, allowance: 20_000n, periodBlocks: 2n };
const addr = (bytecode: Uint8Array) => {
  const r = lockingBytecodeToCashAddress({ bytecode, prefix: 'bchtest' });
  if (typeof r === 'string') throw new Error(r);
  return r.address;
};

/** Cubby vault unlocker: signs the spend's intent hash with the passkey at build time. */
const cubbyUnlocker = (): Unlocker => ({
  generateLockingBytecode: () => vault.lockingBytecode,
  generateUnlockingBytecode: ({ transaction, inputIndex }) =>
    unlockFromAssertion(vault, vaultParams, transaction, inputIndex, passkey.assert(intentHash(transaction, inputIndex))),
});

const setup = async () => {
  const provider = new MockNetworkProvider({ profile: 'production' });
  const contract = new Contract(artifact as never, [params.ownerVaultLock, params.childLock, params.allowance, params.periodBlocks], {
    provider,
    addressType: 'p2sh32',
  } as never);
  return { provider, contract };
};

describe('CubbyAllowance (SolidCash SDK, production limits)', () => {
  it('the app encoder matches the SDK byte for byte', async () => {
    const { contract } = await setup();
    const jar = buildJar(params);
    expect(contract.address).toBe(addr(jar.lockingBytecode));
    const unlocker = contract.unlock.manage!();
    const fake = {
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: new Uint8Array(32), outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
      outputs: [],
    };
    const sdkBytes = unlocker.generateUnlockingBytecode({ transaction: fake, sourceOutputs: [{ lockingBytecode: jar.lockingBytecode, valueSatoshis: 1n }], inputIndex: 0 });
    expect(binToHex(sdkBytes)).toBe(binToHex(jarUnlocking(jar, 'manage')));
  });

  it('claim: pays the allowance once the coin has aged a full period', async () => {
    const { provider, contract } = await setup();
    const jarUtxo = await provider.seedUtxo(contract.address, { txid: '11'.repeat(32), vout: 0, satoshis: 100_000n });
    await provider.mine(2);
    const tx = new TransactionBuilder({ provider })
      .addInput(jarUtxo, contract.unlock.claim!(), { sequence: 2 })
      .addOutput({ to: addr(childLock), amount: 20_000n })
      .addOutput({ to: contract.address, amount: 79_000n })
      .setLocktime(0);
    const sent = await tx.send();
    expect(sent.txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it('claim: refuses a short payout', async () => {
    const { provider, contract } = await setup();
    const jarUtxo = await provider.seedUtxo(contract.address, { txid: '12'.repeat(32), vout: 0, satoshis: 100_000n });
    await provider.mine(2);
    const tx = new TransactionBuilder({ provider })
      .addInput(jarUtxo, contract.unlock.claim!(), { sequence: 2 })
      .addOutput({ to: addr(childLock), amount: 5_000n })
      .addOutput({ to: contract.address, amount: 94_000n })
      .setLocktime(0);
    await expect(tx.send()).rejects.toThrow(/exact allowance/);
  });

  it('claim: refuses a payout to anyone else', async () => {
    const { provider, contract } = await setup();
    const jarUtxo = await provider.seedUtxo(contract.address, { txid: '13'.repeat(32), vout: 0, satoshis: 100_000n });
    await provider.mine(2);
    const thief = addr(encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(9)));
    const tx = new TransactionBuilder({ provider })
      .addInput(jarUtxo, contract.unlock.claim!(), { sequence: 2 })
      .addOutput({ to: thief, amount: 20_000n })
      .addOutput({ to: contract.address, amount: 79_000n })
      .setLocktime(0);
    await expect(tx.send()).rejects.toThrow(/pays the child/);
  });

  it('claim: refuses before the period is up', async () => {
    const { provider, contract } = await setup();
    const jarUtxo = await provider.seedUtxo(contract.address, { txid: '14'.repeat(32), vout: 0, satoshis: 100_000n });
    const tx = new TransactionBuilder({ provider })
      .addInput(jarUtxo, contract.unlock.claim!(), { sequence: 1 })
      .addOutput({ to: addr(childLock), amount: 20_000n })
      .addOutput({ to: contract.address, amount: 79_000n })
      .setLocktime(0);
    await expect(tx.send()).rejects.toThrow(/too early/);
  });

  it('manage: the owner tops up the jar with a passkey-approved Cubby vault spend', async () => {
    const { provider, contract } = await setup();
    const vaultUtxo = await provider.seedUtxo(addr(vault.lockingBytecode), { txid: '21'.repeat(32), vout: 0, satoshis: 300_000n });
    const jarUtxo = await provider.seedUtxo(contract.address, { txid: '22'.repeat(32), vout: 0, satoshis: 50_000n });
    const tx = new TransactionBuilder({ provider })
      .addInput(vaultUtxo, cubbyUnlocker())
      .addInput(jarUtxo, contract.unlock.manage!())
      .addOutput({ to: contract.address, amount: 150_000n })
      .addOutput({ to: addr(vault.lockingBytecode), amount: 188_000n })
      .setLocktime(0);
    const sent = await tx.send();
    expect(sent.txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it('manage: refuses without the owner vault', async () => {
    const { provider, contract } = await setup();
    const jarUtxo = await provider.seedUtxo(contract.address, { txid: '23'.repeat(32), vout: 0, satoshis: 50_000n });
    const tx = new TransactionBuilder({ provider })
      .addInput(jarUtxo, contract.unlock.manage!())
      .addOutput({ to: addr(childLock), amount: 49_000n })
      .setLocktime(0);
    await expect(tx.send()).rejects.toThrow(/owner vault must approve/);
  });
});
