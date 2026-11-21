'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDemoSuffix } from '@/ui/kit';

export default function Page() {
  const router = useRouter();
  const suffix = useDemoSuffix();
  useEffect(() => { router.replace('/send' + suffix); }, [router, suffix]);
  return null;
}
