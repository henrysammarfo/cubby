import { NextResponse } from 'next/server';

export const revalidate = 300;

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin-cash/market_chart?vs_currency=usd&days=7',
      { headers: { Accept: 'application/json' }, next: { revalidate: 300 } },
    );
    if (!res.ok) return NextResponse.json({ points: null, source: null });
    const body = (await res.json()) as { prices?: [number, number][] };
    const prices = body.prices;
    if (!Array.isArray(prices) || prices.length < 4) return NextResponse.json({ points: null, source: null });
    const points = prices.map(([t, p]) => ({ t, p }));
    return NextResponse.json({ points, source: 'CoinGecko', id: 'bitcoin-cash' });
  } catch {
    return NextResponse.json({ points: null, source: null });
  }
}
