import { getNetwork } from '../src/network.js';
import { getHistories } from './_electrum.js';

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
  const addresses = (Array.isArray(raw) ? raw : raw ? raw.split(',') : []).map((a) => a.trim()).filter(Boolean);
  const networkId = String(req.query.network ?? 'chipnet');
  if (addresses.length === 0) return res.status(400).json({ error: 'address is required' });
  getNetwork(networkId);
  try {
    const history = await getHistories(networkId, addresses);
    return res.status(200).json({ history });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
