/**
 * Cubby ID: a self-sovereign link between a Cubby BCH vault (opened with a passkey) and a Nostr key.
 *
 * Standards used, not invented:
 *  - NIP-01 events and BIP-340 signatures prove control of the Nostr key.
 *  - NIP-39 (kind 10011, `i` tags, "Verifying that I control the following Nostr public key: <npub>") publishes the claim.
 *  - NIP-42 style AUTH events (kind 22242, `challenge` tag) answer a login challenge.
 *  - WebAuthn (ES256 over authenticatorData | sha256(clientDataJSON)) proves control of the passkey that owns the vault.
 *  - The vault address is recomputed from the passkey public key and site name, so the passkey and the address cannot be mixed up.
 *  - Optional on-chain anchor: a vault spend whose outputs include OP_RETURN "CUBBYID" <nostr pubkey> <statement hash>.
 *    The vault covenant only lets a spend through if the passkey signed every output, so this is a passkey approval
 *    checked by every node, with a block timestamp.
 * The two keys are different curves (P-256 for the passkey, secp256k1 for Nostr), so no key is ever reused.
 */
import { finalizeEvent, getPublicKey, verifyEvent, type Event, type EventTemplate } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { p256 } from '@noble/curves/nist.js';
import {
  binToHex,
  createVirtualMachineBch2026,
  decodeTransactionBch,
  encodeDataPush,
  flattenBinArray,
  hash256,
  hexToBin,
  sha256,
  utf8ToBin,
  type Output,
  type TransactionBch,
} from '@bitauth/libauth';
import { buildVault } from '../covenant.js';
import { lockingToAddress } from '../address.js';
import { NETWORKS, type NetworkId } from '../network.js';
import { base64url, fromBase64url, splitClientData, type Assertion } from '../webauthn.js';
import type { Point } from '../p256.js';

export const CUBBY_ID_MARKER = utf8ToBin('CUBBYID');
export const IDENTITY_KIND = 10011; // NIP-39 external identities
export const AUTH_KIND = 22242; // NIP-42 authentication event

export interface CubbyIdClaim {
  readonly network: NetworkId;
  /** Passkey public key, uncompressed SEC1 (65 bytes, hex). */
  readonly passkeyPublicKey: string;
  /** WebAuthn relying party ID (the site the passkey belongs to). */
  readonly rpId: string;
  /** Nostr public key, 32-byte x-only hex. */
  readonly nostrPubkey: string;
}

const pointToHex = (p: Point): string =>
  `04${p.x.toString(16).padStart(64, '0')}${p.y.toString(16).padStart(64, '0')}`;
const hexToPoint = (hex: string): Point => {
  if (!/^04[0-9a-f]{128}$/.test(hex)) throw new Error('The passkey key must be 65 bytes starting with 04.');
  return { x: BigInt(`0x${hex.slice(2, 66)}`), y: BigInt(`0x${hex.slice(66)}`) };
};

export const claimFor = (network: NetworkId, publicKey: Point, rpId: string, nostrPubkey: string): CubbyIdClaim => ({
  network,
  passkeyPublicKey: pointToHex(publicKey),
  rpId,
  nostrPubkey,
});

/** The vault address is derived, never taken on trust. */
export const vaultAddressOf = (claim: CubbyIdClaim): string => {
  const vault = buildVault({ publicKey: hexToPoint(claim.passkeyPublicKey), rpIdHash: sha256.hash(utf8ToBin(claim.rpId)) });
  return lockingToAddress(vault.lockingBytecode, NETWORKS[claim.network]);
};

const platformOf = (network: NetworkId) => (network === 'mainnet' ? 'cubby' : `cubby-${network}`);
/** NIP-39 identity names must not contain ':', so the cashaddr prefix moves into the platform name. */
export const identityTagValue = (claim: CubbyIdClaim): string => `${platformOf(claim.network)}:${vaultAddressOf(claim).split(':')[1]}`;

/** Canonical text both keys approve. Line one is the NIP-39 verification text. */
export const statementOf = (claim: CubbyIdClaim): string =>
  [
    `Verifying that I control the following Nostr public key: ${nip19.npubEncode(claim.nostrPubkey)}`,
    `Cubby ID v1`,
    `Vault: ${vaultAddressOf(claim)}`,
    `Passkey: ${claim.passkeyPublicKey}`,
    `Site: ${claim.rpId}`,
    `Network: ${claim.network}`,
  ].join('\n');

export const statementHash = (claim: CubbyIdClaim): Uint8Array => sha256.hash(utf8ToBin(statementOf(claim)));

/** OP_RETURN output that anchors the link on chain. Put it in a vault spend so the covenant checks the passkey approved it. */
export const anchorOutput = (claim: CubbyIdClaim): Output => ({
  lockingBytecode: flattenBinArray([
    Uint8Array.of(0x6a),
    encodeDataPush(CUBBY_ID_MARKER),
    encodeDataPush(hexToBin(claim.nostrPubkey)),
    encodeDataPush(statementHash(claim)),
  ]),
  valueSatoshis: 0n,
});

export interface PasskeyProof {
  readonly authenticatorData: string;
  readonly clientDataJSON: string;
  readonly signature: string;
}

export const passkeyProofFrom = (a: Assertion): PasskeyProof => ({
  authenticatorData: base64url(a.authenticatorData),
  clientDataJSON: base64url(a.clientDataJSON),
  signature: base64url(a.signature),
});

/** Check a WebAuthn assertion: right site, user present and verified, challenge, and an ES256 signature by `publicKey`. */
export const verifyPasskeyAssertion = (proof: PasskeyProof, publicKeyHex: string, rpId: string, challenge: Uint8Array): void => {
  const authData = fromBase64url(proof.authenticatorData);
  const clientData = fromBase64url(proof.clientDataJSON);
  if (authData.length < 37) throw new Error('authenticatorData is too short.');
  if (binToHex(authData.subarray(0, 32)) !== binToHex(sha256.hash(utf8ToBin(rpId)))) throw new Error('The passkey belongs to a different site.');
  if ((authData[32]! & 0x05) !== 0x05) throw new Error('The passkey did not confirm the user was present and verified.');
  const parsed = JSON.parse(new TextDecoder().decode(clientData)) as { type?: string; challenge?: string };
  if (parsed.type !== 'webauthn.get') throw new Error('This is not a passkey sign-in.');
  if (parsed.challenge !== base64url(challenge)) throw new Error('The passkey signed something else.');
  splitClientData(clientData, challenge); // also checks the byte layout the on-chain verifier needs
  const message = flattenBinArray([authData, sha256.hash(clientData)]);
  const ok = p256.verify(fromBase64url(proof.signature), message, hexToBin(publicKeyHex), { format: 'der', lowS: false });
  if (!ok) throw new Error('The passkey signature is not valid.');
};

export interface IdentityEventInput {
  readonly claim: CubbyIdClaim;
  readonly passkeyProof: PasskeyProof;
  /** Optional on-chain anchor txid. */
  readonly anchorTxid?: string;
  /** Other NIP-39 `i` tags the user already publishes (kind 10011 is replaceable, so keep them). */
  readonly keepTags?: string[][];
  readonly createdAt?: number;
}

export const identityEventTemplate = (input: IdentityEventInput): EventTemplate => {
  const { claim } = input;
  const mine = identityTagValue(claim);
  const kept = (input.keepTags ?? []).filter((t) => !(t[0] === 'i' && t[1] === mine) && t[0] !== 'cubby' && t[0] !== 'cubby-passkey');
  return {
    kind: IDENTITY_KIND,
    created_at: input.createdAt ?? Math.floor(Date.now() / 1000),
    content: '',
    tags: [
      ...kept,
      ['i', mine, input.anchorTxid ?? 'passkey'],
      ['cubby', 'v1', claim.network, claim.passkeyPublicKey, claim.rpId],
      ['cubby-passkey', input.passkeyProof.authenticatorData, input.passkeyProof.clientDataJSON, input.passkeyProof.signature],
    ],
  };
};

export const signIdentityEvent = (input: IdentityEventInput, nostrSecret: Uint8Array): Event => {
  if (getPublicKey(nostrSecret) !== input.claim.nostrPubkey) throw new Error('This Nostr key does not match the claim.');
  return finalizeEvent(identityEventTemplate(input), nostrSecret);
};

/** nostr-tools caches a "verified" flag on event objects; check a clean copy so a copied object cannot skip the check. */
const checkNostrSig = (e: Event): boolean =>
  verifyEvent({ id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content, sig: e.sig });

export interface VerifiedIdentity {
  readonly npub: string;
  readonly nostrPubkey: string;
  readonly vaultAddress: string;
  readonly claim: CubbyIdClaim;
  readonly anchorTxid?: string;
  readonly anchor: 'none' | 'verified';
}

/** Offline check of a published identity event: Nostr signature, derived address, passkey proof. */
export const verifyIdentityEvent = (event: Event): VerifiedIdentity => {
  if (event.kind !== IDENTITY_KIND) throw new Error('Not an identity event.');
  if (!checkNostrSig(event)) throw new Error('The Nostr signature is not valid.');
  const meta = event.tags.find((t) => t[0] === 'cubby' && t[1] === 'v1');
  const pk = event.tags.find((t) => t[0] === 'cubby-passkey');
  if (!meta || !pk) throw new Error('This event has no Cubby ID.');
  const network = meta[2] as NetworkId;
  if (network !== 'chipnet' && network !== 'mainnet') throw new Error('Unknown network.');
  const claim: CubbyIdClaim = { network, passkeyPublicKey: meta[3]!, rpId: meta[4]!, nostrPubkey: event.pubkey };
  const tag = event.tags.find((t) => t[0] === 'i' && t[1] === identityTagValue(claim));
  if (!tag) throw new Error('The published address does not match the passkey.');
  verifyPasskeyAssertion({ authenticatorData: pk[1]!, clientDataJSON: pk[2]!, signature: pk[3]! }, claim.passkeyPublicKey, claim.rpId, statementHash(claim));
  const anchorTxid = tag[2] && /^[0-9a-f]{64}$/.test(tag[2]) ? tag[2] : undefined;
  return {
    npub: nip19.npubEncode(event.pubkey),
    nostrPubkey: event.pubkey,
    vaultAddress: vaultAddressOf(claim),
    claim,
    ...(anchorTxid ? { anchorTxid } : {}),
    anchor: 'none',
  };
};

const vm = createVirtualMachineBch2026(true);

/**
 * Check the on-chain anchor without trusting an explorer's verdict: the caller supplies raw transaction bytes
 * (the txid is their hash, so they cannot be forged), and the 2026 VM re-runs the vault covenant here.
 */
export const verifyAnchor = (
  identity: VerifiedIdentity,
  anchorTxHex: string,
  parentTxHex: (txid: string) => string,
): VerifiedIdentity => {
  const raw = hexToBin(anchorTxHex);
  const tx = decodeTransactionBch(raw);
  if (typeof tx === 'string') throw new Error(tx);
  const txid = binToHex(hash256(raw).slice().reverse());
  if (txid !== identity.anchorTxid) throw new Error('This is not the anchor transaction.');
  const vault = buildVault({ publicKey: hexToPoint(identity.claim.passkeyPublicKey), rpIdHash: sha256.hash(utf8ToBin(identity.claim.rpId)) });
  const expected = binToHex(anchorOutput(identity.claim).lockingBytecode);
  if (!tx.outputs.some((o) => binToHex(o.lockingBytecode) === expected)) throw new Error('The anchor does not carry this Nostr key and statement.');
  const sourceOutputs: Output[] = tx.inputs.map((input) => {
    const parent = decodeTransactionBch(hexToBin(parentTxHex(binToHex(input.outpointTransactionHash))));
    if (typeof parent === 'string') throw new Error(parent);
    const out = parent.outputs[input.outpointIndex];
    if (!out) throw new Error('Missing parent output.');
    return out;
  });
  const vaultInput = sourceOutputs.findIndex((o) => binToHex(o.lockingBytecode) === binToHex(vault.lockingBytecode));
  if (vaultInput < 0) throw new Error('The anchor does not spend this vault.');
  const verified = vm.verify({ transaction: tx as TransactionBch, sourceOutputs });
  if (verified !== true) throw new Error(`The anchor transaction does not pass the vault rules: ${String(verified)}`);
  return { ...identity, anchor: 'verified' };
};

// ---------- Authentication (challenge-response) ----------

export interface LoginChallenge {
  readonly app: string;
  readonly challenge: string;
  readonly expiresAt: number;
}

export const newLoginChallenge = (app: string, ttlSeconds = 300): LoginChallenge => ({
  app,
  challenge: binToHex(crypto.getRandomValues(new Uint8Array(32))),
  expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
});

/** What the passkey signs to log in: binds the app, the challenge and the Nostr key. */
export const loginPasskeyChallenge = (c: LoginChallenge, nostrPubkey: string): Uint8Array =>
  sha256.hash(utf8ToBin(`Cubby ID login\n${c.app}\n${c.challenge}\n${nostrPubkey}`));

export interface LoginResponse {
  readonly authEvent: Event;
  readonly passkey?: PasskeyProof;
}

export const signLogin = (c: LoginChallenge, nostrSecret: Uint8Array, passkey?: PasskeyProof): LoginResponse => {
  const authEvent = finalizeEvent(
    { kind: AUTH_KIND, created_at: Math.floor(Date.now() / 1000), content: '', tags: [['relay', c.app], ['challenge', c.challenge]] },
    nostrSecret,
  );
  return passkey ? { authEvent, passkey } : { authEvent };
};

export interface LoginResult {
  readonly npub: string;
  readonly vaultAddress: string;
  readonly factors: Array<'nostr' | 'passkey'>;
}

/** The app checks the login with no identity server: only the published event and the response. */
export const verifyLogin = (c: LoginChallenge, response: LoginResponse, identity: VerifiedIdentity, now = Math.floor(Date.now() / 1000)): LoginResult => {
  if (now > c.expiresAt) throw new Error('This login request has expired.');
  const e = response.authEvent;
  if (e.kind !== AUTH_KIND || !checkNostrSig(e)) throw new Error('The Nostr login signature is not valid.');
  if (e.pubkey !== identity.nostrPubkey) throw new Error('This login is from a different Nostr key.');
  if (!e.tags.some((t) => t[0] === 'challenge' && t[1] === c.challenge)) throw new Error('The login answers a different challenge.');
  if (!e.tags.some((t) => t[0] === 'relay' && t[1] === c.app)) throw new Error('The login is for a different app.');
  if (Math.abs(e.created_at - now) > 600) throw new Error('The login time is too far off.');
  const factors: LoginResult['factors'] = ['nostr'];
  if (response.passkey) {
    verifyPasskeyAssertion(response.passkey, identity.claim.passkeyPublicKey, identity.claim.rpId, loginPasskeyChallenge(c, identity.nostrPubkey));
    factors.push('passkey');
  }
  return { npub: identity.npub, vaultAddress: identity.vaultAddress, factors };
};

// ---------- Discovery ----------

/** Relay filters: by Nostr key, or reverse lookup by vault address (relays index single-letter tags such as `i`). */
export const filterByNostrKey = (nostrPubkey: string) => ({ kinds: [IDENTITY_KIND], authors: [nostrPubkey] });
export const filterByVault = (network: NetworkId, vaultAddress: string) => ({
  kinds: [IDENTITY_KIND],
  '#i': [`${platformOf(network)}:${vaultAddress.split(':')[1]}`],
});

/** Pick the newest event that verifies; ignore anything that does not. */
export const pickVerified = (events: Event[]): VerifiedIdentity | undefined => {
  const sorted = [...events].sort((a, b) => b.created_at - a.created_at);
  for (const e of sorted) {
    try {
      return verifyIdentityEvent(e);
    } catch {
      /* skip events that do not verify */
    }
  }
  return undefined;
};

export const npubToHex = (npub: string): string => {
  const d = nip19.decode(npub);
  if (d.type !== 'npub') throw new Error('That is not an npub.');
  return d.data;
};
