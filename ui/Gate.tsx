'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/client/session';

const OPEN = new Set(['/', '/welcome', '/how-it-works', '/terms', '/privacy', '/film', '/deck', '/recover']);

export function Gate({ children }: { children: React.ReactNode }) {
  const s = useSession();
  const path = usePathname();
  const router = useRouter();
  const q = useSearchParams();
  const demo = q.get('demo') === '1' || q.get('shot') === '1';
  const suffix = demo ? '?demo=1' : '';

  useEffect(() => {
    if (OPEN.has(path)) return;
    if (demo) return;
    if (!s.vault) { router.replace('/welcome'); return; }
    if (!s.unlocked) { router.replace('/welcome'); return; }
  }, [demo, path, router, s.unlocked, s.vault]);

  if (!OPEN.has(path) && !demo && (!s.vault || !s.unlocked)) return null;
  return <>{children}</>;
}

