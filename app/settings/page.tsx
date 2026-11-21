'use client';
import Link from 'next/link';
import { BadgeCheck, ChevronRight, Fingerprint, Info, LifeBuoy, Lock, Globe } from 'lucide-react';
import { delayLabel } from '@/src/recovery';
import { AppShell, copy, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { useSession } from '@/lib/client/session';
import { shortAddr } from '@/lib/client/format';
import { DECK_HREF, EMBER_TOKEN_ADDRESS } from '@/src/banner';

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

        <div className="ghead"><b>If you lose your phone</b></div>
        <section className="group">
          <Link className="cell" href={'/settings/backup' + suffix}>
            <span className="lft">
              <span className="logo txt"><LifeBuoy size={18} aria-hidden /></span>
              <span><span className="ct">Backup wallet</span><span className="cs" style={{ display: 'block' }}>{s.vault?.backup ? `On. Moves to your wallet after ${delayLabel(s.vault.backup.delayBlocks)} unused` : 'Off. Add one so your coins are never stuck'}</span></span>
            </span>
            <ChevronRight size={16} className="chev" aria-hidden />
          </Link>
        </section>

        <div className="ghead"><b>Cubby ID</b></div>
        <section className="group">
          <Link className="cell" href={'/id' + suffix}>
            <span className="lft">
              <span className="logo txt"><BadgeCheck size={18} aria-hidden /></span>
              <span><span className="ct">Cubby ID</span><span className="cs" style={{ display: 'block' }}>{s.demo ? 'Verified demo profile' : 'Link a Nostr profile, or find someone'}</span></span>
            </span>
            <ChevronRight size={16} className="chev" aria-hidden />
          </Link>
        </section>

        <div className="ghead"><b>Network</b></div>
        <section className="group">
          <div className="cell">
            <span className="lft">
              <span className="logo txt"><Globe size={18} aria-hidden /></span>
              <span><span className="ct">Use the main network</span><span className="cs" style={{ display: 'block' }}>The main network is on. A send is capped at 9 000 units, so a 20 000 unit deposit covers the fee. Test-network coins have no value.</span></span>
            </span>
            <button className="toggle" type="button" role="switch" aria-checked={onMain} aria-label="Use the main network" onClick={() => s.setNetworkId(onMain ? 'chipnet' : 'mainnet')} />
          </div>
        </section>

        <div className="ghead"><b>Limits</b></div>
        <section className="group">
          <div className="cell"><span className="ct">Recommended deposit</span><span className="cv">20 000 units</span></div>
          <div className="cell"><span className="ct">Typical send fee</span><span className="cv">11 000 units</span></div>
          <p className="hint" style={{ padding: '.75rem 1.1rem 1rem', textAlign: 'left' }}>A send from the box is a large payment, about 10 KB, and the fee is 1 unit per byte. On the main network a send is capped at 9 000 units, so the approved 20 000 unit deposit covers the fee. A smaller deposit cannot cover the send.</p>
        </section>

        <div className="ghead" id="about"><b>About</b></div>
        <section className="group">
          <Link className="cell" href={'/how-it-works' + suffix}><span className="lft"><span className="logo txt"><Info size={18} aria-hidden /></span><span className="ct">How it works</span></span><ChevronRight size={16} className="chev" aria-hidden /></Link>
          <Link className="cell" href="/terms"><span className="ct">Terms</span><ChevronRight size={16} className="chev" aria-hidden /></Link>
          <Link className="cell" href="/privacy"><span className="ct">Privacy</span><ChevronRight size={16} className="chev" aria-hidden /></Link>
          <Link className="cell" href={DECK_HREF}><span className="ct">Widget Factory intro</span><ChevronRight size={16} className="chev" aria-hidden /></Link>
          <a className="cell" href="https://github.com/henrysammarfo/cubby" target="_blank" rel="noreferrer"><span className="ct">Source code</span><ChevronRight size={16} className="chev" aria-hidden /></a>
          <div className="cell"><span className="ct">First commit</span><span className="cv">17 Nov 2026</span></div>
        </section>
        <div className="ghead"><b>Vote with EMBER 2026</b></div>
        <section className="group">
          <div className="cell" style={{ alignItems: 'flex-start' }}>
            <span>
              <span className="ct">EMBER address</span>
              <span className="cs" style={{ display: 'block', overflowWrap: 'anywhere', whiteSpace: 'normal', marginTop: '.25rem' }}>{EMBER_TOKEN_ADDRESS}</span>
            </span>
            <button className="btn text" type="button" onClick={() => void copy(EMBER_TOKEN_ADDRESS, 'Address copied')}>Copy</button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><SettingsInner /></Gate>; }
