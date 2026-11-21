'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DEFAULT_NETWORK, getNetwork, type Network, type NetworkId } from '@/src/network';
import { loadVault, type StoredVault } from '@/web/passkey';
import { DEMO_ADDRESS } from '@/lib/demo';

const NET_KEY = 'cubby-network';
const UNLOCK_KEY = 'cubby-unlocked';

export type Session = {
  vault: StoredVault | null;
  unlocked: boolean;
  demo: boolean;
  network: Network;
  networkId: NetworkId;
  address: string | null;
  setUnlocked: (v: boolean) => void;
  setNetworkId: (id: NetworkId) => void;
  refreshVault: () => void;
};

const Ctx = createContext<Session | null>(null);

const isDemoQuery = (q: URLSearchParams): boolean => q.get('demo') === '1' || q.get('shot') === '1';

export function SessionProvider({ children }: { children: ReactNode }) {
  const q = useSearchParams();
  const demoQ = isDemoQuery(q);
  const [vault, setVault] = useState<StoredVault | null>(null);
  const [unlocked, setUnlockedState] = useState(false);
  const [networkId, setNetworkState] = useState<NetworkId>(DEFAULT_NETWORK);
  const [ready, setReady] = useState(false);

  const refreshVault = useCallback(() => {
    setVault(loadVault());
  }, []);

  useEffect(() => {
    const storedNet = localStorage.getItem(NET_KEY);
    if (storedNet === 'mainnet' || storedNet === 'chipnet') setNetworkState(storedNet);
    refreshVault();
    if (demoQ) {
      setUnlockedState(true);
    } else if (sessionStorage.getItem(UNLOCK_KEY) === '1') {
      setUnlockedState(true);
    }
    setReady(true);
  }, [demoQ, refreshVault]);

  const setUnlocked = useCallback((v: boolean) => {
    setUnlockedState(v);
    if (v) sessionStorage.setItem(UNLOCK_KEY, '1');
    else sessionStorage.removeItem(UNLOCK_KEY);
  }, []);

  const setNetworkId = useCallback((id: NetworkId) => {
    setNetworkState(id);
    localStorage.setItem(NET_KEY, id);
  }, []);

  const network = getNetwork(networkId);
  const liveAddress = vault?.address ?? null;
  const demo = demoQ && (!liveAddress || demoQ);
  const address = liveAddress ?? (demoQ ? DEMO_ADDRESS : null);

  const value = useMemo<Session>(
    () => ({ vault, unlocked: unlocked || demoQ, demo: !!demoQ && !vault, network, networkId, address, setUnlocked, setNetworkId, refreshVault }),
    [vault, unlocked, demoQ, network, networkId, address, setUnlocked, setNetworkId, refreshVault],
  );

  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = (): Session => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
};

export const useOptionalSession = (): Session | null => useContext(Ctx);
