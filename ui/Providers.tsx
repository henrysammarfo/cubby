'use client';
import { Suspense } from 'react';
import { SessionProvider } from '@/lib/client/session';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionProvider>{children}</SessionProvider>
    </Suspense>
  );
}
