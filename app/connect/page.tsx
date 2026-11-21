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
  const [qrUri, setQrUri] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('Waiting for a wallet…');
  const [session, setSession] = useState<WalletSession | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const begin = async () => {
    setErr(null);
    setSession(null);
    setStatus('Creating a new connection code…');
    try {
      await startConnect({
        onUri: (u, q) => { setUri(u); setQrUri(q || u); setStatus('Scan this code in Paytaca, Selene, or Cashonize.'); },
        onStatus: (m) => setStatus(m),
        onReady: (sess) => { setSession(sess); setStatus(`Connected to ${sess.walletName}.`); },
        onDropped: (reason) => { setSession(null); setStatus(reason + ' Tap New code to try again.'); },
        onTimeout: () => { setStatus('The code expired. Tap New code for a fresh one.'); setUri(''); setQrUri(''); },
        onError: (m) => setErr(m),
      }, s.network);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const copyLink = async () => {
    if (!uri) return;
    await copy(uri, 'Connection link copied');
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
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
        <p className="hint" style={{ textAlign: 'left' }}>In Paytaca, open Apps, then WizardConnect, then Scan. The usual Scan button does not connect.</p>
        <div className="qr-card">
          {uri ? (
            <button
              type="button"
              className={'qr-wrap qr-tap' + (copied ? ' copied' : '')}
              aria-label="Copy the connection link"
              title="Tap to copy the link"
              onClick={() => void copyLink()}
            >
              <AddressQr value={qrUri || uri} alt="WizardConnect connection code" />
              {/* WizardConnect logo from @wizardconnect/react (LGPL 3.0), drawn on the code like the official AlphanumericQRCode. */}
              <span className="mid hat" aria-hidden>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/wizardconnect.png" alt="" width={40} height={40} /></span>
            </button>
          ) : <div className="skel" style={{ width: '14rem', height: '14rem' }} />}
          {uri && <p className="hint qr-tip">{copied ? 'Link copied. Paste it in your wallet.' : 'Tap the code to copy the link.'}</p>}
          <p className={err ? 'errline' : 'hint'}>{err || status}</p>
          <div className="pair">
            <button className="btn ghost big" type="button" onClick={() => void begin()}>New code</button>
            {uri && <button className="btn big" type="button" onClick={() => void copyLink()}><Copy size={16} aria-hidden />Copy link</button>}
          </div>
          {session && (
            <button className="btn ghost big" type="button" onClick={() => { void stopConnect(); setSession(null); setUri(''); setQrUri(''); setStatus('Disconnected.'); }}>Disconnect</button>
          )}
        </div>
        <ol className="steps">
          <li><span className="n">1</span><span>Open Paytaca, Selene, or Cashonize on the {s.network.label.toLowerCase()}.</span></li>
          <li><span className="n">2</span><span>In Paytaca, go to Apps, then WizardConnect, then Scan.</span></li>
          <li><span className="n">3</span><span>If it hangs, tap New code for a fresh one.</span></li>
        </ol>
        <div className="ghead"><b>Works with</b></div>
        <div className="wallet-tiles">
          <div className="wallet-tile">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/wallets/paytaca.png" alt="" width={36} height={36} /><b>Paytaca</b></div>
          <div className="wallet-tile">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/wallets/selene.svg" alt="" width={36} height={36} /><b>Selene</b></div>
          <div className="wallet-tile">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/wallets/cashonize.png" alt="" width={36} height={36} /><b>Cashonize</b></div>
        </div>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><ConnectInner /></Gate>; }
