import { explorerTxUrl, type Network } from '../src/network.js';

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

export const renderActivity = (host: HTMLElement, items: ActivityItem[], network: Network): void => {
  host.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'activity-empty';
    empty.innerHTML = '<img src="/mascot/cubby-hero-1280.jpg" width="280" height="180" alt="Cubby, the vault keeper"><p><b>Nothing yet.</b> Your first deposit shows up here</p>';
    host.append(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'activity timeline';
  for (const item of items) {
    const li = document.createElement('li');
    const tile = document.createElement('span');
    tile.className = item.kind === 'deposit' ? 'tile in' : 'tile out';
    tile.textContent = item.kind === 'deposit' ? 'In' : 'Out';
    const mid = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.kind === 'deposit' ? 'Deposit' : 'Spend';
    const when = new Date(item.at);
    const timeLabel = Number.isNaN(when.getTime()) ? item.at : when.toLocaleString('en-GB', { timeZone: 'Africa/Accra' }) + ' Accra';
    const meta = document.createElement('p');
    meta.className = 'when';
    meta.textContent = timeLabel;
    const link = document.createElement('a');
    link.href = explorerTxUrl(network, item.txid);
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Open in explorer';
    mid.append(title, meta, link);
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = `${item.satoshis} units`;
    li.append(tile, mid, amt);
    list.append(li);
  }
  host.append(list);
};
