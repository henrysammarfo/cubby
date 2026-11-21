/** Hold-to-confirm: 1.2s linear fill, 0.2s snap-back, reduced motion is a click. */

const HOLD_MS = 1200;
const SNAP_MS = 200;

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const attachHold = (
  button: HTMLButtonElement,
  options?: { hint?: HTMLElement | null; label?: string },
): { reset: () => void; wait: () => Promise<boolean> } => {
  const fill = button.querySelector('.fill') as HTMLElement | null;
  const hint = options?.hint ?? null;
  let raf = 0;
  let start = 0;
  let progress = 0;
  let waiting: ((ok: boolean) => void) | undefined;

  const setFill = (p: number): void => {
    progress = p;
    if (fill) fill.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0 round 999px)`;
  };

  const showHint = (on: boolean): void => {
    hint?.classList.toggle('show', on);
  };

  const stop = (complete: boolean): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    button.classList.toggle('complete', complete);
    if (!complete) {
      const from = progress;
      const t0 = performance.now();
      const snap = (now: number): void => {
        const t = Math.min(1, (now - t0) / SNAP_MS);
        setFill(from * (1 - t));
        if (t < 1) {
          raf = requestAnimationFrame(snap);
        } else {
          setFill(0);
          showHint(true);
        }
      };
      if (reduced()) {
        setFill(0);
        showHint(false);
      } else {
        raf = requestAnimationFrame(snap);
      }
    }
  };

  const tick = (now: number): void => {
    const p = Math.min(1, (now - start) / HOLD_MS);
    setFill(p);
    showHint(false);
    if (p >= 1) {
      stop(true);
      waiting?.(true);
      waiting = undefined;
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const onDown = (event: Event): void => {
    if (button.disabled) return;
    event.preventDefault();
    if (reduced()) {
      setFill(1);
      button.classList.add('complete');
      waiting?.(true);
      waiting = undefined;
      return;
    }
    if (raf) cancelAnimationFrame(raf);
    button.classList.remove('complete');
    start = performance.now();
    showHint(false);
    raf = requestAnimationFrame(tick);
  };

  const onUp = (): void => {
    if (progress >= 1 || reduced()) return;
    if (waiting) {
      /* still holding for a wait() promise */
    }
    stop(false);
  };

  button.addEventListener('pointerdown', onDown);
  button.addEventListener('pointerup', onUp);
  button.addEventListener('pointerleave', onUp);
  button.addEventListener('pointercancel', onUp);
  button.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.key === 'Enter') onDown(event);
  });
  button.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.key === 'Enter') onUp();
  });

  return {
    reset: () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      button.classList.remove('complete');
      setFill(0);
      showHint(false);
      waiting?.(false);
      waiting = undefined;
    },
    wait: () =>
      new Promise((resolve) => {
        waiting = resolve;
      }),
  };
};
