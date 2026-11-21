import { utxosFromWatchtower } from '../src/chain.js';
import { getNetwork } from '../src/network.js';
import { listUnspent } from './_electrum.js';

export default async function handler(
  req: { method?: string; query: Record<string, string | string[] | undefined> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (b: unknown) => unknown; end: () => unknown };
  },
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const address = String(req.query.address ?? '');
  const networkId = String(req.query.network ?? 'chipnet');
  if (!address) return res.status(400).json({ error: 'address is required' });
  const network = getNetwork(networkId);
  try {
    const utxos = await utxosFromWatchtower(network, address);
    return res.status(200).json({
      source: 'watchtower',
      utxos: utxos.map((u) => ({ txid: u.txid, vout: u.vout, satoshis: String(u.satoshis) })),
    });
  } catch (watchtowerError) {
    try {
      const utxos = await listUnspent(network.id, address);
      return res.status(200).json({ source: 'electrum', utxos });
    } catch (electrumError) {
      const first = watchtowerError instanceof Error ? watchtowerError.message : String(watchtowerError);
      const second = electrumError instanceof Error ? electrumError.message : String(electrumError);
      return res.status(503).json({ error: `Watchtower: ${first}. Electrum: ${second}` });
    }
  }
}
