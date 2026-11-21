import { explorerTxUrl, type Network } from '../src/network.js';
import type { AddressTx } from '../src/chain.js';

const STORE = 'cubby-activity-v1';

export type ActivityKind = 'deposit' | 'spend';

export interface ActivityItem {
  readonly kind: ActivityKind;
  readonly txid: string;
  readonly at: string;
  readonly satoshis: string;
  readonly network: string;
  readonly vaultAddress: string;
  readonly note?: string;
}

export const loadActivity = (vaultAddress: string, networkId: string): ActivityItem[] => {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return [];
    const all = JSON.parse(raw) as ActivityItem[];
    return all.filter((item) => item.vaultAddress === vaultAddress && item.network === networkId);
  } catch {
    return [];
  }
};

export const recordActivity = (item: ActivityItem): void => {
  try {
    const raw = localStorage.getItem(STORE);
    const all: ActivityItem[] = raw ? (JSON.parse(raw) as ActivityItem[]) : [];
    if (all.some((row) => row.txid === item.txid && row.kind === item.kind)) return;
    all.unshift(item);
    localStorage.setItem(STORE, JSON.stringify(all.slice(0, 100)));
  } catch {
    /* ignore quota */
  }
};

export const mergeChainActivity = (local: ActivityItem[], chain: AddressTx[], vaultAddress: string, networkId: string): ActivityItem[] => {
  const byTx = new Map<string, ActivityItem>();
  for (const item of local) byTx.set(item.txid, item);
  for (const tx of chain) {
    if (byTx.has(tx.txid)) continue;
    const kind: ActivityKind = tx.direction === 'out' ? 'spend' : 'deposit';
    byTx.set(tx.txid, {
      kind,
      txid: tx.txid,
      at: tx.height > 0 ? `Block ${tx.height}` : 'Unconfirmed',
      satoshis: String(tx.satoshis),
      network: networkId,
      vaultAddress,
    });
  }
  return [...byTx.values()];
};

export const renderActivity = (host: HTMLElement, items: ActivityItem[], network: Network): void => {
  host.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'activity-empty';
    empty.innerHTML = '<b>No payments yet.</b> Your first deposit shows up here.';
    host.append(empty);
    return;
  }
  host.classList.add('activity');
  for (const item of items) {
    const li = document.createElement('li');
    const tile = document.createElement('span');
    tile.className = item.kind === 'deposit' ? 'tile in' : 'tile out';
    tile.textContent = item.kind === 'deposit' ? 'In' : 'Out';
    const mid = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.kind === 'deposit' ? 'Received' : 'Sent';
    const meta = document.createElement('p');
    meta.className = 'when';
    const when = new Date(item.at);
    meta.textContent = Number.isNaN(when.getTime()) ? item.at : when.toLocaleString('en-GB', { timeZone: 'Africa/Accra' }) + ' Accra';
    const link = document.createElement('a');
    link.href = explorerTxUrl(network, item.txid);
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Open this payment';
    mid.append(title, meta, link);
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = item.satoshis === '0' ? '' : `${item.satoshis} units`;
    li.append(tile, mid, amt);
    host.append(li);
  }
};
