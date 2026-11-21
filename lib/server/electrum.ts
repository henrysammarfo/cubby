import net from 'node:net';
import tls from 'node:tls';
import { sha256 } from '@bitauth/libauth';
import { addressToLocking } from '../../src/address.js';

export const SERVERS: Record<string, Array<{ host: string; port: number }>> = {
  chipnet: [
    { host: 'chipnet.imaginary.cash', port: 50004 },
    { host: 'chipnet.bch.ninja', port: 50004 },
  ],
  mainnet: [
    { host: 'bch.imaginary.cash', port: 50002 },
    { host: 'electrum.imaginary.cash', port: 50002 },
  ],
};

const scriptHash = (address: string): string => {
  const locking = addressToLocking(address);
  return Buffer.from(sha256.hash(locking)).reverse().toString('hex');
};

const request = async (host: string, port: number, method: string, params: unknown[]): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, timeout: 8000 }, () => {
      const id = 1;
      socket.write(JSON.stringify({ id, method, params }) + '\n');
    });
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      const line = buf.split('\n')[0];
      if (line === undefined || !buf.includes('\n')) return;
      socket.end();
      try {
        const parsed = JSON.parse(line) as { result?: unknown; error?: unknown };
        if (parsed.error) reject(new Error(JSON.stringify(parsed.error)));
        else resolve(parsed.result);
      } catch (error) {
        reject(error);
      }
    });
    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('electrum timeout'));
    });
  });

const withServers = async (network: string, method: string, params: unknown[]): Promise<unknown> => {
  const list = SERVERS[network] ?? SERVERS.chipnet ?? [];
  let last = 'no servers';
  for (const server of list) {
    try {
      return await request(server.host, server.port, method, params);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Electrum failed: ${last}`);
};

export const listUnspent = async (network: string, address: string) => {
  const result = (await withServers(network, 'blockchain.scripthash.listunspent', [scriptHash(address)])) as Array<{
    tx_hash: string;
    tx_pos: number;
    value: number;
  }>;
  return result.map((row) => ({ txid: row.tx_hash, vout: row.tx_pos, satoshis: String(row.value) }));
};

export const electrumBroadcast = async (network: string, hex: string): Promise<string> => {
  const result = await withServers(network, 'blockchain.transaction.broadcast', [hex]);
  if (typeof result !== 'string') throw new Error('Unexpected broadcast result');
  return result;
};

void net;

export const getHistories = async (network: string, addresses: string[]): Promise<Record<string, boolean>> => {
  const unique = [...new Set(addresses.filter(Boolean))];
  const out: Record<string, boolean> = {};
  if (unique.length === 0) return out;
  const list = SERVERS[network] ?? SERVERS.chipnet ?? [];
  let last = 'no servers';
  for (const server of list) {
    try {
      const result = await new Promise<Record<string, boolean>>((resolve, reject) => {
        const socket = tls.connect({ host: server.host, port: server.port, servername: server.host, timeout: 12000 }, () => {
          unique.forEach((address, i) => {
            socket.write(JSON.stringify({ id: i + 1, method: 'blockchain.scripthash.get_history', params: [scriptHash(address)] }) + '\n');
          });
        });
        let buf = '';
        const found: Record<string, boolean> = {};
        let remaining = unique.length;
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
          buf += chunk;
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
              if (parsed.error) {
                socket.end();
                reject(new Error(JSON.stringify(parsed.error)));
                return;
              }
              const idx = (parsed.id ?? 0) - 1;
              const address = unique[idx];
              if (address) found[address] = Array.isArray(parsed.result) && parsed.result.length > 0;
              remaining -= 1;
              if (remaining <= 0) {
                socket.end();
                resolve(found);
              }
            } catch (error) {
              socket.end();
              reject(error);
            }
          }
        });
        socket.on('error', reject);
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('electrum timeout'));
        });
      });
      return result;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Electrum history failed: ${last}`);
};

export interface HistoryEntry {
  readonly txid: string;
  readonly height: number;
}

export const getHistoryEntries = async (network: string, address: string): Promise<HistoryEntry[]> => {
  const result = (await withServers(network, 'blockchain.scripthash.get_history', [scriptHash(address)])) as Array<{
    tx_hash?: string;
    height?: number;
  }>;
  if (!Array.isArray(result)) return [];
  return result
    .filter((row) => typeof row.tx_hash === 'string' && /^[0-9a-f]{64}$/i.test(row.tx_hash))
    .map((row) => ({ txid: row.tx_hash!, height: Number(row.height ?? 0) }));
};
