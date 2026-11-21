'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { AppShell, BackNav, copy, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { VerifiedBadge } from '@/ui/Badge';
import { useSession } from '@/lib/client/session';
import { IDENTITY_PROOF } from '@/lib/proofs';
import { explorerUrl, shortAddr } from '@/lib/client/format';
import { npubToHex } from '@/src/bounties/identity';

function IdInner() {
  const s = useSession();
  const suffix = useDemoSuffix();
  const demo = s.demo;
  const [query, setQuery] = useState(demo ? IDENTITY_PROOF.npub : '');
  const [found, setFound] = useState<'proof' | 'none' | null>(demo ? 'proof' : null);
  const [err, setErr] = useState<string | null>(null);

  const shown = useMemo(() => (found === 'proof' ? IDENTITY_PROOF : null), [found]);

  const onFind = () => {
    setErr(null);
    const q = query.trim();
    if (!q) { setFound(null); return; }
    const matchesProof = q === IDENTITY_PROOF.npub
      || q === IDENTITY_PROOF.vaultAddress
      || q.replace(/^bchtest:/, '') === IDENTITY_PROOF.vaultAddress.replace(/^bchtest:/, '');
    if (matchesProof) { setFound('proof'); return; }
    try {
      if (q.startsWith('npub')) npubToHex(q);
    } catch {
      setErr('That does not look like a Nostr profile or a box address.');
      setFound('none');
      return;
    }
    setFound('none');
    setErr('Public relay search is not hooked up yet. The verified demo profile is shown when you paste its npub.');
  };

  const sendHref = shown
    ? '/send' + (suffix ? suffix + '&to=' + encodeURIComponent(shown.vaultAddress) : '?to=' + encodeURIComponent(shown.vaultAddress))
    : '';

  return (
    <AppShell screen="id" tab="settings" noTabs>
      <BackNav href={'/settings'} title="Cubby ID" />
      <main className="body">
        {demo && (
          <div className="demo-banner">Demo profile. This is a real test network proof, published to a local test relay, not a public relay, and not tied to this phone.</div>
        )}

        <div className="id-hero">
          {shown ? <VerifiedBadge /> : <span className="logo txt" style={{ width: '4rem', height: '4rem' }}><BadgeCheck size={28} aria-hidden /></span>}
          <h1 style={{ font: '700 1.7rem/1.15 var(--display)', letterSpacing: '-.03em' }}>{shown ? 'Verified Cubby ID' : 'Cubby ID'}</h1>
          {shown && <p className="npub">{shown.npub}</p>}
          {shown && (
            <button className="btn text" type="button" onClick={() => void copy(shown.npub, 'Profile copied')} style={{ width: 'auto' }}>Copy profile</button>
          )}
        </div>

        {shown && (
          <section className="group card">
            <div className="cell"><span>Box</span><span className="cv">{shortAddr(shown.vaultAddress, 6, 4)}</span></div>
            <div className="cell"><span>Proof on chain</span><a className="cv link" href={explorerUrl('chipnet', shown.anchor)} target="_blank" rel="noreferrer">{shown.anchor.slice(0, 10)}…{shown.anchor.slice(-6)}</a></div>
            <div className="cell"><span>Pay by identity</span><a className="cv link" href={explorerUrl('chipnet', shown.pay)} target="_blank" rel="noreferrer">{shown.pay.slice(0, 10)}…{shown.pay.slice(-6)}</a></div>
            <div className="cell"><span>Status</span><span className="cv">Verified</span></div>
          </section>
        )}

        {shown && <Link className="btn big" href={sendHref}>Pay this profile</Link>}

        <div className="ghead"><b>Find someone</b></div>
        <div className="field">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Paste an npub or a box address" autoComplete="off" autoCapitalize="off" spellCheck={false} />
        </div>
        <button className="btn ghost big" type="button" onClick={onFind}>Search</button>
        {err && <p className="errline" role="alert">{err}</p>}
        {found === 'none' && !err && <p className="hint" style={{ textAlign: 'left' }}>No verified profile found.</p>}

        <div className="ghead"><b>Link your Nostr profile</b></div>
        <p className="hint" style={{ textAlign: 'left' }}>
          Linking signs a statement with your phone lock, then publishes it. Publishing to a public relay has not been turned on yet. The chipnet proof used a local test relay.
        </p>
        <button className="btn ghost big" type="button" disabled>Link is not on this demo yet</button>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><IdInner /></Gate>; }
