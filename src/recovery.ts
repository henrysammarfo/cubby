/**
 * "Never stuck" backup: build the no-passkey recovery spend for a vault coin
 * that has sat still for the backup delay. See docs/BACKUP-RECOVERY.md.
 */
import {
  encodeDataPush,
  encodeTransactionBch,
  flattenBinArray,
  hashTransaction,
  type Output,
  type TransactionBch,
  hexToBin,
} from '@bitauth/libauth';
import { RECOVERY_MAX_FEE_SATS, type Vault, type VaultParams } from './covenant.js';
import { DUST_SATS } from './network.js';

/** Average block interval on Bitcoin Cash. */
export const BLOCK_MINUTES = 10;

/** Plain English delay choices offered in Settings. */
export const BACKUP_DELAYS = [
  { blocks: 4_320, label: '1 month' },
  { blocks: 12_960, label: '3 months' },
  { blocks: 26_280, label: '6 months' },
  { blocks: 52_560, label: '1 year' },
] as const;

export const delayLabel = (blocks: number): string =>
  BACKUP_DELAYS.find((d) => d.blocks === blocks)?.label ?? `${blocks.toLocaleString()} blocks (about ${Math.round((blocks * BLOCK_MINUTES) / 60 / 24)} days)`;

/** Unlocking bytecode for the recovery branch: an empty selector, then the redeem script. */
export const recoveryUnlocking = (vault: Vault): Uint8Array =>
  flattenBinArray([encodeDataPush(new Uint8Array()), encodeDataPush(vault.redeemBytecode)]);

export interface RecoveryCoin {
  readonly txid: string;
  readonly vout: number;
  readonly satoshis: bigint;
  readonly token?: Output['token'];
}

/**
 * One input, one output to the backup wallet. Version 2 and the delay in the
 * sequence number turn on the BIP68 relative lock that OP_CHECKSEQUENCEVERIFY checks.
 */
export const buildRecoverySpend = (
  vault: Vault,
  params: VaultParams,
  coin: RecoveryCoin,
  feeSats = 1_500n,
): { tx: TransactionBch; hex: string; txid: string; bytes: number } => {
  const backup = params.backup;
  if (!backup) throw new Error('This box has no backup wallet.');
  if (feeSats < 0n || feeSats > RECOVERY_MAX_FEE_SATS) throw new Error(`The fee must be between 0 and ${RECOVERY_MAX_FEE_SATS} units.`);
  const value = coin.satoshis - feeSats;
  if (value < DUST_SATS) throw new Error('This coin is too small to move to the backup wallet.');
  const output: Output = { lockingBytecode: backup.lockingBytecode, valueSatoshis: value, ...(coin.token ? { token: coin.token } : {}) };
  const tx: TransactionBch = {
    version: 2,
    locktime: 0,
    inputs: [
      {
        outpointTransactionHash: hexToBin(coin.txid),
        outpointIndex: coin.vout,
        sequenceNumber: backup.delayBlocks,
        unlockingBytecode: recoveryUnlocking(vault),
      },
    ],
    outputs: [output],
  };
  const encoded = encodeTransactionBch(tx);
  return { tx, hex: Buffer.from(encoded).toString('hex'), txid: hashTransaction(encoded), bytes: encoded.length };
};

/**
 * Recovery note: everything needed to rebuild the box script on any device,
 * with no secrets in it (a public key, the site, the backup address and the wait).
 * Knowing it only lets someone push coins to the backup wallet after the wait.
 */
export interface RecoveryNote {
  readonly network: 'chipnet' | 'mainnet';
  readonly rpId: string;
  readonly publicKeyX: string;
  readonly publicKeyY: string;
  readonly backupAddress: string;
  readonly delayBlocks: number;
}

export const NOTE_PREFIX = 'cubby-recovery-v1:';

const HEX64 = /^[0-9a-f]{64}$/u;
const RP = /^[a-z0-9.-]{1,253}$/u;

export const encodeRecoveryNote = (note: RecoveryNote): string =>
  NOTE_PREFIX + [note.network, note.rpId, note.publicKeyX, note.publicKeyY, note.backupAddress, String(note.delayBlocks)].join('/');

/** Parse and check a pasted note. Returns a plain English reason when it is not valid. */
export const decodeRecoveryNote = (text: string): RecoveryNote | string => {
  const t = text.trim();
  if (!t.startsWith(NOTE_PREFIX)) return 'That is not a Cubby recovery note. It starts with cubby-recovery-v1:';
  const parts = t.slice(NOTE_PREFIX.length).split('/');
  if (parts.length !== 6) return 'This recovery note is incomplete. Paste the whole note.';
  const [network, rpId, x, y, backupAddress, delay] = parts as [string, string, string, string, string, string];
  if (network !== 'chipnet' && network !== 'mainnet') return 'This recovery note names an unknown network.';
  if (!RP.test(rpId)) return 'This recovery note has a broken site name.';
  if (!HEX64.test(x) || !HEX64.test(y)) return 'This recovery note has a broken key. Paste the whole note.';
  const delayBlocks = Number(delay);
  if (!Number.isInteger(delayBlocks) || delayBlocks < 1 || delayBlocks > 0xffff) return 'This recovery note has a broken wait time.';
  return { network, rpId, publicKeyX: x, publicKeyY: y, backupAddress, delayBlocks };
};
