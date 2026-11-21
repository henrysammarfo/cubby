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
  // Schnorr P2PKH input ~148 bytes, output ~34, overhead ~10
  return 10n + 148n * BigInt(inputCount) + 34n * BigInt(outputCount);
};

export interface P2pkhSendResult {
  readonly tx: TransactionBch;
  readonly hex: string;
  readonly txid: string;
  readonly fee: bigint;
}

export const buildP2pkhSend = (
  privateKey: Uint8Array,
  utxos: ChainUtxo[],
  destinationLocking: Uint8Array,
  sendSatoshis: bigint | 'all',
  changeLocking: Uint8Array,
): P2pkhSendResult => {
  if (utxos.length === 0) throw new Error('No coins to send from this key.');
  const total = utxos.reduce((sum, u) => sum + u.satoshis, 0n);
  const withChangeSize = estimateP2pkhSize(utxos.length, 2);
  const noChangeSize = estimateP2pkhSize(utxos.length, 1);
  const withChangeFee = withChangeSize * FEE_RATE;
  const noChangeFee = noChangeSize * FEE_RATE;

  let outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }>;
  let fee: bigint;
  if (sendSatoshis === 'all') {
    fee = noChangeFee;
    if (total <= fee) throw new Error('Not enough coins to cover the send fee.');
    outputs = [{ lockingBytecode: destinationLocking, valueSatoshis: total - fee }];
  } else {
    if (total >= sendSatoshis + withChangeFee + 546n) {
      fee = withChangeFee;
      outputs = [
        { lockingBytecode: destinationLocking, valueSatoshis: sendSatoshis },
        { lockingBytecode: changeLocking, valueSatoshis: total - sendSatoshis - fee },
      ];
    } else if (total >= sendSatoshis + noChangeFee) {
      fee = noChangeFee;
      outputs = [{ lockingBytecode: destinationLocking, valueSatoshis: sendSatoshis }];
    } else {
      throw new Error(`Not enough coins (have ${total}, need about ${sendSatoshis + withChangeFee}).`);
    }
  }

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
  const encoded = encodeTransactionBch(tx);
  return { tx, hex: Buffer.from(encoded).toString('hex'), txid: hashTransaction(encoded), fee };
};
