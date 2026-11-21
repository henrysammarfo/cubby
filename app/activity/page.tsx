'use client';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { ActivityList } from '@/ui/Activity';
import { useSession } from '@/lib/client/session';
import { useActivity } from '@/lib/client/data';
import { demoReplayFromSearch } from '@/lib/demo';

const FILTERS = [
  ['all', 'All'],
  ['in', 'Received'],
  ['out', 'Sent'],
] as const;

function ActivityInner() {
  const s = useSession();
  const replay = demoReplayFromSearch(useSearchParams());
  const { txs, error } = useActivity(s.address, s.networkId, s.demo, replay);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const filtered = useMemo(() => {
    if (!txs) return null;
    if (filter === 'all') return txs;
    return txs.filter((t) => t.kind === filter || (filter === 'out' && t.kind === 'both') || (filter === 'in' && t.kind === 'both'));
  }, [txs, filter]);
  const empty = (
    <div className="empty">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot/cubby-hero-1280.jpg" alt="" />
      <b>No payments yet</b>
      <p>Your first deposit shows up here.</p>
      <a className="btn" href="https://tbch.googol.cash/" target="_blank" rel="noreferrer">Get test coins</a>
    </div>
  );
  return (
    <AppShell screen="activity" tab="activity">
      <header className="nav"><div className="lt">Activity</div></header>
      <main className="body">
        {s.demo && <div className="demo-banner">{replay === 'funded'
          ? 'Test network replay. This list shows the real deposit. The spend is next, if you want to see it.'
          : 'Test network replay. These are the real deposit and the completed proof spend.'}</div>}
        <div className="chips" role="tablist" aria-label="Filter payments">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" className={'chip' + (filter === id ? ' on' : '')} onClick={() => setFilter(id)} aria-pressed={filter === id}>{label}</button>
          ))}
        </div>
        <ActivityList txs={filtered} empty={empty} />
        {error && <p className="errline">{error}</p>}
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><ActivityInner /></Gate>; }
