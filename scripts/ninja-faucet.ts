/** Chipnet faucet at https://chipnet.bch.ninja/ (PoW, no account). Do not bypass rate limits. */
import { createHash } from 'node:crypto';

const BASE = 'https://chipnet.bch.ninja/api';

const api = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
  const init: RequestInit = body
    ? { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET', headers: { Accept: 'application/json' } };
  const response = await fetch(`${BASE}/${path}`, init);
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Ninja faucet ${path}: ${response.status} ${text.slice(0, 200)}`);
  }
  if (response.status === 429) throw new Error('Ninja faucet: too many requests. Wait and retry.');
  if (!response.ok) throw new Error(`Ninja faucet ${path}: ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
};

const solve = (payload: string, targetHex: string, expires: number): string => {
  const target = BigInt(`0x${targetHex}`);
  for (let nonce = 0n; ; nonce++) {
    if (Date.now() > expires) throw new Error('Ninja faucet challenge expired.');
    const digest = createHash('sha256').update(`${payload}:${nonce}`).digest('hex');
    if (BigInt(`0x${digest}`) <= target) return nonce.toString();
  }
};

export const claimNinja = async (address: string, sats: number): Promise<{ txid: string; fee?: string }> => {
  const challenge = await api('challenge', { address, sats: String(sats) });
  const payload = String(challenge.payload ?? '');
  const target = String(challenge.target ?? '');
  const signature = String(challenge.signature ?? '');
  const expires = Number(challenge.expires ?? Date.now() + 60_000);
  if (!payload || !target || !signature) throw new Error(`Ninja challenge missing fields: ${JSON.stringify(challenge).slice(0, 300)}`);
  const nonce = solve(payload, target, expires);
  const result = await api('claim', { payload, signature, nonce });
  const txid = String(result.txid ?? '');
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error(`Ninja claim had no txid: ${JSON.stringify(result).slice(0, 300)}`);
  return result.fee !== undefined ? { txid, fee: String(result.fee) } : { txid };
};
