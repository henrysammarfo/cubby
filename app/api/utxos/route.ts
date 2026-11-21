import { NextRequest, NextResponse } from 'next/server';
import { utxosFromWatchtower } from '@/src/chain';
import { getNetwork } from '@/src/network';
import { listUnspent } from '@/api/_electrum';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim() ?? '';
  const networkId = req.nextUrl.searchParams.get('network') ?? 'chipnet';
  if (!address) return NextResponse.json({ error: 'address is required' }, { status: 400 });
  const network = getNetwork(networkId);
  try {
    const utxos = await utxosFromWatchtower(network, address);
    return NextResponse.json({
      source: 'watchtower',
      utxos: utxos.map((u) => ({ txid: u.txid, vout: u.vout, satoshis: String(u.satoshis) })),
    });
  } catch (watchtowerError) {
    try {
      const utxos = await listUnspent(network.id, address);
      return NextResponse.json({ source: 'electrum', utxos });
    } catch (electrumError) {
      const first = watchtowerError instanceof Error ? watchtowerError.message : String(watchtowerError);
      const second = electrumError instanceof Error ? electrumError.message : String(electrumError);
      return NextResponse.json({ error: `Watchtower: ${first}. Electrum: ${second}` }, { status: 503 });
    }
  }
}
