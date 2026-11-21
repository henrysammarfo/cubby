'use client';
import Link from 'next/link';
import { ChevronRight, Fingerprint, Info, Lock, Globe } from 'lucide-react';
import { AppShell, copy, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { useSession } from '@/lib/client/session';
import { shortAddr } from '@/lib/client/format';

function SettingsInner() {
  const s = useSession();
  const suffix = useDemoSuffix();
  const onMain = s.networkId === 'mainnet';
  return (
    <AppShell screen="settings" tab="settings">
      <header className="nav large"><div className="lt">Settings</div></header>
      <main className="body settings">
        <section className="group">
          <div className="cell">
            <span className="lft">
              <span className="logo txt"><Lock size={18} aria-hidden /></span>
              <span><span className="ct">Box address</span><span className="cs" style={{ display: 'block' }}>{s.address ? shortAddr(s.address) : 'No box yet'}</span></span>
            </span>
            {s.address && <button className="btn text" type="button" onClick={() => void copy(s.address!, 'Address copied')}>Copy</button>}
          </div>
          <div className="cell">
            <span className="lft">
              <span className="logo txt"><Fingerprint size={18} aria-hidden /></span>
              <span><span className="ct">Phone lock</span><span className="cs" style={{ display: 'block' }}>
                {s.vault
                  ? `Tied to ${s.vault.rpId}. A real iPhone Face ID check has not been completed yet.`
                  : 'No phone lock on this device yet.'}
              </span></span>
            </span>
          </div>
        </section>

        <div className="ghead"><b>Network</b></div>
        <section className="group">
          <div className="cell">
            <span className="lft">
              <span className="logo txt"><Globe size={18} aria-hidden /></span>
              <span><span className="ct">Use the main network</span><span className="cs" style={{ display: 'block' }}>Sending on the main network stays off until it is approved. Test coins have no value.</span></span>
            </span>
            <button className="toggle" type="button" role="switch" aria-checked={onMain} aria-label="Use the main network" onClick={() => s.setNetworkId(onMain ? 'chipnet' : 'mainnet')} />
          </div>
        </section>

        <div className="ghead"><b>Limits</b></div>
        <section className="group">
          <div className="cell"><span className="ct">Recommended deposit</span><span className="cv">20 000 units</span></div>
          <div className="cell"><span className="ct">Typical send fee</span><span className="cv">11 000 units</span></div>
          <p className="hint" style={{ padding: '.75rem 1.1rem 1rem', textAlign: 'left' }}>A send from the box is a large payment, about 10 KB, and the fee is 1 unit per byte. A smaller deposit cannot cover the send.</p>
        </section>

        <div className="ghead"><b>About</b></div>
        <section className="group">
          <Link className="cell" href={'/how-it-works' + suffix}><span className="lft"><span className="logo txt"><Info size={18} aria-hidden /></span><span className="ct">How it works</span></span><ChevronRight size={16} className="chev" aria-hidden /></Link>
          <Link className="cell" href="/terms"><span className="ct">Terms</span><ChevronRight size={16} className="chev" aria-hidden /></Link>
          <Link className="cell" href="/privacy"><span className="ct">Privacy</span><ChevronRight size={16} className="chev" aria-hidden /></Link>
          <div className="cell"><span className="ct">First commit</span><span className="cv">17 Nov 2026</span></div>
        </section>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><SettingsInner /></Gate>; }
