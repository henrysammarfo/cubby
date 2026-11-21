/** Build a one-input vault spend, then attach a passkey unlocking bytecode. */
import {
  createVirtualMachineBch2026,
  encodeTransactionBch,
  hashTransaction,
  hexToBin,
  type Output,
  type TransactionBch,
} from '@bitauth/libauth';
import type { Vault, VaultParams } from './covenant.js';
import { intentHash } from './intent.js';
import { unlockFromAssertion, UnlockingTooLargeError } from './unlock.js';
import type { Assertion } from './webauthn.js';
import type { ChainUtxo } from './chain.js';
import { DUST_SATS, type Network } from './network.js';

const vm = createVirtualMachineBch2026(true);

export const buildUnsignedVaultSpend = (
  network: Network,
  vaultUtxo: ChainUtxo,
  destinationLocking: Uint8Array,
  options?: { amountSats?: bigint; changeLocking?: Uint8Array },
): TransactionBch => {
  const fee = network.vaultSpendFeeSats;
  if (vaultUtxo.satoshis < fee + DUST_SATS) {
    throw new Error(
      `The box only holds ${vaultUtxo.satoshis} units, but a send needs about ${fee + DUST_SATS} (fee ${fee} plus a small leftover). Put at least ${network.recommendedFundSats} units in first.`,
    );
  }
  const maxSend = vaultUtxo.satoshis - fee;
  const send = options?.amountSats ?? maxSend;
  if (send < DUST_SATS) {
    throw new Error(`That send is too small. The smallest amount is ${DUST_SATS} units.`);
  }
  if (send > maxSend) {
    throw new Error(`The box only has ${maxSend} units to send after the ${fee} unit network fee.`);
  }
  const change = maxSend - send;
  const outputs: Output[] = [{ lockingBytecode: destinationLocking, valueSatoshis: send }];
  if (change >= DUST_SATS) {
    const changeLocking = options?.changeLocking;
    if (!changeLocking) {
      throw new Error('This send would leave coins in the box, but no return address was given.');
    }
    outputs.push({ lockingBytecode: changeLocking, valueSatoshis: change });
  } else if (change > 0n) {
    // Sub-dust leftover is added to the destination so the fee stays exactly the intended fee.
    outputs[0] = { lockingBytecode: destinationLocking, valueSatoshis: send + change };
  }
  return {
    version: 2,
    locktime: 0,
    inputs: [
      {
        outpointTransactionHash: hexToBin(vaultUtxo.txid),
        outpointIndex: vaultUtxo.vout,
        sequenceNumber: 0,
        unlockingBytecode: new Uint8Array(),
      },
    ],
    outputs,
  };
};

export const challengeForSpend = (tx: TransactionBch, inputIndex = 0): Uint8Array => intentHash(tx, inputIndex);

export interface SignedVaultSpend {
  readonly tx: TransactionBch;
  readonly hex: string;
  readonly txid: string;
  readonly unlockingBytes: number;
}

export const attachPasskeyUnlock = (
  vault: Vault,
  params: VaultParams,
  unsigned: TransactionBch,
  source: ChainUtxo,
  assertion: Assertion,
): SignedVaultSpend => {
  let unlocking: Uint8Array;
  try {
    unlocking = unlockFromAssertion(vault, params, unsigned, 0, assertion);
  } catch (error) {
    if (error instanceof UnlockingTooLargeError) throw error;
    throw error;
  }
  const tx: TransactionBch = {
    ...unsigned,
    inputs: unsigned.inputs.map((input, i) => (i === 0 ? { ...input, unlockingBytecode: unlocking } : input)),
  };
  const sourceOutputs: Output[] = [{ lockingBytecode: source.lockingBytecode, valueSatoshis: source.satoshis }];
  const verified = vm.verify({ transaction: tx, sourceOutputs });
  if (verified !== true) {
    throw new Error(`The local check of this spend failed: ${String(verified)}`);
  }
  const encoded = encodeTransactionBch(tx);
  return { tx, hex: Buffer.from(encoded).toString('hex'), txid: hashTransaction(encoded), unlockingBytes: unlocking.length };
};

/** Units taken as the network fee (input minus all outputs). Must equal the intended fee. */
export const feePaidOnSpend = (vaultSats: bigint, tx: TransactionBch): bigint =>
  vaultSats - tx.outputs.reduce((sum, output) => sum + output.valueSatoshis, 0n);
