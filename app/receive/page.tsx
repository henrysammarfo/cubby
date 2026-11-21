'use client';
import { Copy, Share } from 'lucide-react';
import { AppShell, BackNav, copy, toast } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { AddressQr } from '@/ui/qr';
import { useSession } from '@/lib/client/session';

function ReceiveInner() {
  const s = useSession();
  const address = s.address ?? '';

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Cubby box address', text: address });
        return;
      }
    } catch {
      /* user cancelled or share failed; fall back to copy */
    }
    await copy(address, 'Address copied');
  };

  return (
    <AppShell screen="receive" tab="wallet" noTabs>
      <BackNav href={'/wallet'} title="Receive" />
      <main className="body">
        {s.demo && <div className="demo-banner">Demo box address. Only send test coins you mean to send.</div>}
        <div className="qr-card">
          <h1 className="lt" style={{ fontSize: '1.35rem', textAlign: 'center' }}>Your Bitcoin Cash address</h1>
          <p className="hint">Scan the code or use the address to receive coins on the {s.network.label}.</p>
          <div className="qr-wrap">
            {address && <AddressQr value={address} alt="Payment code for this box" />}
            <span className="mid">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/bitcoin-cash-circle.svg" alt="" /></span>
          </div>
          <div className="addr-line"><code>{address}</code></div>
        </div>
        <div className="pair" style={{ marginTop: 'auto' }}>
          <button className="btn" type="button" onClick={() => void copy(address, 'Address copied')}><Copy size={16} aria-hidden />Copy</button>
          <button className="btn" type="button" onClick={() => void share()}><Share size={16} aria-hidden />Share</button>
        </div>
        <p className="hint">Send at least 20 000 test units so a later send can cover the network fee. Test coins have no value.</p>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><ReceiveInner /></Gate>; }
