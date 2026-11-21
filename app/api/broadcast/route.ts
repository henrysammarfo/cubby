import { NextRequest, NextResponse } from 'next/server';
import { getNetwork } from '@/src/network';
import { electrumBroadcast } from '@/lib/server/electrum';
import {
  allowBroadcastRequest,
  clientAddress,
  findRecentBroadcast,
  isAllowedBroadcastOrigin,
  isBroadcastBodyTooLarge,
  rememberBroadcast,
  validateBroadcastHex,
} from '@/lib/server/broadcast-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isBroadcastBodyTooLarge(req.headers.get('content-length'))) {
    return NextResponse.json({ error: 'That transaction is too large to broadcast.' }, { status: 413 });
  }
  const origin = req.headers.get('origin');
  if (!isAllowedBroadcastOrigin(origin)) {
    return NextResponse.json({ error: 'Broadcasts are only accepted from the Cubby site.' }, { status: 403 });
  }
  const ip = clientAddress(req.headers);
  if (!allowBroadcastRequest(ip)) {
    return NextResponse.json({ error: 'Too many broadcast requests. Wait a moment and try once.' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { network?: unknown; hex?: unknown; transaction?: unknown } | null;
  const networkId = typeof body?.network === 'string' ? body.network : 'chipnet';
  const checked = validateBroadcastHex(typeof body?.hex === 'string' ? body.hex : body?.transaction);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: checked.status });
  }
  const network = getNetwork(networkId);
  if (!network.allowBroadcast) {
    return NextResponse.json({ error: 'Broadcasting on the main network is off until it is approved.' }, { status: 403 });
  }
  const already = findRecentBroadcast(checked.hex);
  if (already) {
    return NextResponse.json({ source: 'cache', txid: already });
  }
  try {
    const txid = await electrumBroadcast(network.id, checked.hex);
    rememberBroadcast(checked.hex, txid);
    return NextResponse.json({ source: 'electrum', txid });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Electrum: ${message}` }, { status: 503 });
  }
}
