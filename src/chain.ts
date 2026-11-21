/** HTTPS chain access: Watchtower for UTXOs and tokens, explorer for tx lookup and broadcast fallback. */
import { binToHex, hexToBin } from '@bitauth/libauth';
import type { Network } from './network.js';
import { addressToLocking } from './address.js';
import { PUSD_CATEGORY } from './banner.js';

export interface ChainUtxo {
  readonly txid: string;
  readonly vout: number;
  readonly satoshis: bigint;
  readonly lockingBytecode: Uint8Array;
}

export interface WalletBalances {
  readonly satoshis: bigint;
  readonly pusdCents: bigint | null;
}

const jsonOrThrow = async (response: Response, context: string): Promise<unknown> => {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    /* keep text */
  }
  if (!response.ok) {
    const err =
      typeof body === 'object' && body !== null && 'error' in body ? String((body as { error: unknown }).error) : text.slice(0, 200);
    throw new Error(`${context}: ${response.status} ${err}`);
  }
  return body;
};

const extractTxid = (body: unknown): string | null => {
  if (typeof body === 'string' && /^[0-9a-f]{64}$/i.test(body.trim())) return body.trim();
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    if (record.success === false) {
      const err = record.error ?? record;
      throw new Error(`broadcast failed: ${JSON.stringify(err).slice(0, 300)}`);
    }
    for (const key of ['txid', 'tx', 'hash', 'result']) {
      const value = record[key];
      if (typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)) return value;
    }
  }
  return null;
};

export interface ExplorerVout {
  readonly value: number;
  readonly n: number;
  readonly scriptPubKey: {
    readonly hex?: string;
    readonly addresses?: string[];
    readonly type?: string;
  };
}

export interface ExplorerTx {
  readonly txid: string;
  readonly status?: string;
  readonly confirmations?: number;
  readonly vout: ExplorerVout[];
}

export const getTransaction = async (network: Network, txid: string): Promise<ExplorerTx> => {
  const body = await jsonOrThrow(await fetch(`${network.apiBase}/api/bch/tx/${txid}`, { headers: { Accept: 'application/json' } }), 'transaction lookup');
  return body as ExplorerTx;
};

export const getOutputSpendStatus = async (network: Network, txid: string, vout: number): Promise<{ spent: boolean }> => {
  const body = (await jsonOrThrow(
    await fetch(`${network.apiBase}/api/bch/txout/${txid}/${vout}`, { headers: { Accept: 'application/json' } }),
    'output lookup',
  )) as { spent?: boolean };
  return { spent: Boolean(body.spent) };
};

const readWatchtowerUtxos = (body: unknown, address: string): ChainUtxo[] => {
  const locking = addressToLocking(address);
  const list = typeof body === 'object' && body !== null && 'utxos' in body ? (body as { utxos?: unknown }).utxos : body;
  if (!Array.isArray(list)) return [];
  const found: ChainUtxo[] = [];
  for (const row of list) {
    if (typeof row !== 'object' || row === null) continue;
    const rec = row as Record<string, unknown>;
    const txid = String(rec.txid ?? rec.tx_hash ?? '');
    const vout = Number(rec.vout ?? rec.tx_pos ?? rec.index);
    const satoshis = BigInt(String(rec.value ?? rec.satoshis ?? rec.amount ?? '0'));
    if (!/^[0-9a-f]{64}$/i.test(txid) || !Number.isInteger(vout)) continue;
    found.push({ txid, vout, satoshis, lockingBytecode: locking });
  }
  return found;
};

export const utxosFromWatchtower = async (network: Network, address: string): Promise<ChainUtxo[]> => {
  const response = await fetch(`${network.watchtowerBase}/utxo/bch/${encodeURIComponent(address)}/`, { headers: { Accept: 'application/json' } });
  const body = await jsonOrThrow(response, 'watchtower utxos');
  return readWatchtowerUtxos(body, address);
};

export const pusdBalanceFromWatchtower = async (network: Network, address: string): Promise<bigint | null> => {
  try {
    const response = await fetch(`${network.watchtowerBase}/utxo/ct/${encodeURIComponent(address)}/`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as { utxos?: Array<{ tokenid?: string; tokenId?: string; amount?: number | string; decimals?: number }> };
    let cents = 0n;
    let saw = false;
    for (const row of body.utxos ?? []) {
      const id = row.tokenid ?? row.tokenId;
      if (id !== PUSD_CATEGORY) continue;
      saw = true;
      const amount = BigInt(String(row.amount ?? 0));
      const decimals = row.decimals ?? 2;
      // Store as cents (2 decimals). If decimals is 2, amount is already cents.
      cents += decimals === 2 ? amount : (amount * 100n) / 10n ** BigInt(decimals);
    }
    return saw ? cents : 0n;
  } catch {
    return null;
  }
};

export const getWalletBalances = async (network: Network, address: string): Promise<WalletBalances> => {
  const utxos = await utxosFromWatchtower(network, address).catch(async () => (await utxosFromApi(address)) ?? []);
  const satoshis = utxos.reduce((sum, u) => sum + u.satoshis, 0n);
  const pusdCents = network.id === 'mainnet' ? await pusdBalanceFromWatchtower(network, address) : 0n;
  return { satoshis, pusdCents };
};

export const broadcastTransaction = async (network: Network, txHex: string): Promise<string> => {
  if (!network.allowBroadcast) {
    throw new Error('Broadcasting on the main network is off until Henry approves the funding address and amount.');
  }
  try {
    const body = await jsonOrThrow(
      await fetch(`${network.watchtowerBase}/broadcast/`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: txHex }),
      }),
      'watchtower broadcast',
    );
    const txid = extractTxid(body);
    if (txid) return txid;
  } catch {
    /* fall through to the explorer */
  }
  const body = await jsonOrThrow(
    await fetch(`${network.apiBase}/api/bch/broadcast`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ hex: txHex, transaction: txHex }),
    }),
    'explorer broadcast',
  );
  const txid = extractTxid(body);
  if (txid) return txid;
  throw new Error(`broadcast: unexpected response ${JSON.stringify(body).slice(0, 300)}`);
};

/** Find unspent outputs on `address` that appear in a known transaction (no address index required). */
export const utxosFromTransaction = async (network: Network, txid: string, address: string): Promise<ChainUtxo[]> => {
  const locking = addressToLocking(address);
  const lockingHex = binToHex(locking);
  const tx = await getTransaction(network, txid);
  const found: ChainUtxo[] = [];
  for (const output of tx.vout ?? []) {
    const hex = output.scriptPubKey?.hex ?? '';
    const paysHere = hex === lockingHex || (output.scriptPubKey.addresses ?? []).includes(address);
    if (!paysHere) continue;
    const { spent } = await getOutputSpendStatus(network, tx.txid, output.n);
    if (spent) continue;
    const satoshis = BigInt(Math.round(output.value * 1e8));
    found.push({ txid: tx.txid, vout: output.n, satoshis, lockingBytecode: locking });
  }
  return found;
};

/** Same-origin lookup used by the web app, with a direct Watchtower fallback. */
export const utxosFromApi = async (address: string, network?: Network): Promise<ChainUtxo[] | null> => {
  try {
    const query = new URLSearchParams({ address });
    if (network) query.set('network', network.id);
    const response = await fetch(`/api/utxos?${query.toString()}`);
    if (response.ok) {
      const body = (await response.json()) as { utxos?: Array<{ txid: string; vout: number; satoshis: string }> };
      if (body.utxos) {
        const locking = addressToLocking(address);
        return body.utxos.map((u) => ({
          txid: u.txid,
          vout: u.vout,
          satoshis: BigInt(u.satoshis),
          lockingBytecode: locking,
        }));
      }
    }
  } catch {
    /* fall through */
  }
  if (network) {
    try {
      return await utxosFromWatchtower(network, address);
    } catch {
      return null;
    }
  }
  return null;
};

export const hexFromBytes = (bytes: Uint8Array): string => binToHex(bytes);
export const bytesFromHex = (hex: string): Uint8Array => hexToBin(hex);
