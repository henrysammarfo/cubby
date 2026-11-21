import { NextRequest, NextResponse } from 'next/server';
import { getNetwork } from '@/src/network';
import { getHistories } from '@/api/_electrum';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const addresses = req.nextUrl.searchParams.getAll('address').flatMap((a) => a.split(',')).map((a) => a.trim()).filter(Boolean);
  const networkId = req.nextUrl.searchParams.get('network') ?? 'chipnet';
  if (addresses.length === 0) return NextResponse.json({ error: 'address is required' }, { status: 400 });
  getNetwork(networkId);
  try {
    const history = await getHistories(networkId, addresses);
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
