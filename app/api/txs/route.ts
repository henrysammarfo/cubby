import { NextRequest, NextResponse } from 'next/server';
import { getNetwork } from '@/src/network';
import { getHistoryEntries } from '@/lib/server/electrum';
import { describeAddressTransactions } from '@/src/chain';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim() ?? '';
  const networkId = req.nextUrl.searchParams.get('network') ?? 'chipnet';
  if (!address) return NextResponse.json({ error: 'address is required' }, { status: 400 });
  const network = getNetwork(networkId);
  try {
    const entries = await getHistoryEntries(networkId, address);
    const txs = await describeAddressTransactions(network, address, entries);
    return NextResponse.json({
      txs: txs.map((tx) => ({
        ...tx,
        satoshis: String(tx.satoshis),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
