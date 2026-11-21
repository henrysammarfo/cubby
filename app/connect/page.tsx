'use client';
import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { AppShell, BackNav, copy } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { AddressQr } from '@/ui/qr';
import { useSession } from '@/lib/client/session';
import { getConnectionLink, startConnect, stopConnect, type WalletSession } from '@/web/wizard';

function ConnectInner() {
  const s = useSession();
  const [uri, setUri] = useState('');
  const [status, setStatus] = useState('Waiting for a wallet…');
  const [session, setSession] = useState<WalletSession | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const begin = async () => {
    setErr(null);
    setSession(null);
    setStatus('Creating a new connection code…');
    try {
      await startConnect({
        onUri: (u) => { setUri(u); setStatus('Scan this code in Paytaca, Selene, or Cashonize.'); },
        onStatus: (m) => setStatus(m),
        onReady: (sess) => { setSession(sess); setStatus(`Connected to ${sess.walletName}.`); },
        onDropped: (reason) => { setSession(null); setStatus(reason + ' Tap New code to try again.'); },
        onTimeout: () => { setStatus('The code expired. Tap New code for a fresh one.'); setUri(''); },
        onError: (m) => setErr(m),
      }, s.network);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void begin();
    return () => { void stopConnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.networkId]);

  return (
    <AppShell screen="connect" tab="wallet" noTabs>
      <BackNav href={'/wallet'} title="Connect a wallet" />
      <main className="body">
        <p className="hint" style={{ textAlign: 'left' }}>Use WizardConnect, not the usual Scan button. In Paytaca, open Apps, then WizardConnect, then Scan.</p>
        <ol className="steps">
          <li><span className="n">1</span><span>Open Paytaca, Selene, or Cashonize on the test network.</span></li>
          <li><span className="n">2</span><span>In Paytaca go to Apps, then WizardConnect, then Scan.</span></li>
          <li><span className="n">3</span><span>Scan this code. If it hangs, tap New code.</span></li>
        </ol>
        <div className="qr-card">
          {uri ? <div className="qr-wrap"><AddressQr value={uri} alt="Connection code" /></div> : <div className="skel" style={{ width: '14rem', height: '14rem' }} />}
          <p className={err ? 'errline' : 'hint'}>{err || status}</p>
          <div style={{ display: 'flex', gap: '.5rem', width: '100%' }}>
            <button className="btn ghost big" type="button" onClick={() => void begin()}>New code</button>
            {uri && <button className="btn big" type="button" onClick={() => void copy(uri, 'Connection link copied')}><Copy size={16} aria-hidden />Copy link</button>}
          </div>
          {session && (
            <button className="btn ghost big" type="button" onClick={() => { void stopConnect(); setSession(null); setUri(''); setStatus('Disconnected.'); }}>Disconnect</button>
          )}
        </div>
        <div className="ghead"><b>Works with</b></div>
        <section className="group">
          <div className="cell"><span className="lft" style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/wallets/paytaca.png" alt="" width={28} height={28} />Paytaca</span></div>
          <div className="cell"><span className="lft" style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/wallets/selene.svg" alt="" width={28} height={28} />Selene</span></div>
          <div className="cell"><span className="lft" style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/wallets/cashonize.png" alt="" width={28} height={28} />Cashonize</span></div>
        </section>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><ConnectInner /></Gate>; }
