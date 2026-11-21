'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Bell, ChevronRight, Plus, Search, Wallet as WalletIcon } from 'lucide-react';
import { AppShell, Money, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { ActivityList } from '@/ui/Activity';
import { useSession } from '@/lib/client/session';
import { useActivity, useBalances, usePrice } from '@/lib/client/data';
import { fmtBch, fmtFiat, shortAddr, satsToBch } from '@/lib/client/format';

function WalletInner() {
  const s = useSession();
  const suffix = useDemoSuffix();
  const { sats, error } = useBalances(s.address, s.networkId);
  const { txs } = useActivity(s.address, s.networkId, s.demo);
  const price = usePrice();
  const [query, setQuery] = useState('');
  const [searchOn, setSearchOn] = useState(false);
  const ready = sats !== null;
  const fiat = ready && price ? price.usd * satsToBch(sats!) : null;
  const empty = ready && sats === 0n && (!txs || txs.length === 0);
  const showBch = !query || 'bitcoin cash bch'.includes(query.toLowerCase());

  return (
    <AppShell screen="wallet" tab="wallet">
      <header className="nav">
        <div className="who-me">
          <span className="av">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo/cubby.svg" alt="" /></span>
          <span>
            <span className="nm">My box</span>
            <span className="sb">{s.address ? shortAddr(s.address, 6, 4) : s.network.label}</span>
          </span>
        </div>
        <div className="home-tools">
          <button type="button" aria-label="Search assets" onClick={() => setSearchOn((v) => !v)}><Search size={18} aria-hidden /></button>
          <Link href={'/activity' + suffix} aria-label="Activity"><Bell size={18} aria-hidden /></Link>
        </div>
      </header>
      <main className="body wallet">
        {s.demo && <div className="demo-banner">Demo box. These payments are a real test network example, not a box on this phone.</div>}
        {searchOn && (
          <div className="field">
            <Search size={16} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assets" autoFocus />
          </div>
        )}
        <section className="cash" aria-label="Total balance">
          <div className="pcard">
            <div>
              <div className="pc-lab">Total balance</div>
              <div className="pc-v">{ready ? <Money sats={sats!} /> : <span className="skel" style={{ display: 'inline-block', width: '8rem', height: '2.2rem' }} />}</div>
              {fiat !== null && <div className="pc-fiat">About {fmtFiat(fiat)} · CoinGecko</div>}
              {price?.change24h != null && (
                <div className={'pc-chg ' + (price.change24h >= 0 ? 'up' : 'dn')}>
                  {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}% today
                </div>
              )}
            </div>
            <Link href={'/receive' + suffix} className="plus" aria-label="Receive"><Plus size={18} aria-hidden /></Link>
          </div>
          <div className="cash-acts">
            <Link href={'/send' + suffix}><ArrowUpRight size={16} aria-hidden />Send</Link>
            <Link href={'/receive' + suffix}><ArrowDownLeft size={16} aria-hidden />Receive</Link>
            <Link href={'/connect' + suffix}><WalletIcon size={16} aria-hidden />Connect</Link>
          </div>
        </section>

        <div className="ghead"><b>Tokens</b></div>
        {showBch && (
          <section>
            <Link className="row w-chev" href={'/wallet/bch' + suffix}>
              <span className="logo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/bitcoin-cash-circle.svg" alt="" /></span>
              <span className="rn">
                <span className="nm">Bitcoin Cash</span>
                {price?.change24h != null
                  ? <span className={'chg ' + (price.change24h >= 0 ? 'up' : 'dn')}>{price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}%</span>
                  : <span className="sb">{s.network.label}</span>}
              </span>
              <span className="px">
                <span className="p">{fiat !== null ? fmtFiat(fiat) : ready ? `${fmtBch(sats!)} BCH` : '—'}</span>
                <span className="c">{ready ? `${fmtBch(sats!)} BCH` : ''}</span>
              </span>
              <span className="chev2"><ChevronRight size={16} aria-hidden /></span>
            </Link>
          </section>
        )}

        <div className="ghead"><b>Activity</b><Link className="link" href={'/activity' + suffix}>See all</Link></div>
        {empty ? (
          <div className="empty">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot/cubby-hero-1280.jpg" alt="" />
            <b>No payments yet</b>
            <p>Your first deposit shows up here.</p>
            <a className="btn" href="https://tbch.googol.cash/" target="_blank" rel="noreferrer">Get test coins</a>
          </div>
        ) : (
          <ActivityList txs={txs} max={4} />
        )}
        {error && <p className="errline">Could not read the balance. {error}</p>}
      </main>
    </AppShell>
  );
}

export default function Page() { return <Gate><WalletInner /></Gate>; }
