/**
 * Cubby Allowance jar: transaction building for the SolidCash contract in
 * bounties/solidcash/contracts/CubbyAllowance.scash, with no SolidCash runtime needed in the browser.
 *
 * Encoding follows the SolidCash SDK (checked byte for byte in bounties/solidcash/test):
 * redeem = constructor arguments pushed in reverse declaration order, then the compiled bytecode;
 * unlocking = <4-byte function selector> <redeem>.
 */
import {
  bigIntToVmNumber,
  createVirtualMachineBch2026,
  encodeDataPush,
  encodeLockingBytecodeP2sh32,
  encodeTransactionBch,
  flattenBinArray,
  hash256,
  hashTransaction,
  hexToBin,
  type Output,
  type TransactionBch,
} from '@bitauth/libauth';
import { ALLOWANCE_BYTECODE_HEX, ALLOWANCE_SELECTORS } from './allowance-artifact.js';
import type { Vault, VaultParams } from '../covenant.js';
import { unlockFromAssertion } from '../unlock.js';
import { intentHash } from '../intent.js';
import type { Assertion } from '../webauthn.js';
import type { ChainUtxo } from '../chain.js';

/** Mirrors MINER_FEE and DUST in CubbyAllowance.scash. */
export const JAR_MINER_FEE = 1000n;
export const JAR_DUST = 1000n;

export interface JarParams {
  /** Locking bytecode of the owner's Cubby vault (P2SH32). */
  readonly ownerVaultLock: Uint8Array;
  /** Locking bytecode the allowance is paid to (the child's address). */
  readonly childLock: Uint8Array;
  /** Satoshis paid per period. */
  readonly allowance: bigint;
  /** Blocks the jar coin must age between payouts (relative timelock, BIP68 block units). */
  readonly periodBlocks: bigint;
}

export interface Jar {
  readonly redeemBytecode: Uint8Array;
  readonly lockingBytecode: Uint8Array;
}

const pushNum = (n: bigint): Uint8Array => encodeDataPush(bigIntToVmNumber(n));

export const buildJar = (p: JarParams): Jar => {
  if (p.allowance < JAR_DUST) throw new Error('The allowance must be at least 1,000 units.');
  if (p.periodBlocks < 1n || p.periodBlocks > 0xffffn) throw new Error('The period must be between 1 and 65,535 blocks.');
  const redeemBytecode = flattenBinArray([
    pushNum(p.periodBlocks),
    pushNum(p.allowance),
    encodeDataPush(p.childLock),
    encodeDataPush(p.ownerVaultLock),
    hexToBin(ALLOWANCE_BYTECODE_HEX),
  ]);
  return { redeemBytecode, lockingBytecode: encodeLockingBytecodeP2sh32(hash256(redeemBytecode)) };
};

export const jarUnlocking = (jar: Jar, fn: keyof typeof ALLOWANCE_SELECTORS): Uint8Array =>
  flattenBinArray([encodeDataPush(hexToBin(ALLOWANCE_SELECTORS[fn])), encodeDataPush(jar.redeemBytecode)]);

/** What one claim pays and what stays in the jar, exactly as the contract computes it. */
export const claimSplit = (jarSats: bigint, allowance: bigint): { pay: bigint; rest: bigint } => {
  if (jarSats <= JAR_MINER_FEE + JAR_DUST) throw new Error('The jar is empty.');
  const pay = jarSats < allowance + JAR_MINER_FEE + JAR_DUST ? jarSats - JAR_MINER_FEE : allowance;
  const rest = jarSats - pay - JAR_MINER_FEE;
  return { pay, rest };
};

const input = (u: ChainUtxo, sequenceNumber = 0) => ({
  outpointTransactionHash: hexToBin(u.txid),
  outpointIndex: u.vout,
  sequenceNumber,
  unlockingBytecode: new Uint8Array(),
});

const vm = createVirtualMachineBch2026(true);

export interface BuiltTx {
  readonly tx: TransactionBch;
  readonly hex: string;
  readonly txid: string;
}

const finish = (tx: TransactionBch, sourceOutputs: Output[]): BuiltTx => {
  const verified = vm.verify({ transaction: tx, sourceOutputs });
  if (verified !== true) throw new Error(`The local check of this jar transaction failed: ${String(verified)}`);
  const encoded = encodeTransactionBch(tx);
  return { tx, hex: Buffer.from(encoded).toString('hex'), txid: hashTransaction(encoded) };
};

/** Pull one period of allowance. Anyone can broadcast this; the money can only go to the child. */
export const buildClaim = (p: JarParams, jarUtxo: ChainUtxo): BuiltTx => {
  const jar = buildJar(p);
  const { pay, rest } = claimSplit(jarUtxo.satoshis, p.allowance);
  const outputs: Output[] = [{ lockingBytecode: p.childLock, valueSatoshis: pay }];
  if (rest >= JAR_DUST) outputs.push({ lockingBytecode: jar.lockingBytecode, valueSatoshis: rest });
  const tx: TransactionBch = {
    version: 2,
    locktime: 0,
    inputs: [{ ...input(jarUtxo, Number(p.periodBlocks)), unlockingBytecode: jarUnlocking(jar, 'claim') }],
    outputs,
  };
  return finish(tx, [{ lockingBytecode: jar.lockingBytecode, valueSatoshis: jarUtxo.satoshis }]);
};

/**
 * Owner action (top up, change, close): the Cubby vault is input 0 and approves every output with the passkey;
 * the jar is input 1 and only checks that the vault is co-spent.
 */
export const unsignedManage = (vaultUtxo: ChainUtxo, jarUtxo: ChainUtxo, outputs: Output[]): TransactionBch => ({
  version: 2,
  locktime: 0,
  inputs: [input(vaultUtxo), input(jarUtxo)],
  outputs,
});

/** The 32 bytes the passkey signs for an owner action. */
export const manageChallenge = (unsigned: TransactionBch): Uint8Array => intentHash(unsigned, 0);

export const attachManage = (
  vault: Vault,
  vaultParams: VaultParams,
  p: JarParams,
  unsigned: TransactionBch,
  vaultUtxo: ChainUtxo,
  jarUtxo: ChainUtxo,
  assertion: Assertion,
): BuiltTx => {
  const jar = buildJar(p);
  const vaultUnlock = unlockFromAssertion(vault, vaultParams, unsigned, 0, assertion);
  const tx: TransactionBch = {
    ...unsigned,
    inputs: [
      { ...unsigned.inputs[0]!, unlockingBytecode: vaultUnlock },
      { ...unsigned.inputs[1]!, unlockingBytecode: jarUnlocking(jar, 'manage') },
    ],
  };
  return finish(tx, [
    { lockingBytecode: vault.lockingBytecode, valueSatoshis: vaultUtxo.satoshis },
    { lockingBytecode: jar.lockingBytecode, valueSatoshis: jarUtxo.satoshis },
  ]);
};
