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
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No deposits or spends recorded on this device yet. They will appear here after you move coins.';
    host.append(p);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'activity';
  for (const item of items) {
    const li = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = item.kind === 'deposit' ? 'Deposit' : 'Spend';
    const meta = document.createElement('p');
    meta.className = 'muted';
    const when = new Date(item.at);
    const timeLabel = Number.isNaN(when.getTime()) ? item.at : when.toLocaleString('en-GB', { timeZone: 'Africa/Accra' }) + ' Accra';
    meta.textContent = `${item.satoshis} units · ${timeLabel}`;
    const link = document.createElement('a');
    link.href = explorerTxUrl(network, item.txid);
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Open this payment on the explorer';
    li.append(title, meta, link);
    list.append(li);
  }
  host.append(list);
};
