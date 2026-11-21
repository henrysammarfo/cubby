import { NextRequest, NextResponse } from 'next/server';
import { getNetwork } from '@/src/network';
import { electrumBroadcast } from '@/lib/server/electrum';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { network?: unknown; hex?: unknown; transaction?: unknown } | null;
  const networkId = typeof body?.network === 'string' ? body.network : 'chipnet';
  const hex = (typeof body?.hex === 'string' ? body.hex : typeof body?.transaction === 'string' ? body.transaction : '').trim();
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 20) {
    return NextResponse.json({ error: 'A signed transaction is required.' }, { status: 400 });
  }
  const network = getNetwork(networkId);
  if (!network.allowBroadcast) {
    return NextResponse.json({ error: 'Broadcasting on the main network is off until it is approved.' }, { status: 403 });
  }
  try {
    const txid = await electrumBroadcast(network.id, hex);
    return NextResponse.json({ source: 'electrum', txid });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Electrum: ${message}` }, { status: 503 });
  }
}
