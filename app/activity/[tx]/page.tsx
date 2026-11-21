'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell, BackNav, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { StatusChip } from '@/ui/StatusChip';
import { useSession } from '@/lib/client/session';
import { useActivity } from '@/lib/client/data';
import { explorerUrl, fmtBch, shortAddr, whenLabel } from '@/lib/client/format';
import { DEMO_DEPOSIT, DEMO_DEPOSIT_SATS, DEMO_FEE_SATS, DEMO_SENT_SATS, DEMO_SPEND, DEMO_SPEND_TO, DEMO_TIME } from '@/lib/demo';
import type { ChainTx } from '@/lib/client/data';

function fallbackTx(txid: string): ChainTx | null {
  if (txid === DEMO_SPEND) return { txid, kind: 'out', satoshis: DEMO_SENT_SATS, time: DEMO_TIME, confirmations: 162, feeSats: DEMO_FEE_SATS, counterparty: DEMO_SPEND_TO };
  if (txid === DEMO_DEPOSIT) return { txid, kind: 'in', satoshis: DEMO_DEPOSIT_SATS, time: DEMO_TIME, confirmations: 162 };
  return null;
}

function ReceiptInner() {
  const params = useParams<{ tx: string }>();
  const txid = String(params.tx ?? '');
  const router = useRouter();
  const s = useSession();
  const suffix = useDemoSuffix();
  const { txs } = useActivity(s.address, s.networkId, s.demo);
  const [tx, setTx] = useState<ChainTx | null>(null);

  useEffect(() => {
    const found = txs?.find((t) => t.txid === txid) ?? fallbackTx(txid);
    if (found) setTx(found);
  }, [txid, txs]);

  const incoming = tx?.kind === 'in';

  return (
    <AppShell screen="receipt" tab="activity" noTabs>
      <BackNav href={'/activity'} title="Receipt" />
      <main className="body">
        {!tx && <div className="skel" style={{ height: '8rem' }} />}
        {tx && (
          <>
            <div className="rhead">
              <div className="lt" style={{ color: incoming ? 'var(--up)' : 'var(--ink)' }}>{incoming ? '+' : '−'}{fmtBch(tx.satoshis)} BCH</div>
              <p className="hint">{incoming ? 'Received' : 'Sent'}{tx.counterparty ? ` · ${shortAddr(tx.counterparty)}` : ''}</p>
              <StatusChip confirmations={tx.confirmations} />
            </div>
            <section className="group card">
              <div className="cell"><span>Amount</span><span className="cv">{fmtBch(tx.satoshis)} BCH</span></div>
              {tx.feeSats !== undefined && <div className="cell"><span>Fee</span><span className="cv">{tx.feeSats.toLocaleString()} units</span></div>}
              {tx.time !== undefined && <div className="cell"><span>Time</span><span className="cv">{whenLabel(tx.time)} Accra</span></div>}
              <div className="cell"><span>Confirmations</span><span className="cv">{tx.confirmations === undefined ? 'Waiting' : tx.confirmations.toLocaleString()}</span></div>
              <div className="cell"><span>Network</span><span className="cv">{s.network.label}</span></div>
              <div className="cell"><span>Payment id</span><span className="cv mono" title={txid}>{txid.slice(0, 10)}…{txid.slice(-6)}</span></div>
            </section>
            <a className="btn big" href={explorerUrl(s.networkId, txid)} target="_blank" rel="noreferrer">View on explorer</a>
            <button className="btn text" type="button" onClick={() => router.push('/activity' + suffix)}>Done</button>
          </>
        )}
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><ReceiptInner /></Gate>; }
