export const satsToBch = (sats: bigint): number => Number(sats) / 1e8;

export const fmtBch = (sats: bigint, max = 8): string => {
  const n = satsToBch(sats);
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: max });
};

export const fmtFiat = (usd: number): string =>
  usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const shortAddr = (address: string, head = 10, tail = 6): string => {
  const bare = address.replace(/^bchtest:|^bitcoincash:/, '');
  const prefix = address.startsWith('bchtest:') ? 'bchtest:' : address.startsWith('bitcoincash:') ? 'bitcoincash:' : '';
  if (bare.length <= head + tail + 1) return address;
  return `${prefix}${bare.slice(0, head)}…${bare.slice(-tail)}`;
};

export const whenLabel = (unix: number, now = Date.now(), timeOnly = false): string => {
  const d = new Date(unix * 1000);
  const today = new Date(now);
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });
  if (timeOnly || sameDay) return time;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' })} ${time}`;
};

export const dayLabel = (unix: number, now = Date.now()): string => {
  const d = new Date(unix * 1000);
  const today = new Date(now);
  const yest = new Date(now - 86400000);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(today)) return 'Today';
  if (key(d) === key(yest)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' });
};

export const explorerUrl = (networkId: string, txid: string): string =>
  networkId === 'mainnet' ? `https://bchexplorer.info/tx/${txid}` : `https://chipnet.bchexplorer.info/tx/${txid}`;
