import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeLockingBytecodeP2pkh } from '@bitauth/libauth';
import { assertNetworkAddress, addressToLocking } from '../src/address.js';
import { broadcastTransaction, resetBroadcastCache } from '../src/chain.js';
import { buildUnsignedVaultSpend, feePaidOnSpend } from '../src/vault-spend.js';
import {
  DUST_SATS,
  NETWORKS,
  VAULT_SPEND_FEE_SATS,
  assertSpendAllowed,
} from '../src/network.js';
import { assertVaultOrigin } from '../web/passkey.js';
import {
  ALLOWED_BROADCAST_ORIGINS,
  MAX_BROADCAST_HEX_CHARS,
  MIN_BROADCAST_HEX_CHARS,
  allowBroadcastRequest,
  findRecentBroadcast,
  isAllowedBroadcastOrigin,
  isBroadcastBodyTooLarge,
  rememberBroadcast,
  resetBroadcastRateLimit,
  resetBroadcastSeen,
  validateBroadcastHex,
} from '../lib/server/broadcast-guard.js';
import { readFileSync } from 'node:fs';

const main = NETWORKS.mainnet;
const destLock = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(3));
const changeLock = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(9));
const HENRY_PLAIN = 'bitcoincash:qq7mt4punl9enxeznfrar0xhl6y0p5y5jgktr4yflp';
const HENRY_TOKEN = 'bitcoincash:zq7mt4punl9enxeznfrar0xhl6y0p5y5jg3pst20qj';

const utxo = (satoshis: bigint) => ({
  txid: '11'.repeat(32),
  vout: 0,
  satoshis,
  lockingBytecode: new Uint8Array(32),
});

describe('Caps, dust, and exact fee', () => {
  it('refuses a send below the dust limit', () => {
    expect(() => assertSpendAllowed(main, DUST_SATS - 1n, 20_000n, true)).toThrow(/too small/);
  });

  it('pays exactly the intended fee when the leftover is zero', () => {
    const tx = buildUnsignedVaultSpend(main, utxo(20_000n), destLock, { amountSats: 9_000n });
    expect(feePaidOnSpend(20_000n, tx)).toBe(VAULT_SPEND_FEE_SATS);
    expect(tx.outputs[0]!.valueSatoshis).toBe(9_000n);
    expect(tx.outputs).toHaveLength(1);
  });

  it('adds sub-dust leftover to the destination instead of burning it as extra fee', () => {
    const vault = 20_100n;
    const send = 9_000n;
    const tx = buildUnsignedVaultSpend(main, utxo(vault), destLock, { amountSats: send, changeLocking: changeLock });
    expect(feePaidOnSpend(vault, tx)).toBe(VAULT_SPEND_FEE_SATS);
    expect(tx.outputs).toHaveLength(1);
    expect(tx.outputs[0]!.valueSatoshis).toBe(send + 100n);
  });

  it('returns change of dust or more to the box and still pays only the intended fee', () => {
    const vault = 20_000n + DUST_SATS;
    const send = 9_000n;
    const tx = buildUnsignedVaultSpend(main, utxo(vault), destLock, { amountSats: send, changeLocking: changeLock });
    expect(feePaidOnSpend(vault, tx)).toBe(VAULT_SPEND_FEE_SATS);
    expect(tx.outputs).toHaveLength(2);
    expect(tx.outputs[1]!.valueSatoshis).toBe(DUST_SATS);
  });
});

describe('Address validation (prefix and checksum only)', () => {
  it('accepts Henry’s main-network Paytaca plain and token-aware addresses on mainnet', () => {
    expect(() => assertNetworkAddress(HENRY_PLAIN, main)).not.toThrow();
    expect(() => assertNetworkAddress(HENRY_TOKEN, main)).not.toThrow();
    expect(addressToLocking(HENRY_PLAIN).length).toBeGreaterThan(0);
  });

  it('rejects a test-network address on the main network, and the reverse', () => {
    const testAddr = 'bchtest:qpl93ln6r425c60fqhc25sf4sh59fmwwrufym39tj0';
    expect(() => assertNetworkAddress(testAddr, main)).toThrow(/different network/);
    expect(() => assertNetworkAddress(HENRY_PLAIN, NETWORKS.chipnet)).toThrow(/different network/);
  });

  it('rejects an empty or garbage address', () => {
    expect(() => assertNetworkAddress('', main)).toThrow();
    expect(() => assertNetworkAddress('not-an-address', main)).toThrow();
    expect(() => assertNetworkAddress('bitcoincash:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', main)).toThrow();
  });
});

describe('Passkey origin binding', () => {
  it('allows a vault whose rpId matches this website, and refuses any other host', () => {
    expect(() => assertVaultOrigin({ rpId: 'cubby-liart-six.vercel.app' }, 'cubby-liart-six.vercel.app')).not.toThrow();
    expect(() => assertVaultOrigin({ rpId: 'cubby-liart-six.vercel.app' }, 'localhost')).toThrow(/different website address/);
    expect(() => assertVaultOrigin({ rpId: 'preview.vercel.app' }, 'cubby-liart-six.vercel.app')).toThrow(/different website address/);
  });
});

describe('Broadcast guards', () => {
  afterEach(() => {
    resetBroadcastRateLimit();
    resetBroadcastSeen();
    resetBroadcastCache();
    vi.unstubAllGlobals();
  });

  it('validates hex length, even length, and the size cap', () => {
    expect(validateBroadcastHex('00').ok).toBe(false);
    expect(validateBroadcastHex('001').ok).toBe(false);
    expect(validateBroadcastHex('zz'.repeat(12)).ok).toBe(false);
    const ok = validateBroadcastHex('ab'.repeat(12));
    expect(ok).toEqual({ ok: true, hex: 'ab'.repeat(12) });
    const big = validateBroadcastHex('aa'.repeat(MAX_BROADCAST_HEX_CHARS / 2 + 1));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.status).toBe(413);
    expect(MIN_BROADCAST_HEX_CHARS).toBe(20);
    expect(isBroadcastBodyTooLarge('64001')).toBe(true);
    expect(isBroadcastBodyTooLarge('100')).toBe(false);
  });

  it('accepts the live origin and localhost, and refuses a foreign origin', () => {
    expect(isAllowedBroadcastOrigin(null)).toBe(true);
    expect(isAllowedBroadcastOrigin(ALLOWED_BROADCAST_ORIGINS[0])).toBe(true);
    expect(isAllowedBroadcastOrigin('http://localhost:4173')).toBe(true);
    expect(isAllowedBroadcastOrigin('https://evil.example')).toBe(false);
  });

  it('rate-limits a client after five requests in a minute', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) expect(allowBroadcastRequest('1.2.3.4', now + i)).toBe(true);
    expect(allowBroadcastRequest('1.2.3.4', now + 10)).toBe(false);
    expect(allowBroadcastRequest('5.6.7.8', now + 10)).toBe(true);
    expect(allowBroadcastRequest('1.2.3.4', now + 60_001)).toBe(true);
  });

  it('returns the same txid when the same hex is seen again', () => {
    const hex = 'ab'.repeat(20);
    expect(findRecentBroadcast(hex)).toBeNull();
    rememberBroadcast(hex, 'cd'.repeat(32));
    expect(findRecentBroadcast(hex)).toBe('cd'.repeat(32));
    expect(findRecentBroadcast(hex.toUpperCase())).toBe('cd'.repeat(32));
  });

  it('reuses one in-flight client broadcast for the same hex', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      async () => {
        calls += 1;
        return new Response(JSON.stringify({ txid: 'ab'.repeat(32) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    const first = broadcastTransaction(main, '11'.repeat(20));
    const second = broadcastTransaction(main, '11'.repeat(20));
    expect(await first).toBe('ab'.repeat(32));
    expect(await second).toBe('ab'.repeat(32));
    expect(calls).toBe(1);
  });
});

describe('Security headers', () => {
  it('sets CSP, HSTS, frame ancestors, referrer policy, and a passkey-friendly Permissions-Policy', () => {
    const src = readFileSync(new URL('../lib/security-headers.mjs', import.meta.url), 'utf8');
    const config = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
    expect(config).toContain('SECURITY_HEADERS');
    expect(config).toContain("source: '/:path*'");
    expect(src).toContain("frame-ancestors 'none'");
    expect(src).toContain("default-src 'self'");
    expect(src).toContain('wss://relay.riften.net:443');
    expect(src).toContain('publickey-credentials-get=(self)');
    expect(src).toContain('publickey-credentials-create=(self)');
    expect(src).toContain('max-age=31536000');
    expect(src).toContain('strict-origin-when-cross-origin');
    expect(src).toContain('Content-Security-Policy');
    expect(src).toContain('Strict-Transport-Security');
    expect(src).toContain('Referrer-Policy');
    expect(src).toContain('Permissions-Policy');
    expect(src).toContain('X-Frame-Options');
  });
});
