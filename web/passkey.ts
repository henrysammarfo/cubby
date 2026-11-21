import { sha256, utf8ToBin } from '@bitauth/libauth';
import { buildVault, type Vault, type VaultParams } from '../src/covenant.js';
import { decodeUncompressed, fromBase64url, type Assertion } from '../src/webauthn.js';
import { lockingToAddress } from '../src/address.js';
import type { Network } from '../src/network.js';

const STORE = 'cubby-vault-v1';

export interface StoredVault {
  readonly credentialId: string;
  readonly publicKeyX: string;
  readonly publicKeyY: string;
  readonly rpId: string;
  readonly address: string;
  readonly network: string;
}

const rpId = (): string => location.hostname;

export const currentRpId = rpId;

export const loadVault = (): StoredVault | null => {
  const raw = localStorage.getItem(STORE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredVault;
  } catch {
    return null;
  }
};

const saveVault = (vault: StoredVault): void => {
  localStorage.setItem(STORE, JSON.stringify(vault));
};

export const vaultFromStored = (stored: StoredVault): { params: VaultParams; vault: Vault } => {
  const params: VaultParams = {
    publicKey: { x: BigInt(`0x${stored.publicKeyX}`), y: BigInt(`0x${stored.publicKeyY}`) },
    rpIdHash: sha256.hash(utf8ToBin(stored.rpId)),
  };
  return { params, vault: buildVault(params) };
};

export const createDeviceLock = async (network: Network): Promise<StoredVault> => {
  const id = location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Cubby', id },
      user: { id: userId, name: 'cubby', displayName: 'Cubby' },
      challenge,
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('The device did not create a lock.');
  const attestation = credential.response as AuthenticatorAttestationResponse;
  if (typeof attestation.getPublicKey !== 'function') {
    throw new Error('This browser does not expose the passkey public key. Try a current version of Safari, Chrome, or Edge.');
  }
  const spki = attestation.getPublicKey();
  if (!spki) throw new Error('The device did not return a public key.');
  const point = decodeUncompressed(new Uint8Array(spki));
  const params: VaultParams = { publicKey: point, rpIdHash: sha256.hash(utf8ToBin(id)) };
  const vault = buildVault(params);
  const stored: StoredVault = {
    credentialId: bufferToB64url(credential.rawId),
    publicKeyX: point.x.toString(16).padStart(64, '0'),
    publicKeyY: point.y.toString(16).padStart(64, '0'),
    rpId: id,
    address: lockingToAddress(vault.lockingBytecode, network),
    network: network.id,
  };
  saveVault(stored);
  return stored;
};

export const requestAssertion = async (stored: StoredVault, challenge: Uint8Array): Promise<Assertion> => {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge.buffer as ArrayBuffer,
      rpId: stored.rpId,
      userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: fromBase64url(stored.credentialId).buffer as ArrayBuffer }],
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('The device did not approve the send.');
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  };
};

const bufferToB64url = (data: ArrayBuffer): string => {
  const bytes = new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
