import { NextResponse } from 'next/server';

export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } },
    );
    if (!res.ok) return NextResponse.json({ usd: null, source: null });
    const body = (await res.json()) as { 'bitcoin-cash'?: { usd?: number; usd_24h_change?: number } };
    const usd = body['bitcoin-cash']?.usd;
    const change = body['bitcoin-cash']?.usd_24h_change;
    if (typeof usd !== 'number' || !Number.isFinite(usd)) return NextResponse.json({ usd: null, source: null });
    return NextResponse.json({
      usd,
      change24h: typeof change === 'number' && Number.isFinite(change) ? change : null,
      source: 'CoinGecko',
      id: 'bitcoin-cash',
    });
  } catch {
    return NextResponse.json({ usd: null, source: null });
  }
}
