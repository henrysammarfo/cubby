'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { VerifiedBadge } from '@/ui/Badge';
import { useSession } from '@/lib/client/session';
import { explorerUrl, fmtBch, shortAddr } from '@/lib/client/format';
import { useDemoSuffix } from '@/ui/kit';

function SuccessInner() {
  const q = useSearchParams();
  const router = useRouter();
  const s = useSession();
  const suffix = useDemoSuffix();
  const txid = q.get('txid') || '';
  const amount = q.get('amount') ? BigInt(q.get('amount')!) : 0n;
  return (
    <AppShell screen="success" tab="wallet" noTabs>
      <main className="body welcome">
        <VerifiedBadge label="Payment sent" />
        <h1>Transaction successful</h1>
        <p className="lede">{s.demo && !s.vault ? 'Replay of the completed test-network proof spend. This is not a new payment from this phone.' : 'Your payment was sent.'}</p>
        <section className="group card" style={{ width: '100%', textAlign: 'left' }}>
          <div className="cell"><span>Amount</span><span className="cv">{fmtBch(amount)} BCH</span></div>
          <div className="cell"><span>Status</span><span className="cv">Sent</span></div>
          <div className="cell"><span>Payment id</span><span className="cv mono">{txid ? shortAddr(txid, 8, 6) : '—'}</span></div>
        </section>
        <div className="dock">
          <button className="btn big" type="button" onClick={() => router.push('/wallet' + suffix)}>Done</button>
          {txid && <a className="btn text" href={explorerUrl(s.networkId, txid)} target="_blank" rel="noreferrer">View on explorer</a>}
        </div>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><SuccessInner /></Gate>; }
