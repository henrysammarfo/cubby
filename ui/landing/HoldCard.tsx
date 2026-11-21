'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Lock, ScanFace } from 'lucide-react';
import { DEMO_DEPOSIT_SATS } from '@/lib/demo';

const DEMO_BCH = (Number(DEMO_DEPOSIT_SATS) / 1e8).toFixed(8);

const STEPS = ['Face ID approves on this phone', 'The Bitcoin Cash network checks it', 'Your Cubby opens'];
const HOLD_MS = 900;

/** Landing preview of the real unlock flow. Nothing is signed or spent here. */
export function HoldCard() {
  const [p, setP] = useState(0);
  const [step, setStep] = useState(-1);
  const raf = useRef<number | null>(null);
  const start = useRef(0);
  const open = step >= STEPS.length - 1;

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  useEffect(() => {
    if (step < 0 || open) return;
    const t = setTimeout(() => setStep(s => s + 1), 520);
    return () => clearTimeout(t);
  }, [step, open]);

  const tick = () => {
    const v = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setP(v);
    if (v >= 1) { raf.current = null; setStep(0); return; }
    raf.current = requestAnimationFrame(tick);
  };
  const down = () => { if (step >= 0) return; start.current = performance.now(); raf.current = requestAnimationFrame(tick); };
  const up = () => { if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; } if (step < 0) setP(0); };
  const key = (e: React.KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && step < 0) { e.preventDefault(); setP(1); setStep(0); } };

  return (
    <div className={'hc' + (open ? ' is-open' : '')}>
      <div className="hc-top">
        <span className="hc-av">{open ? <Check size={18} strokeWidth={3} /> : <Lock size={16} />}</span>
        <span className="hc-who"><b>My Cubby</b><small>{open ? 'Open. Only you could do that.' : 'Locked. Only your face opens it.'}</small></span>
      </div>
      <div className="hc-bal" aria-live="polite">{open ? <>{DEMO_BCH} <small>BCH</small></> : <><span className="hc-dots">••••••</span> <small>BCH</small></>}</div>
      <ol className="hc-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i <= step ? 'on' : ''}><span className="hc-dot">{i <= step ? <Check size={11} strokeWidth={3.5} /> : null}</span>{s}</li>
        ))}
      </ol>
      {open ? (
        <Link className="hc-btn hc-go" href="/wallet?demo=1">See inside<ArrowRight size={18} aria-hidden /></Link>
      ) : (
        <button
          type="button"
          className="hc-btn"
          onPointerDown={down}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
          onKeyDown={key}
          onContextMenu={e => e.preventDefault()}
          aria-label="Hold to open. A preview, nothing is spent."
        >
          <span className="hc-fill" style={{ transform: `scaleX(${p})` }} aria-hidden />
          <span className="hc-lab"><ScanFace size={18} aria-hidden />Hold to open</span>
        </button>
      )}
      <p className="hc-foot">A preview of the real test network box. Nothing is signed or spent.</p>
    </div>
  );
}
