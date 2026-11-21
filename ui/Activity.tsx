'use client';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import { dayLabel, fmtBch, fmtFiat, shortAddr, whenLabel, satsToBch } from '@/lib/client/format';
import type { ChainTx } from '@/lib/client/data';
import { usePrice } from '@/lib/client/data';
import { useDemoSuffix } from './kit';

export function ActivityRow({ tx, hrefBase = '/activity' }: { tx: ChainTx; hrefBase?: string }) {
  const suffix = useDemoSuffix();
  const price = usePrice();
  const incoming = tx.kind === 'in';
  const title = incoming ? 'Received' : 'Sent';
  const who = tx.counterparty ? shortAddr(tx.counterparty, 6, 4).replace(/^bchtest:|^bitcoincash:/, '') : 'this box';
  const time = tx.time ? whenLabel(tx.time, Date.now(), true) : 'Time not yet known';
  const sub = `${incoming ? 'From' : 'To'} ${who} · ${time}`;
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  const fiat = price ? price.usd * satsToBch(tx.satoshis) : null;
  return (
    <Link className="row w-chev" href={`${hrefBase}/${tx.txid}${suffix}`}>
      <span className="logo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/bitcoin-cash-circle.svg" alt="" /></span>
      <span className="rn"><span className="nm">{title}</span><span className="sb">{sub}</span></span>
      <span className="px">
        <span className={'p ' + (incoming ? 'up' : 'dn')}>{incoming ? '+' : '−'}{fmtBch(tx.satoshis)} BCH</span>
        {fiat !== null && <span className="c">{fmtFiat(fiat)}</span>}
      </span>
      <span className="chev2"><ChevronRight size={16} aria-hidden /></span>
    </Link>
  );
}

export function ActivityList({ txs, max, empty }: { txs: ChainTx[] | null; max?: number; empty?: React.ReactNode }) {
  if (!txs) return <div className="skel" style={{ height: '3.5rem' }} />;
  if (!txs.length) return <>{empty}</>;
  const rows = typeof max === 'number' ? txs.slice(0, max) : txs;
  if (max) {
    return <section>{rows.map((t) => <ActivityRow key={t.txid} tx={t} />)}</section>;
  }
  const groups: { day: string; items: ChainTx[] }[] = [];
  for (const t of rows) {
    const day = t.time ? dayLabel(t.time) : 'Earlier';
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(t);
    else groups.push({ day, items: [t] });
  }
  return (
    <>
      {groups.map((g) => (
        <div key={g.day}>
          <div className="day">{g.day}</div>
          <section>{g.items.map((t) => <ActivityRow key={t.txid} tx={t} />)}</section>
        </div>
      ))}
    </>
  );
}
