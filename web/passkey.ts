import { sha256, utf8ToBin } from '@bitauth/libauth';
import { buildVault, type Vault, type VaultParams } from '../src/covenant.js';
import {
  assertAuthenticatorFlags,
  decodeUncompressed,
  fromBase64url,
  publicKeyFromAttestationObject,
  splitClientData,
  toArrayBuffer,
  type Assertion,
} from '../src/webauthn.js';
import { addressToLocking, lockingToAddress } from '../src/address.js';
import { getNetwork, type Network } from '../src/network.js';

const STORE = 'cubby-vault-v1';
const CREATE_TIMEOUT_MS = 60_000;
const ASSERT_TIMEOUT_MS = 60_000;

export interface StoredVault {
  readonly credentialId: string;
  readonly publicKeyX: string;
  readonly publicKeyY: string;
  readonly rpId: string;
  readonly address: string;
  readonly network: string;
  /** Optional "never stuck" backup wallet (docs/BACKUP-RECOVERY.md). Changes the box address. */
  readonly backup?: StoredBackup;
}

export interface StoredBackup {
  readonly address: string;
  readonly delayBlocks: number;
}

const rpId = (): string => location.hostname;

export const currentRpId = rpId;

const withTimeout = async <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const explainWebAuthnError = (error: unknown, kind: 'create' | 'approve'): string => {
  if (error instanceof Error) {
    const name = error.name;
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return kind === 'create'
        ? 'The phone lock was cancelled, or it timed out. Try again.'
        : 'The send was cancelled, or the phone lock timed out. Try again.';
    }
    if (name === 'InvalidStateError') {
      return 'A phone lock for this site already exists on this device. Open the box instead, or remove the old lock in the browser settings and try again.';
    }
    if (name === 'NotSupportedError' || name === 'NotReadableError') {
      return 'This browser cannot use a face or fingerprint lock. Open this site in a current Safari, Chrome, or Edge window, on a device with a screen lock.';
    }
    if (name === 'SecurityError') {
      return 'This page is not allowed to use the phone lock. Open the live site at cubby-liart-six.vercel.app (not a preview link) and try again.';
    }
    if (error.message) return error.message;
  }
  return 'Something went wrong with the phone lock. Try again.';
};

const assertPasskeyAvailable = async (): Promise<void> => {
  if (!window.isSecureContext || !navigator.credentials || typeof window.PublicKeyCredential === 'undefined') {
    throw new Error('This browser cannot create a phone lock. Open this site in a current Safari, Chrome, or Edge window over HTTPS, on a device with a screen lock.');
  }
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      throw new Error('This device does not have a face or fingerprint lock the site can use. Open this page on a phone, or a computer with Windows Hello or Touch ID.');
    }
  }
};

export const loadVault = (): StoredVault | null => {
  const raw = localStorage.getItem(STORE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredVault;
    if (!parsed.credentialId || !parsed.publicKeyX || !parsed.publicKeyY || !parsed.rpId || !parsed.address) return null;
    if (!parsed.backup) return parsed;
    // With a backup the address is derived from the script, never trusted from storage.
    const network = getNetwork(parsed.network);
    try {
      return { ...parsed, address: lockingToAddress(vaultFromStored(parsed).vault.lockingBytecode, network) };
    } catch {
      const { backup: _bad, ...rest } = parsed;
      return { ...rest, address: lockingToAddress(vaultFromStored(rest).vault.lockingBytecode, network) };
    }
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
    ...(stored.backup
      ? { backup: { lockingBytecode: addressToLocking(stored.backup.address), delayBlocks: stored.backup.delayBlocks } }
      : {}),
  };
  return { params, vault: buildVault(params) };
};

/**
 * Turn the backup on, change it, or turn it off. The box gets a new address,
 * so the caller must only do this while the box is empty.
 */
export const setVaultBackup = (stored: StoredVault, backup: StoredBackup | null, network: Network): StoredVault => {
  const { backup: _old, ...rest } = stored;
  const next: StoredVault = backup ? { ...rest, backup } : rest;
  const { vault } = vaultFromStored(next);
  const updated: StoredVault = { ...next, address: lockingToAddress(vault.lockingBytecode, network) };
  saveVault(updated);
  return updated;
};

const pointFromAttestation = (attestation: AuthenticatorAttestationResponse): { x: bigint; y: bigint } => {
  if (typeof attestation.getPublicKey === 'function') {
    const spki = attestation.getPublicKey();
    if (spki) return decodeUncompressed(new Uint8Array(spki));
  }
  // Safari can omit getPublicKey(); the key is still in the attestation object at creation.
  if (attestation.attestationObject) {
    return publicKeyFromAttestationObject(new Uint8Array(attestation.attestationObject));
  }
  throw new Error('The device did not return a public key. Try a current version of Safari, Chrome, or Edge, and keep this tab open until the lock is created.');
};

export const createDeviceLock = async (network: Network): Promise<StoredVault> => {
  await assertPasskeyAvailable();
  const id = location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  let credential: PublicKeyCredential | null;
  try {
    credential = (await withTimeout(
      navigator.credentials.create({
        publicKey: {
          rp: { name: 'Cubby', id },
          user: { id: toArrayBuffer(userId), name: 'cubby', displayName: 'Cubby' },
          challenge: toArrayBuffer(challenge),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            requireResidentKey: false,
            userVerification: 'required',
          },
          timeout: CREATE_TIMEOUT_MS,
          attestation: 'none',
        },
      }),
      CREATE_TIMEOUT_MS + 2_000,
      'The device did not finish creating a lock. Check the screen lock prompt, or try again.',
    )) as PublicKeyCredential | null;
  } catch (error) {
    throw new Error(explainWebAuthnError(error, 'create'));
  }
  if (!credential) throw new Error('The device did not create a lock.');
  const attestation = credential.response as AuthenticatorAttestationResponse;
  const point = pointFromAttestation(attestation);
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

export const assertVaultOrigin = (stored: Pick<StoredVault, 'rpId'>, hostname: string): void => {
  if (stored.rpId !== hostname) {
    throw new Error('This box was created on a different website address. Open the original site, or create a new box here.');
  }
};

export const requestAssertion = async (stored: StoredVault, challenge: Uint8Array): Promise<Assertion> => {
  await assertPasskeyAvailable();
  assertVaultOrigin(stored, location.hostname);
  let credential: PublicKeyCredential | null;
  try {
    credential = (await withTimeout(
      navigator.credentials.get({
        publicKey: {
          challenge: toArrayBuffer(challenge),
          rpId: stored.rpId,
          userVerification: 'required',
          timeout: ASSERT_TIMEOUT_MS,
          allowCredentials: [{ type: 'public-key', id: toArrayBuffer(fromBase64url(stored.credentialId)) }],
        },
      }),
      ASSERT_TIMEOUT_MS + 2_000,
      'The device did not finish approving the send. Check the screen lock prompt, or try again.',
    )) as PublicKeyCredential | null;
  } catch (error) {
    throw new Error(explainWebAuthnError(error, 'approve'));
  }
  if (!credential) throw new Error('The device did not approve the send.');
  const response = credential.response as AuthenticatorAssertionResponse;
  const assertion: Assertion = {
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  };
  const rpIdHash = sha256.hash(utf8ToBin(stored.rpId));
  assertAuthenticatorFlags(assertion.authenticatorData, rpIdHash);
  splitClientData(assertion.clientDataJSON, challenge);
  return assertion;
};

const bufferToB64url = (data: ArrayBuffer): string => {
  const bytes = new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
