import { defineConfig, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { getNetwork } from '../src/network.ts';
import { utxosFromWatchtower } from '../src/chain.ts';

const apiPlugin = () => ({
  name: 'cubby-api',
  configureServer(server: ViteDevServer) {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url ?? '';
      if (!url.startsWith('/api/utxos')) return next();
      const parsed = new URL(url, 'http://localhost');
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
