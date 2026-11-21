/** Move every coin of a box with a backup to the backup wallet (anyone may do this after the wait). */
import { sha256, utf8ToBin } from '@bitauth/libauth';
import { addressToLocking, lockingToAddress } from '../src/address.js';
import { broadcastTransaction, utxosFromApi } from '../src/chain.js';
import { buildVault, type Vault, type VaultParams } from '../src/covenant.js';
import { getNetwork, type Network } from '../src/network.js';
import { buildRecoverySpend, delayLabel, type RecoveryNote } from '../src/recovery.js';

export const RECOVERY_FEE_SATS = 1_500n;

export const boxFromNote = (note: RecoveryNote): { params: VaultParams; vault: Vault; network: Network; address: string } => {
  const network = getNetwork(note.network);
  const params: VaultParams = {
    publicKey: { x: BigInt(`0x${note.publicKeyX}`), y: BigInt(`0x${note.publicKeyY}`) },
    rpIdHash: sha256.hash(utf8ToBin(note.rpId)),
    backup: { lockingBytecode: addressToLocking(note.backupAddress), delayBlocks: note.delayBlocks },
  };
  const vault = buildVault(params);
  return { params, vault, network, address: lockingToAddress(vault.lockingBytecode, network) };
};

export interface MoveResult {
  readonly moved: string[];
  readonly early: number;
  readonly total: number;
}

export const moveToBackup = async (network: Network, params: VaultParams, vault: Vault, boxAddress: string): Promise<MoveResult> => {
  if (!params.backup) throw new Error('This box has no backup wallet.');
  if (!network.allowBroadcast) throw new Error('Sending on the main network stays off until it is approved.');
  const utxos = await utxosFromApi(boxAddress, network);
  if (utxos === null) throw new Error('Could not check the box right now. Try again in a moment.');
  if (utxos.length === 0) throw new Error('The box is empty. There is nothing to move.');
  const moved: string[] = [];
  let early = 0;
  for (const u of utxos) {
    if (u.satoshis < RECOVERY_FEE_SATS + 546n) continue;
    const { hex } = buildRecoverySpend(vault, params, { txid: u.txid, vout: u.vout, satoshis: u.satoshis }, RECOVERY_FEE_SATS);
    try {
      moved.push(await broadcastTransaction(network, hex));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/BIP68|non-final|final|all failed/iu.test(m)) early++;
      else throw e;
    }
  }
  return { moved, early, total: utxos.length };
};

export const describeMove = (r: MoveResult, delayBlocks: number): { ok: string | null; wait: string | null } => ({
  ok: r.moved.length > 0 ? `Moved ${r.moved.length} coin${r.moved.length === 1 ? '' : 's'} to the backup wallet.` : null,
  wait:
    r.early > 0
      ? `Not yet. ${r.early === r.total ? 'The coins' : `${r.early} coin${r.early === 1 ? '' : 's'}`} can move once the box has gone unused for ${delayLabel(delayBlocks)}.`
      : null,
});
