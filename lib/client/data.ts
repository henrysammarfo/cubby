'use client';
import { useEffect, useState } from 'react';
import { DEMO_ADDRESS, demoReplayTxs, type DemoReplay } from '@/lib/demo';

export type ActivityKind = 'in' | 'out' | 'both';

export type ChainTx = {
  txid: string;
  kind: ActivityKind;
  satoshis: bigint;
  time?: number;
  confirmations?: number;
  feeSats?: bigint;
  counterparty?: string;
};

export type PriceQuote = { usd: number; source: string; change24h: number | null } | null;

const toBig = (v: unknown): bigint => {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.round(v));
  if (typeof v === 'string' && v) return BigInt(v);
  return 0n;
};

export function useBalances(address: string | null, networkId: string) {
  const demoKnown = address === DEMO_ADDRESS;
  const [sats, setSats] = useState<bigint | null>(demoKnown ? 0n : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!address) { setSats(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/utxos?address=${encodeURIComponent(address)}&network=${networkId}`);
        const body = await res.json() as { utxos?: { satoshis: string }[]; error?: string };
        if (!res.ok) throw new Error(body.error || 'Could not read the balance.');
        const total = (body.utxos ?? []).reduce((s, u) => s + toBig(u.satoshis), 0n);
        if (!cancelled) { setSats(total); setError(null); }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          if (demoKnown) setSats(0n);
        }
      }
    };
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, [address, networkId, demoKnown]);
  return { sats, error };
}

export function useActivity(address: string | null, networkId: string, demo: boolean, replay: DemoReplay = 'funded') {
  const [txs, setTxs] = useState<ChainTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!address) { setTxs(null); return; }
    let cancelled = false;
    if (demo) {
      setTxs(demoReplayTxs(replay));
      setError(null);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`/api/txs?address=${encodeURIComponent(address)}&network=${networkId}`);
        const body = await res.json() as { txs?: Array<Record<string, unknown>>; error?: string };
        if (!res.ok) throw new Error(body.error || 'Could not read payments.');
        const rows: ChainTx[] = (body.txs ?? []).map((t) => {
          const kind: ActivityKind = (t.kind === 'out' || t.direction === 'out' || t.type === 'sent') ? 'out'
            : (t.kind === 'both' || t.direction === 'both') ? 'both' : 'in';
          return {
          txid: String(t.txid ?? t.hash ?? ''),
          kind,
          satoshis: toBig(t.satoshis ?? t.value ?? t.amount),
          time: typeof t.time === 'number' ? t.time : typeof t.blocktime === 'number' ? t.blocktime : undefined,
          confirmations: typeof t.confirmations === 'number' ? t.confirmations : undefined,
          feeSats: t.feeSats !== undefined ? toBig(t.feeSats) : undefined,
          counterparty: typeof t.counterparty === 'string' ? t.counterparty : undefined,
        };}).filter((t) => t.txid);
        if (rows.length === 0 && address === DEMO_ADDRESS) {
          if (!cancelled) { setTxs(demoReplayTxs('spent')); setError(null); }
          return;
        }
        if (!cancelled) { setTxs(rows); setError(null); }
      } catch (e) {
        if (address === DEMO_ADDRESS) {
          if (!cancelled) { setTxs(demoReplayTxs('spent')); setError(null); }
          return;
        }
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [address, networkId, demo, replay]);
  return { txs, error };
}

export function usePrice() {
  const [price, setPrice] = useState<PriceQuote>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/price')
      .then((r) => r.json())
      .then((b: { usd?: number | null; source?: string | null; change24h?: number | null }) => {
        if (cancelled) return;
        if (typeof b.usd === 'number' && b.source) setPrice({ usd: b.usd, source: b.source, change24h: typeof b.change24h === 'number' ? b.change24h : null });
        else setPrice(null);
      })
      .catch(() => { if (!cancelled) setPrice(null); });
    return () => { cancelled = true; };
  }, []);
  return price;
}
