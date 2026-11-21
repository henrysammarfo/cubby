'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, History, Lock, Settings, Wallet } from 'lucide-react';
import { fmtBch } from '@/lib/client/format';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/cubby.svg" alt="" width={22} height={22} />
      <span>Cubby</span>
    </Link>
  );
}

export function Money({ sats, unit = 'BCH' }: { sats: bigint; unit?: string }) {
  const [w, c] = fmtBch(sats, 8).split('.');
  return (
    <span className="mny">
      <span className="w">{w}</span>
      {c != null && <span className="cents">.{c}</span>}
      {unit && <span className="cur"> {unit}</span>}
    </span>
  );
}

const TABS = [
  ['wallet', '/wallet', Wallet, 'Home'],
  ['activity', '/activity', History, 'Activity'],
  ['settings', '/settings', Settings, 'Settings'],
] as const;
export type TabKey = (typeof TABS)[number][0];

const qkeep = (q: URLSearchParams) => {
  const demo = q.get('demo') === '1' || q.get('shot') === '1';
  return demo ? '?demo=1' : '';
};

export function Tabbar({ on }: { on: TabKey }) {
  const q = useSearchParams();
  const suffix = qkeep(q);
  return (
    <nav className="tabbar" aria-label="Tabs">
      {TABS.map(([k, href, Icon, label]) => (
        <Link key={k} className={'tab' + (k === on ? ' on' : '')} href={href + suffix} aria-current={k === on ? 'page' : undefined}>
          <span className="ti"><Icon size={24} strokeWidth={k === on ? 2.2 : 1.8} aria-hidden /></span>
          <span className="tl">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Side({ on }: { on: TabKey }) {
  const q = useSearchParams();
  const suffix = qkeep(q);
  return (
    <nav className="side" aria-label="Main">
      <Brand href={'/wallet' + suffix} />
      <Link href={'/wallet' + suffix} className={on === 'wallet' ? 'on' : ''}><Wallet size={20} aria-hidden />Home</Link>
      <Link href={'/activity' + suffix} className={on === 'activity' ? 'on' : ''}><History size={20} aria-hidden />Activity</Link>
      <Link href={'/settings' + suffix} className={on === 'settings' ? 'on' : ''} style={{ marginTop: 'auto' }}><Settings size={20} aria-hidden />Settings</Link>
    </nav>
  );
}

export function AppShell({ screen, tab, noTabs, children, overlay }: { screen: string; tab: TabKey; noTabs?: boolean; children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className={`app s-${screen}${noTabs ? ' noTabs' : ''}`}>
      <Side on={tab} />
      <div className="main">
        {children}
        {!noTabs && <Tabbar on={tab} />}
      </div>
      {overlay}
      <ToastHost />
    </div>
  );
}

export function BackNav({ href, title, right }: { href: string; title: ReactNode; right?: ReactNode }) {
  const router = useRouter();
  const q = useSearchParams();
  const suffix = qkeep(q);
  return (
    <header className="nav">
      <button className="nb back" aria-label="Back" onClick={() => (history.length > 1 ? router.back() : router.push(href + suffix))}><ChevronLeft size={26} strokeWidth={2} aria-hidden /></button>
      <div className="nt">{title}</div>
      {right ?? <span className="nb" style={{ visibility: 'hidden' }} />}
    </header>
  );
}

type T = { id: number; html: ReactNode; err?: boolean };
let pushToast: (t: Omit<T, 'id'>, ms?: number) => void = () => {};
export const toast = (html: ReactNode, ms = 2600) => pushToast({ html }, ms);
export const toastErr = (e: unknown, ms = 4200) => pushToast({ html: e instanceof Error ? e.message : String(e), err: true }, ms);
function ToastHost() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    pushToast = (x, ms = 2600) => { clearTimeout(timer); setT({ ...x, id: Date.now() }); timer = setTimeout(() => setT(null), ms); };
    return () => clearTimeout(timer);
  }, []);
  if (!t) return null;
  return <div key={t.id} className={'toast in' + (t.err ? ' err' : '')} role="status">{t.html}</div>;
}

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
        {children}
      </div>
    </>
  );
}

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t, sy = (t: number) => ((ay * t + by) * t + cy) * t, dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => { let t = x; for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-5) break; const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; } return sy(Math.min(1, Math.max(0, t))); };
}
const easeOut = bezier(0.23, 1, 0.32, 1);

export function HoldButton({ label, doneLabel = 'Sent', hint = 'Keep holding to send', onDone, disabled, resetKey }: { label: string; doneLabel?: string; hint?: string; onDone: () => void; disabled?: boolean; resetKey?: unknown }) {
  const btn = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const hintEl = useRef<HTMLDivElement>(null);
  const st = useRef({ p: 0, mode: 'idle' as 'idle' | 'hold' | 'release' | 'done', last: 0, relFrom: 0, relStart: 0, raf: 0, hintT: 0 as unknown as ReturnType<typeof setTimeout> });
  const cb = useRef(onDone);
  cb.current = onDone;
  const draw = () => { if (fill.current) fill.current.style.clipPath = `inset(0 ${(100 - st.current.p * 100).toFixed(2)}% 0 0 round 999px)`; };
  const reset = useCallback(() => { const s = st.current; cancelAnimationFrame(s.raf); s.mode = 'idle'; s.p = 0; btn.current?.classList.remove('complete', 'pop', 'is-down'); draw(); }, []);
  useEffect(() => { reset(); }, [resetKey, reset]);
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);
  const loop = (t: number) => {
    const s = st.current;
    if (s.mode === 'hold') {
      s.p = Math.min(1, s.p + (t - s.last) / 1200); s.last = t; draw();
      if (s.p >= 1) return done();
      s.raf = requestAnimationFrame(loop);
    } else if (s.mode === 'release') {
      const k = Math.min(1, (t - s.relStart) / 200);
      s.p = s.relFrom * (1 - easeOut(k)); draw();
      if (k < 1) s.raf = requestAnimationFrame(loop); else { s.mode = 'idle'; s.p = 0; draw(); }
    }
  };
  const start = (e?: React.PointerEvent | React.KeyboardEvent) => {
    const s = st.current;
    if (s.mode === 'done' || disabled) return;
    if (e && 'button' in e && e.button > 0) return;
    if (e && 'pointerId' in e) { e.preventDefault(); btn.current?.setPointerCapture?.(e.pointerId); }
    cancelAnimationFrame(s.raf); s.mode = 'hold'; s.last = performance.now();
    btn.current?.classList.add('is-down'); hintEl.current?.classList.remove('show');
    s.raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    const s = st.current;
    if (s.mode !== 'hold') return;
    btn.current?.classList.remove('is-down');
    s.mode = 'release'; s.relFrom = s.p; s.relStart = performance.now();
    cancelAnimationFrame(s.raf); s.raf = requestAnimationFrame(loop);
    if (hintEl.current) { hintEl.current.classList.add('show'); clearTimeout(s.hintT); s.hintT = setTimeout(() => hintEl.current?.classList.remove('show'), 1600); }
  };
  const done = () => {
    const s = st.current;
    s.mode = 'done';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.current?.classList.remove('is-down'); btn.current?.classList.add('complete'); if (!reduce) btn.current?.classList.add('pop');
    try { navigator.vibrate?.(12); } catch {}
    hintEl.current?.classList.remove('show');
    setTimeout(() => cb.current(), reduce ? 150 : 520);
  };
  const lab = (
    <>
      <span className="lab lm"><Lock size={18} aria-hidden /><span>{label}</span></span>
      <span className="lab done"><Check size={20} strokeWidth={2.5} aria-hidden /><span>{doneLabel}</span></span>
    </>
  );
  return (
    <>
      <button ref={btn} className="hold" aria-label={label} disabled={disabled} data-testid="hold"
        onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(e); } }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }}>
        {lab}
        <span className="fill" ref={fill} aria-hidden="true">{lab}</span>
      </button>
      <div className="hint" ref={hintEl} role="status">{hint}</div>
    </>
  );
}

export const copy = async (text: string, ok = 'Copied') => {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { toastErr('Could not copy. Select the text and copy it yourself.'); }
};

export const suffix = (search: string) => {
  const q = new URLSearchParams(search);
  return q.get('demo') === '1' || q.get('shot') === '1' ? '?demo=1' : '';
};

export const useDemoSuffix = () => {
  const q = useSearchParams();
  return qkeep(q);
};
