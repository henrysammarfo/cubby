import { defineConfig, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { getNetwork } from '../src/network.ts';
import { utxosFromWatchtower } from '../src/chain.ts';
import { getHistories, getHistoryEntries } from '../lib/server/electrum.ts';
import { describeAddressTransactions } from '../src/chain.ts';

const apiPlugin = () => ({
  name: 'cubby-api',
  configureServer(server: ViteDevServer) {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url ?? '';
      const parsed = new URL(url, 'http://localhost');

      if (parsed.pathname === '/api/txs') {
        const address = (parsed.searchParams.get('address') ?? '').trim();
        const networkId = parsed.searchParams.get('network') ?? 'chipnet';
        const network = getNetwork(networkId);
        res.setHeader('Content-Type', 'application/json');
        if (!address) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'address is required' }));
          return;
        }
        try {
          const entries = await getHistoryEntries(networkId, address);
          const txs = await describeAddressTransactions(network, address, entries);
          res.end(JSON.stringify({ txs: txs.map((tx) => ({ ...tx, satoshis: String(tx.satoshis) })) }));
        } catch (error) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
        return;
      }
      if (parsed.pathname === '/api/history') {
        const addresses = parsed.searchParams.getAll('address').flatMap((a) => a.split(',')).map((a) => a.trim()).filter(Boolean);
        const networkId = parsed.searchParams.get('network') ?? 'chipnet';
        getNetwork(networkId);
        res.setHeader('Content-Type', 'application/json');
        if (addresses.length === 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'address is required' }));
          return;
        }
        try {
          const history = await getHistories(networkId, addresses);
          res.end(JSON.stringify({ history }));
        } catch (error) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
        return;
      }
      if (!url.startsWith('/api/utxos')) return next();
      const address = parsed.searchParams.get('address') ?? '';
      const network = getNetwork(parsed.searchParams.get('network'));
      res.setHeader('Content-Type', 'application/json');
      if (!address) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'address is required' }));
        return;
      }
      try {
        const utxos = await utxosFromWatchtower(network, address);
        res.end(JSON.stringify({ source: 'watchtower', utxos: utxos.map((u) => ({ txid: u.txid, vout: u.vout, satoshis: String(u.satoshis) })) }));
      } catch (error) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });
  },
});

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', '@bitauth/libauth', '@wizardconnect/core', '@wizardconnect/dapp'],
  },
  plugins: [apiPlugin()],
  server: { port: 5173, host: true },
});
