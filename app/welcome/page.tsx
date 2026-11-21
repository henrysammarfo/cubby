'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fingerprint } from 'lucide-react';
import { AppShell } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { VerifiedBadge } from '@/ui/Badge';
import { useSession } from '@/lib/client/session';
import { createDeviceLock, explainWebAuthnError, requestAssertion } from '@/web/passkey';

const SLIDES = [
  { cls: 's1', line1: 'Your face is', line2: 'the key', art: '/mascot/cubby-hero-1280.jpg' },
  { cls: 's2', line1: 'No secret words', line2: 'to lose', art: '/mascot/cubby-hero-1280.jpg' },
  { cls: 's3', line1: 'Works with Paytaca,', line2: 'Selene and Cashonize', art: '/mascot/cubby-hero-1280.jpg' },
] as const;

type Step = 'splash' | 'slides' | 'hello' | 'face' | 'ready';

function WelcomeInner() {
  const s = useSession();
  const router = useRouter();
  const q = useSearchParams();
  const demo = q.get('demo') === '1' || q.get('shot') === '1';
  const shotStep = q.get('step') as Step | null;
  const existing = !!s.vault;
  const [step, setStep] = useState<Step>(shotStep || (existing ? 'hello' : 'splash'));
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (shotStep) { setStep(shotStep); return; }
    if (existing) { setStep('hello'); return; }
    if (step !== 'splash') return;
    const t = setTimeout(() => setStep('slides'), 1100);
    return () => clearTimeout(t);
  }, [existing, shotStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const goWallet = () => router.push(demo ? '/wallet?demo=1' : '/wallet');

  const onCreate = async () => {
    setErr(null); setBusy(true);
    try {
      await createDeviceLock(s.network);
      s.refreshVault();
      s.setUnlocked(true);
      setStep('ready');
    } catch (e) {
      setErr(explainWebAuthnError(e, 'create'));
    } finally { setBusy(false); }
  };

  const onUnlock = async () => {
    if (!s.vault) return;
    setErr(null); setBusy(true);
    try {
      await requestAssertion(s.vault, crypto.getRandomValues(new Uint8Array(32)));
      s.setUnlocked(true);
      goWallet();
    } catch (e) {
      setErr(explainWebAuthnError(e, 'approve'));
    } finally { setBusy(false); }
  };

  if (step === 'splash' && !existing) {
    return (
      <AppShell screen="welcome" tab="wallet" noTabs>
        <div className="splash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/cubby-mono.svg" alt="" width={72} height={72} style={{ filter: 'invert(1)' }} />
          <b>Cubby</b>
        </div>
      </AppShell>
    );
  }

  if (step === 'slides' && !existing) {
    const cur = SLIDES[slide]!;
    return (
      <AppShell screen="welcome" tab="wallet" noTabs>
        <main className="body noTabs" style={{ paddingTop: 'calc(var(--sat) + 1rem)' }}>
          <div className="ob">
            <button type="button" className={'ob-art ' + cur.cls} onClick={() => setSlide((slide + 1) % SLIDES.length)} aria-label="Next slide">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cur.art} alt="" />
            </button>
            <div className="dots" role="tablist" aria-label="Slides">
              {SLIDES.map((_, i) => (
                <button key={i} type="button" onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`}><i className={i === slide ? 'on' : ''} /></button>
              ))}
            </div>
            <h1>{cur.line1}<br />{cur.line2}</h1>
            <div className="welcome dock" style={{ marginTop: '0' }}>
              <button className="btn big" type="button" onClick={() => setStep('hello')}>Create your box</button>
              {demo && <button className="btn text" type="button" onClick={goWallet}>Preview a demo box</button>}
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  if (step === 'face') {
    return (
      <AppShell screen="welcome" tab="wallet" noTabs>
        <main className="body welcome">
          <div className="face-frame">
            <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/cubby.svg" alt="" width={72} height={72} />
          </div>
          <h1>Fast and secure access</h1>
          <p className="lede">Use your face or fingerprint. There is no secret phrase to write down or lose.</p>
          {err && <p className="errline" role="alert">{err}</p>}
          <div className="dock">
            <button className="btn big" disabled={busy} onClick={() => void onCreate()}><Fingerprint size={18} aria-hidden /> Set up now</button>
            <button className="btn text" type="button" onClick={() => setStep('hello')}>Maybe later</button>
          </div>
        </main>
      </AppShell>
    );
  }

  if (step === 'ready') {
    return (
      <AppShell screen="welcome" tab="wallet" noTabs>
        <main className="body welcome">
          <VerifiedBadge />
          <h1>Your box is ready</h1>
          <p className="lede">Only this device can open it, with your face or fingerprint.</p>
          <div className="dock">
            <button className="btn big" type="button" onClick={goWallet}>Open your box</button>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell screen="welcome" tab="wallet" noTabs>
      <main className="body welcome">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-logo" src="/logo/cubby.svg" alt="" />
        <h1>{existing ? 'Welcome back' : 'Welcome to Cubby'}</h1>
        <p className="lede">
          {existing
            ? 'Open your box with your face or fingerprint.'
            : 'Create a box on this website with your face or fingerprint. No secret words to write down.'}
        </p>
        {err && <p className="errline" role="alert">{err}</p>}
        <div className="dock">
          {existing ? (
            <button className="btn big" disabled={busy} onClick={() => void onUnlock()}>
              <Fingerprint size={18} aria-hidden /> Open this box
            </button>
          ) : (
            <button className="btn big" type="button" onClick={() => setStep('face')}>
              <Fingerprint size={18} aria-hidden /> Use my face or fingerprint
            </button>
          )}
          {demo && <button className="btn text" type="button" onClick={goWallet}>Preview a demo box</button>}
        </div>
      </main>
    </AppShell>
  );
}

export default function Page() {
  return <Gate><WelcomeInner /></Gate>;
}
