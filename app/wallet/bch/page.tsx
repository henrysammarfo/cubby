'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, BackNav, Money, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { useSession } from '@/lib/client/session';
import { useBalances, usePrice } from '@/lib/client/data';
import { fmtBch, fmtFiat, satsToBch } from '@/lib/client/format';

function Chart({ points }: { points: { t: number; p: number }[] }) {
  const w = 320, h = 160, padX = 2, padY = 16;
  const ys = points.map((p) => p.p);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const coords = points.map((pt, i) => {
    const x = padX + (i / Math.max(1, points.length - 1)) * (w - padX * 2);
    const y = padY + (1 - (pt.p - min) / span) * (h - padY * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1]![0].toFixed(1)} ${h} L${coords[0]![0].toFixed(1)} ${h} Z`;
  const up = points[points.length - 1]!.p >= points[0]!.p;
  const stroke = up ? '#12805C' : '#C81E3A';
  const fill = up ? 'url(#upFill)' : 'url(#dnFill)';
  return (
    <div className="chart" aria-hidden>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12805C" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#12805C" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dnFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C81E3A" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#C81E3A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={fill} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function CoinInner() {
  const s = useSession();
  const suffix = useDemoSuffix();
  const { sats } = useBalances(s.address, s.networkId);
  const price = usePrice();
  const [points, setPoints] = useState<{ t: number; p: number }[] | null>(null);
  useEffect(() => {
    fetch('/api/chart').then((r) => r.json()).then((b: { points?: { t: number; p: number }[] | null }) => {
      if (Array.isArray(b.points) && b.points.length > 3) setPoints(b.points);
    }).catch(() => setPoints(null));
  }, []);
  const ready = sats !== null;
  const fiat = ready && price ? price.usd * satsToBch(sats!) : null;
  return (
    <AppShell screen="coin" tab="wallet" noTabs>
      <BackNav href={'/wallet'} title="Bitcoin Cash" />
      <main className="body">
        <div>
          <div className="lt">{price ? fmtFiat(price.usd) : ready ? `${fmtBch(sats!)} BCH` : '…'}</div>
          {price?.change24h != null && (
            <div className={'chg ' + (price.change24h >= 0 ? 'up' : 'dn')}>
              {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}% today · CoinGecko
            </div>
          )}
        </div>
        {points && <Chart points={points} />}
        <div className="ghead"><b>Your balance</b></div>
        <div className="row">
          <span className="logo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/bitcoin-cash-circle.svg" alt="" /></span>
          <span className="rn"><span className="nm">Bitcoin Cash</span><span className="sb">{s.network.label}</span></span>
          <span className="px">
            <span className="p">{fiat !== null ? fmtFiat(fiat) : ready ? `${fmtBch(sats!)} BCH` : '—'}</span>
            <span className="c">{ready ? `${fmtBch(sats!)} BCH` : ''}</span>
          </span>
        </div>
        <div className="pair">
          <Link className="btn" href={'/send' + suffix}>Send</Link>
          <Link className="btn ghost" href={'/receive' + suffix}>Receive</Link>
        </div>
        {price && <p className="hint" style={{ textAlign: 'left' }}>Price from CoinGecko, bitcoin-cash in US dollars.</p>}
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><CoinInner /></Gate>; }
