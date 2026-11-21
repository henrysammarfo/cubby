import { getNetwork } from '../src/network.js';
import { getHistoryEntries } from './_electrum.js';
import { describeAddressTransactions } from '../src/chain.js';

export default async function handler(
  req: { method?: string; query: Record<string, string | string[] | undefined> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (b: unknown) => unknown; end: () => unknown };
  },
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const raw = req.query.address;
  const address = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  const networkId = String(req.query.network ?? 'chipnet');
  if (!address) return res.status(400).json({ error: 'address is required' });
  const network = getNetwork(networkId);
  try {
    const entries = await getHistoryEntries(networkId, address);
    const txs = await describeAddressTransactions(network, address, entries);
    return res.status(200).json({ txs });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
