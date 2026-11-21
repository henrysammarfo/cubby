import { describe, expect, it } from 'vitest';
import { encodeBase58Address, encodeCashAddress, hexToBin } from '@bitauth/libauth';
import { checkSendAddress, MESSAGES } from '../src/address-check.js';
import { NETWORKS } from '../src/network.js';

const main = NETWORKS.mainnet;
const test = NETWORKS.chipnet;
const h20 = hexToBin('7a'.repeat(20));
const h32 = hexToBin('5c'.repeat(32));
const enc = (prefix: 'bitcoincash' | 'bchtest' | 'bchreg', type: 'p2pkh' | 'p2sh' | 'p2pkhWithTokens' | 'p2shWithTokens', payload = h20) =>
  encodeCashAddress({ prefix, type, payload }).address;

const mainP2pkh = enc('bitcoincash', 'p2pkh');
const mainToken = enc('bitcoincash', 'p2pkhWithTokens');
const testP2pkh = enc('bchtest', 'p2pkh');

/** Change one payload character to another valid CashAddr character. */
const typo = (address: string): string => {
  const i = address.length - 10;
  const c = address[i] === 'q' ? 'p' : 'q';
  return address.slice(0, i) + c + address.slice(i + 1);
};

describe('checkSendAddress', () => {
  it('accepts a plain main network address and returns its locking bytecode', () => {
    const r = checkSendAddress(mainP2pkh, main);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe('person');
    expect(r.tokenAware).toBe(false);
    expect(Buffer.from(r.lockingBytecode).toString('hex')).toBe(`76a914${'7a'.repeat(20)}88ac`);
  });

  it('accepts a token aware address and pays the same locking bytecode as the plain one', () => {
    const plain = checkSendAddress(mainP2pkh, main);
    const token = checkSendAddress(mainToken, main);
    expect(token.ok && plain.ok).toBe(true);
    if (!token.ok || !plain.ok) return;
    expect(mainToken.startsWith('bitcoincash:z')).toBe(true);
    expect(token.tokenAware).toBe(true);
    expect(token.lockingBytecode).toEqual(plain.lockingBytecode);
  });

  it('accepts P2SH20 and P2SH32 contract addresses', () => {
    const p20 = checkSendAddress(enc('bitcoincash', 'p2sh'), main);
    const p32 = checkSendAddress(enc('bitcoincash', 'p2shWithTokens', h32), main);
    expect(p20.ok && p20.kind).toBe('contract');
    expect(p32.ok && p32.kind).toBe('contract');
    if (p32.ok) expect(Buffer.from(p32.lockingBytecode).toString('hex')).toBe(`aa20${'5c'.repeat(32)}87`);
  });

  it('accepts an address without its prefix when it belongs to this network', () => {
    const r = checkSendAddress(mainP2pkh.split(':')[1]!, main);
    expect(r.ok && r.address).toBe(mainP2pkh);
  });

  it('accepts an all capitals address (QR codes use capitals)', () => {
    expect(checkSendAddress(mainP2pkh.toUpperCase(), main).ok).toBe(true);
  });

  it('trims surrounding spaces', () => {
    expect(checkSendAddress(`  ${mainP2pkh}\n`, main).ok).toBe(true);
  });

  it('rejects an empty field without calling it an error', () => {
    const r = checkSendAddress('   ', main);
    expect(r).toEqual({ ok: false, empty: true, reason: MESSAGES.empty });
  });

  it('rejects a one letter typo (bad checksum)', () => {
    const r = checkSendAddress(typo(mainP2pkh), main);
    expect(r).toEqual({ ok: false, reason: MESSAGES.typo });
  });

  it('rejects a missing last character', () => {
    expect(checkSendAddress(mainP2pkh.slice(0, -1), main).ok).toBe(false);
  });

  it('rejects a test network address on the main network, and the reverse', () => {
    expect(checkSendAddress(testP2pkh, main)).toEqual({ ok: false, reason: MESSAGES.wrongNetwork('test network', 'main network') });
    expect(checkSendAddress(mainP2pkh, test)).toEqual({ ok: false, reason: MESSAGES.wrongNetwork('main network', 'test network') });
  });

  it('spots the wrong network even when the prefix is left off', () => {
    const r = checkSendAddress(testP2pkh.split(':')[1]!, main);
    expect(r).toEqual({ ok: false, reason: MESSAGES.wrongNetwork('test network', 'main network') });
  });

  it('rejects a regtest address', () => {
    expect(checkSendAddress(enc('bchreg', 'p2pkh'), main).ok).toBe(false);
  });

  it('rejects mixed capital and small letters', () => {
    const mixed = mainP2pkh.slice(0, 20) + mainP2pkh.slice(20).toUpperCase();
    expect(checkSendAddress(mixed, main)).toEqual({ ok: false, reason: MESSAGES.mixedCase });
  });

  it('rejects a space inside the address', () => {
    expect(checkSendAddress(mainP2pkh.slice(0, 25) + ' ' + mainP2pkh.slice(25), main)).toEqual({ ok: false, reason: MESSAGES.spaces });
  });

  it('rejects legacy Base58 addresses', () => {
    const legacy = encodeBase58Address('p2pkh', h20);
    expect(legacy.startsWith('1')).toBe(true);
    expect(checkSendAddress(legacy, main)).toEqual({ ok: false, reason: MESSAGES.legacy('bitcoincash') });
    expect(checkSendAddress(encodeBase58Address('p2pkhTestnet', h20), test)).toEqual({ ok: false, reason: MESSAGES.legacy('bchtest') });
  });

  it('rejects other coins and junk', () => {
    expect(checkSendAddress('simpleledger:qpkpqwnht2x0mzqlyk4uce5f8ym9j9fcdyggnwdwjp', main)).toEqual({ ok: false, reason: MESSAGES.unknownPrefix });
    expect(checkSendAddress('0x52908400098527886E0F7030069857D2E4169EE7', main).ok).toBe(false);
    expect(checkSendAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', main).ok).toBe(false);
    expect(checkSendAddress('hello', main).ok).toBe(false);
    expect(checkSendAddress('bitcoincash:', main).ok).toBe(false);
  });

  it('blocks sending the box to itself', () => {
    const own = enc('bitcoincash', 'p2sh', h32);
    expect(checkSendAddress(own, main, own)).toEqual({ ok: false, reason: MESSAGES.ownBox });
    // The token aware form of the same box is the same place.
    expect(checkSendAddress(enc('bitcoincash', 'p2shWithTokens', h32), main, own)).toEqual({ ok: false, reason: MESSAGES.ownBox });
  });

  it('never throws on any input', () => {
    for (const s of ['', ':', '::', 'bitcoincash::q', '\u0000', 'q'.repeat(500), 'bitcoincash:' + 'q'.repeat(42)]) {
      expect(() => checkSendAddress(s, main)).not.toThrow();
      expect(checkSendAddress(s, main).ok).toBe(false);
    }
  });
});
