import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { binToHex, encodeTransactionBch, hexToBin, sha256, utf8ToBin, type TransactionBch } from '@bitauth/libauth';
import { keyedPasskey, randomPasskeyKey } from '../src/bounties/keyed-passkey.js';
import { buildVault } from '../src/covenant.js';
import { intentHash } from '../src/intent.js';
import { unlockFromAssertion } from '../src/unlock.js';
import {
  anchorOutput,
  claimFor,
  filterByVault,
  loginPasskeyChallenge,
  newLoginChallenge,
  passkeyProofFrom,
  pickVerified,
  signIdentityEvent,
  signLogin,
  statementHash,
  statementOf,
  vaultAddressOf,
  verifyAnchor,
  verifyIdentityEvent,
  verifyLogin,
} from '../src/bounties/identity.js';

const RP = 'cubby.test';
const passkey = keyedPasskey(randomPasskeyKey(), RP);
const nsec = generateSecretKey();
const npubHex = getPublicKey(nsec);
const claim = claimFor('chipnet', passkey.publicKey, RP, npubHex);
const proof = passkeyProofFrom(passkey.assert(statementHash(claim)));
const event = signIdentityEvent({ claim, passkeyProof: proof }, nsec);

describe('Cubby ID: BCH vault and Nostr key linked by two independent proofs', () => {
  it('starts the statement with the NIP-39 verification text', () => {
    expect(statementOf(claim).split('\n')[0]).toMatch(/^Verifying that I control the following Nostr public key: npub1/);
  });

  it('publishes a NIP-39 kind 10011 event that any app can verify offline', () => {
    expect(event.kind).toBe(10011);
    const id = verifyIdentityEvent(event);
    expect(id.vaultAddress).toBe(vaultAddressOf(claim));
    expect(id.vaultAddress.startsWith('bchtest:p')).toBe(true);
    expect(event.tags.find((t) => t[0] === 'i')![1]).toBe(`cubby-chipnet:${id.vaultAddress.split(':')[1]}`);
  });

  it('keeps the user’s other NIP-39 identities when republishing', () => {
    const e = signIdentityEvent({ claim, passkeyProof: proof, keepTags: [['i', 'github:alice', 'abc']] }, nsec);
    expect(e.tags.filter((t) => t[0] === 'i')).toHaveLength(2);
  });

  it('rejects a copied passkey proof under someone else’s Nostr key', () => {
    const thief = generateSecretKey();
    const stolen = finalizeEvent({ kind: 10011, created_at: event.created_at, content: '', tags: event.tags }, thief);
    expect(() => verifyIdentityEvent(stolen)).toThrow(/passkey signed something else/);
  });

  it('rejects an address that the passkey does not own', () => {
    const tags = event.tags.map((t) => (t[0] === 'i' ? ['i', 'cubby-chipnet:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', 'passkey'] : t));
    const forged = finalizeEvent({ kind: 10011, created_at: event.created_at, content: '', tags }, nsec);
    expect(() => verifyIdentityEvent(forged)).toThrow(/does not match the passkey/);
  });

  it('rejects a passkey proof for another site', () => {
    const other = keyedPasskey(randomPasskeyKey(), 'evil.test');
    const c2 = claimFor('chipnet', other.publicKey, RP, npubHex);
    const p2 = passkeyProofFrom(other.assert(statementHash(c2)));
    expect(() => verifyIdentityEvent(signIdentityEvent({ claim: c2, passkeyProof: p2 }, nsec))).toThrow(/different site/);
  });

  it('rejects a tampered Nostr signature', () => {
    expect(() => verifyIdentityEvent({ ...event, created_at: event.created_at + 1 })).toThrow(/Nostr signature/);
  });

  it('discovery picks the newest event that verifies and skips junk', () => {
    const junk = finalizeEvent({ kind: 10011, created_at: event.created_at + 100, content: '', tags: [['i', 'github:x', 'y']] }, nsec);
    expect(pickVerified([junk, event])?.vaultAddress).toBe(vaultAddressOf(claim));
    expect(filterByVault('chipnet', vaultAddressOf(claim))['#i'][0]).toBe(event.tags.find((t) => t[0] === 'i')![1]);
  });

  it('logs in with Nostr and passkey answers to a fresh challenge', () => {
    const id = verifyIdentityEvent(event);
    const c = newLoginChallenge('https://shop.example');
    const pk = passkeyProofFrom(passkey.assert(loginPasskeyChallenge(c, npubHex)));
    const result = verifyLogin(c, signLogin(c, nsec, pk), id);
    expect(result.factors).toEqual(['nostr', 'passkey']);
    expect(result.vaultAddress).toBe(id.vaultAddress);
  });

  it('refuses a login that replays another challenge or another app', () => {
    const id = verifyIdentityEvent(event);
    const c1 = newLoginChallenge('https://shop.example');
    const c2 = newLoginChallenge('https://shop.example');
    expect(() => verifyLogin(c2, signLogin(c1, nsec), id)).toThrow(/different challenge/);
    const c3 = { ...c1, app: 'https://other.example' };
    expect(() => verifyLogin(c3, signLogin(c1, nsec), id)).toThrow(/different app/);
    expect(() => verifyLogin(c1, signLogin(c1, generateSecretKey()), id)).toThrow(/different Nostr key/);
  });

  it('verifies an on-chain anchor by re-running the vault covenant locally', () => {
    const vault = buildVault({ publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP)) });
    const parent: TransactionBch = {
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: new Uint8Array(32).fill(3), outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
      outputs: [{ lockingBytecode: vault.lockingBytecode, valueSatoshis: 50_000n }],
    };
    const parentHex = binToHex(encodeTransactionBch(parent));
    const parentTxid = binToHex(sha256.hash(sha256.hash(hexToBin(parentHex))).slice().reverse());
    const unsigned: TransactionBch = {
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: hexToBin(parentTxid), outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
      outputs: [anchorOutput(claim), { lockingBytecode: vault.lockingBytecode, valueSatoshis: 38_000n }],
    };
    const unlocking = unlockFromAssertion(vault, { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP)) }, unsigned, 0, passkey.assert(intentHash(unsigned, 0)));
    const anchorTx = { ...unsigned, inputs: [{ ...unsigned.inputs[0]!, unlockingBytecode: unlocking }] };
    const anchorHex = binToHex(encodeTransactionBch(anchorTx));
    const anchorTxid = binToHex(sha256.hash(sha256.hash(hexToBin(anchorHex))).slice().reverse());
    const id = verifyIdentityEvent(signIdentityEvent({ claim, passkeyProof: proof, anchorTxid }, nsec));
    expect(verifyAnchor(id, anchorHex, () => parentHex).anchor).toBe('verified');
    // An anchor carrying another Nostr key fails.
    const other = claimFor('chipnet', passkey.publicKey, RP, getPublicKey(generateSecretKey()));
    const otherId = { ...id, claim: other };
    expect(() => verifyAnchor(otherId, anchorHex, () => parentHex)).toThrow(/does not carry/);
  });
});
