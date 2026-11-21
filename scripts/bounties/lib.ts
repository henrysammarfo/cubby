/** Shared helpers for the chipnet bounty demos. Secrets stay in .secrets/ (gitignored); proofs are public txids only. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  binToHex,
  decodePrivateKeyWif,
  encodeTransactionBch,
  generateTransaction,
  hashTransaction,
  hexToBin,
  walletTemplateP2pkhNonHd,
  walletTemplateToCompilerBch,
  type TransactionBch,
} from '@bitauth/libauth';
import { NETWORKS } from '../../src/network.js';
import { broadcastTransaction, getTransaction, utxosFromTransaction, type ChainUtxo } from '../../src/chain.js';
import { randomPasskeyKey } from '../../src/bounties/keyed-passkey.js';

export const network = NETWORKS.chipnet;
const ROOT = new URL('../../', import.meta.url).pathname;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const loadE2eKeys = async (): Promise<{ keyA: Uint8Array; keyB: Uint8Array; addrA: string; addrB: string }> => {
  const raw = JSON.parse(await readFile(`${ROOT}.secrets/chipnet-e2e.json`, 'utf8')) as {
    a: { wif: string; address: string };
    b: { wif: string; address: string };
  };
  const dec = (wif: string) => {
    const r = decodePrivateKeyWif(wif);
    if (typeof r === 'string') throw new Error(r);
    return r.privateKey;
  };
  return { keyA: dec(raw.a.wif), keyB: dec(raw.b.wif), addrA: raw.a.address, addrB: raw.b.address };
};

/** A demo P-256 passkey key kept in .secrets so chipnet coins locked to the demo vault stay recoverable. */
export const loadDemoPasskeyKey = async (name: string): Promise<Uint8Array> => {
  const path = `${ROOT}.secrets/bounty-passkeys.json`;
  const all: Record<string, string> = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : {};
  if (!all[name]) {
    all[name] = binToHex(randomPasskeyKey());
    await mkdir(`${ROOT}.secrets`, { recursive: true });
    await writeFile(path, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
  }
  return hexToBin(all[name]!);
};

export const loadProof = async <T extends object>(file: string, init: T): Promise<T> => {
  const path = `${ROOT}docs/proofs/${file}`;
  return existsSync(path) ? { ...init, ...JSON.parse(await readFile(path, 'utf8')) } : init;
};
export const saveProof = async (file: string, data: object): Promise<void> => {
  await writeFile(`${ROOT}docs/proofs/${file}`, JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
};

const compiler = walletTemplateToCompilerBch(walletTemplateP2pkhNonHd);

/** Sign a P2PKH spend paying arbitrary outputs. Change must already be included by the caller. */
export const signP2pkh = (
  privateKey: Uint8Array,
  utxos: ChainUtxo[],
  outputs: TransactionBch['outputs'],
  sequenceNumber = 0xffffffff,
): { hex: string; txid: string; size: number } => {
  const generated = generateTransaction({
    version: 2,
    locktime: 0,
    inputs: utxos.map((u) => ({
      outpointTransactionHash: hexToBin(u.txid),
      outpointIndex: u.vout,
      sequenceNumber,
      unlockingBytecode: { compiler, script: 'unlock', valueSatoshis: u.satoshis, data: { keys: { privateKeys: { key: privateKey } } } },
    })),
    outputs,
  });
  if (!generated.success) throw new Error(`sign failed: ${JSON.stringify(generated.errors).slice(0, 400)}`);
  const encoded = encodeTransactionBch(generated.transaction as TransactionBch);
  return { hex: binToHex(encoded), txid: hashTransaction(encoded), size: encoded.length };
};

export const broadcast = async (label: string, hex: string): Promise<string> => {
  const txid = await broadcastTransaction(network, hex);
  console.log(`${label}: ${txid} (${hex.length / 2} bytes)`);
  return txid;
};

export const waitSeen = async (txid: string, attempts = 60): Promise<void> => {
  for (let i = 0; i < attempts; i++) {
    try {
      await getTransaction(network, txid);
      return;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error(`${txid} not visible on the explorer yet`);
};

export const confirmations = async (txid: string): Promise<number> => {
  try {
    const tx = (await getTransaction(network, txid)) as { confirmations?: number };
    return tx.confirmations ?? 0;
  } catch {
    return 0;
  }
};

export const waitConfirmed = async (txid: string, need = 1, maxMinutes = 60): Promise<void> => {
  const until = Date.now() + maxMinutes * 60_000;
  while (Date.now() < until) {
    const c = await confirmations(txid);
    if (c >= need) return;
    console.log(`waiting for ${txid.slice(0, 12)}… confirmations ${c}/${need}`);
    await sleep(30_000);
  }
  throw new Error(`${txid} has not confirmed ${need} times in ${maxMinutes} minutes`);
};

export const utxoAt = async (txid: string, vout: number, address: string): Promise<ChainUtxo> => {
  const all = await utxosFromTransaction(network, txid, address);
  const u = all.find((x) => x.vout === vout);
  if (!u) throw new Error(`${txid}:${vout} is not an unspent output of ${address}`);
  return u;
};
