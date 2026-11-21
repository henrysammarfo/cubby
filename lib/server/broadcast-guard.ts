import { createHash } from 'node:crypto';

export const MIN_BROADCAST_HEX_CHARS = 20;
export const MAX_BROADCAST_HEX_CHARS = 30_000;
export const MAX_BROADCAST_BODY_BYTES = 64_000;
export const BROADCAST_RATE_LIMIT = 5;
export const BROADCAST_RATE_WINDOW_MS = 60_000;
export const BROADCAST_SEEN_TTL_MS = 10 * 60_000;

export const ALLOWED_BROADCAST_ORIGINS = [
  'https://cubby-liart-six.vercel.app',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
] as const;

export type BroadcastHexResult =
  | { ok: true; hex: string }
  | { ok: false; status: number; error: string };

const hexKey = (hex: string): string => createHash('sha256').update(hex.toLowerCase()).digest('hex');

export const validateBroadcastHex = (raw: unknown): BroadcastHexResult => {
  if (typeof raw !== 'string') {
    return { ok: false, status: 400, error: 'A signed transaction is required.' };
  }
  const hex = raw.trim();
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < MIN_BROADCAST_HEX_CHARS || hex.length % 2 !== 0) {
    return { ok: false, status: 400, error: 'A signed transaction is required.' };
  }
  if (hex.length > MAX_BROADCAST_HEX_CHARS) {
    return { ok: false, status: 413, error: 'That transaction is too large to broadcast.' };
  }
  return { ok: true, hex };
};

export const isAllowedBroadcastOrigin = (origin: string | null | undefined): boolean => {
  if (!origin) return true;
  return (ALLOWED_BROADCAST_ORIGINS as readonly string[]).includes(origin);
};

export const isBroadcastBodyTooLarge = (contentLength: string | null | undefined): boolean => {
  if (!contentLength) return false;
  const n = Number(contentLength);
  return Number.isFinite(n) && n > MAX_BROADCAST_BODY_BYTES;
};

const hits = new Map<string, number[]>();

export const resetBroadcastRateLimit = (): void => {
  hits.clear();
};

/** Returns true when the request is allowed. */
export const allowBroadcastRequest = (key: string, now = Date.now()): boolean => {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < BROADCAST_RATE_WINDOW_MS);
  if (recent.length >= BROADCAST_RATE_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
};

const seen = new Map<string, { txid: string; at: number }>();

export const resetBroadcastSeen = (): void => {
  seen.clear();
};

export const rememberBroadcast = (hex: string, txid: string, now = Date.now()): void => {
  seen.set(hexKey(hex), { txid, at: now });
};

export const findRecentBroadcast = (hex: string, now = Date.now()): string | null => {
  const key = hexKey(hex);
  const row = seen.get(key);
  if (!row) return null;
  if (now - row.at > BROADCAST_SEEN_TTL_MS) {
    seen.delete(key);
    return null;
  }
  return row.txid;
};

export const clientAddress = (headers: { get(name: string): string | null }): string => {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim() || 'unknown';
  return headers.get('x-real-ip')?.trim() || 'unknown';
};
