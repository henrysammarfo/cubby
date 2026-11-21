/** Build and sign a standard P2PKH send (used by the chipnet end to end script). */
import {
  encodeTransactionBch,
  generateTransaction,
  hashTransaction,
  hexToBin,
  walletTemplateP2pkhNonHd,
  walletTemplateToCompilerBch,
  type TransactionBch,
} from '@bitauth/libauth';
import type { ChainUtxo } from './chain.js';

const compiler = walletTemplateToCompilerBch(walletTemplateP2pkhNonHd);

const FEE_RATE = 1n;

const estimateP2pkhSize = (inputCount: number, outputCount: number): bigint => {
  // Compact-size headers plus a conservative Schnorr or ECDSA P2PKH input.
  return 16n + 200n * BigInt(inputCount) + 43n * BigInt(outputCount);
};

export interface P2pkhSendResult {
  readonly tx: TransactionBch;
  readonly hex: string;
  readonly txid: string;
  readonly fee: bigint;
}

const sign = (
  privateKey: Uint8Array,
  utxos: ChainUtxo[],
  outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }>,
): { tx: TransactionBch; encoded: Uint8Array } => {
  const generated = generateTransaction({
    version: 2,
    locktime: 0,
    inputs: utxos.map((utxo) => ({
      outpointTransactionHash: hexToBin(utxo.txid),
      outpointIndex: utxo.vout,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: {
        compiler,
        script: 'unlock',
        valueSatoshis: utxo.satoshis,
        data: { keys: { privateKeys: { key: privateKey } } },
      },
    })),
    outputs,
  });
  if (!generated.success) {
    throw new Error(`Could not sign the send: ${JSON.stringify(generated.errors).slice(0, 500)}`);
  }
  const tx = generated.transaction as TransactionBch;
  return { tx, encoded: encodeTransactionBch(tx) };
};

export const buildP2pkhSend = (
  privateKey: Uint8Array,
  utxos: ChainUtxo[],
  destinationLocking: Uint8Array,
  sendSatoshis: bigint | 'all',
  changeLocking: Uint8Array,
): P2pkhSendResult => {
  if (utxos.length === 0) throw new Error('No coins to send from this key.');
  const total = utxos.reduce((sum, u) => sum + u.satoshis, 0n);

  const plan = (feeForOne: bigint, feeForTwo: bigint): { outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }>; fee: bigint } => {
    if (sendSatoshis === 'all') {
      if (total <= feeForOne) throw new Error('Not enough coins to cover the send fee.');
      return { fee: feeForOne, outputs: [{ lockingBytecode: destinationLocking, valueSatoshis: total - feeForOne }] };
    }
    if (total >= sendSatoshis + feeForTwo + 546n) {
      return {
        fee: feeForTwo,
        outputs: [
          { lockingBytecode: destinationLocking, valueSatoshis: sendSatoshis },
          { lockingBytecode: changeLocking, valueSatoshis: total - sendSatoshis - feeForTwo },
        ],
      };
    }
    if (total >= sendSatoshis + feeForOne) {
      return { fee: feeForOne, outputs: [{ lockingBytecode: destinationLocking, valueSatoshis: sendSatoshis }] };
    }
    throw new Error(`Not enough coins (have ${total}, need about ${sendSatoshis + feeForTwo}).`);
  };

  let feeOne = estimateP2pkhSize(utxos.length, 1) * FEE_RATE;
  let feeTwo = estimateP2pkhSize(utxos.length, 2) * FEE_RATE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { outputs, fee } = plan(feeOne, feeTwo);
    const { tx, encoded } = sign(privateKey, utxos, outputs);
    const required = BigInt(encoded.length) * FEE_RATE;
    if (required <= fee) {
      return { tx, hex: Buffer.from(encoded).toString('hex'), txid: hashTransaction(encoded), fee };
    }
    if (outputs.length === 1) feeOne = required;
    else feeTwo = required;
  }
  throw new Error('Could not build a send that pays the minimum relay fee.');
};
