/**
 * Strict checks for an address typed or pasted into Send.
 *
 * Grounded in the CashAddr spec (https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md)
 * and the CashTokens address types (CHIP-2022-02, https://github.com/cashtokens/cashtokens#cashaddress-token-support),
 * using libauth's decoders for the checksum, version byte and payload length.
 *
 * Every failure has a plain English message for the person sending. Nothing
 * here throws; the Send button stays off until `ok` is true.
 */
import { cashAddressToLockingBytecode, decodeBase58Address, decodeCashAddress } from '@bitauth/libauth';
import type { Network } from './network.js';

export type AddressKind = 'person' | 'contract';

export type AddressCheck =
  | {
      readonly ok: true;
      /** Lower case, with the network prefix, ready to show and store. */
      readonly address: string;
      readonly lockingBytecode: Uint8Array;
      readonly kind: AddressKind;
      /** True for token aware addresses (z or r after the prefix). */
      readonly tokenAware: boolean;
    }
  | { readonly ok: false; readonly empty?: true; readonly reason: string };

const KNOWN_PREFIXES: Record<string, string> = {
  bitcoincash: 'main network',
  bchtest: 'test network',
  bchreg: 'local test network',
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

const fail = (reason: string): AddressCheck => ({ ok: false, reason });

export const MESSAGES = {
  empty: 'Enter the address you want to send to.',
  spaces: 'This address has a space or line break in it. Paste it again.',
  mixedCase: 'This address mixes capital and small letters. Paste it again exactly as your wallet shows it.',
  legacy: (prefix: string) => `That is an old style address. Ask for an address that starts with ${prefix}: and paste that instead.`,
  typo: 'This address has a typo. Check every letter, or paste it again from the wallet.',
  notAddress: 'That is not a Bitcoin Cash address. Paste the address from the wallet you are paying.',
  unknownPrefix: 'That address is not for Bitcoin Cash.',
  unsupported: 'This kind of address is not supported. Ask for a normal Bitcoin Cash address.',
  ownBox: 'That is this box’s own address. Paste the address of the wallet you are paying.',
  wrongNetwork: (found: string, want: string) => `This is a ${found} address, but your box is on the ${want}. Coins sent there would be lost.`,
} as const;

/**
 * Check `input` for `network`. `ownAddress`, when given, blocks sending the
 * box to itself.
 */
export const checkSendAddress = (input: string, network: Network, ownAddress?: string | null): AddressCheck => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, empty: true, reason: MESSAGES.empty };
  if (/\s/u.test(trimmed)) return fail(MESSAGES.spaces);
  // Legacy Base58 addresses (start with 1, 3, m, n or 2) carry no network or token marker. Refuse them.
  if (!trimmed.includes(':') && typeof decodeBase58Address(trimmed) !== 'string') return fail(MESSAGES.legacy(network.prefix));
  // CashAddr: "the lower case and upper case forms are both valid, mixed case is not" (cashaddr spec).
  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) return fail(MESSAGES.mixedCase);


  const lower = trimmed.toLowerCase();
  const hasPrefix = lower.includes(':');
  const prefix = hasPrefix ? lower.slice(0, lower.indexOf(':')) : network.prefix;
  const full = hasPrefix ? lower : `${network.prefix}:${lower}`;

  if (hasPrefix && KNOWN_PREFIXES[prefix] === undefined) return fail(MESSAGES.unknownPrefix);

  const decoded = decodeCashAddress(full);
  if (typeof decoded === 'string') {
    // Without a prefix the checksum is tied to the prefix we guessed. If it is valid for
    // another Bitcoin Cash network, say so instead of calling it a typo.
    if (!hasPrefix) {
      for (const other of Object.keys(KNOWN_PREFIXES)) {
        if (other === network.prefix) continue;
        if (typeof decodeCashAddress(`${other}:${lower}`) !== 'string') {
          return fail(MESSAGES.wrongNetwork(KNOWN_PREFIXES[other]!, network.label));
        }
      }
    }
    if (/checksum/iu.test(decoded)) return fail(MESSAGES.typo);
    if (/characters|padd|form/iu.test(decoded)) return hasPrefix ? fail(MESSAGES.typo) : fail(MESSAGES.notAddress);
    return fail(MESSAGES.unsupported);
  }

  if (decoded.prefix !== network.prefix) {
    return fail(MESSAGES.wrongNetwork(KNOWN_PREFIXES[decoded.prefix] ?? 'different', network.label));
  }

  const locking = cashAddressToLockingBytecode(full);
  if (typeof locking === 'string') return fail(MESSAGES.unsupported);

  // Only standard payment types: P2PKH (20 byte hash) and P2SH (20 or 32 byte hash).
  const type = decoded.type;
  const len = decoded.payload.length;
  let kind: AddressKind;
  if ((type === 'p2pkh' || type === 'p2pkhWithTokens') && len === 20) kind = 'person';
  else if ((type === 'p2sh' || type === 'p2shWithTokens') && (len === 20 || len === 32)) kind = 'contract';
  else return fail(MESSAGES.unsupported);

  if (ownAddress) {
    const own = cashAddressToLockingBytecode(ownAddress.trim().toLowerCase());
    if (typeof own !== 'string' && sameBytes(own.bytecode, locking.bytecode)) {
      return fail(MESSAGES.ownBox);
    }
  }

  return {
    ok: true,
    address: full,
    lockingBytecode: locking.bytecode,
    kind,
    tokenAware: type === 'p2pkhWithTokens' || type === 'p2shWithTokens',
  };
};
