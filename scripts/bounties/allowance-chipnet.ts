/**
 * Chipnet run of the SolidCash Cubby Allowance jar, owned by a Cubby passkey vault.
 * Steps (resumable; public txids land in docs/proofs/allowance-chipnet.json):
 *   1 fund    key A pays the demo Cubby vault and a new allowance jar
 *   2 manage  the owner tops up the jar: Cubby vault (passkey checked on chain) + jar in one transaction
 *   3 claim   after one block, the allowance is pulled to the child (key B), rest back to the jar
 * Never touches mainnet: network is chipnet and broadcast is guarded by src/network.ts.
 */
import { addressToLocking, lockingToAddress } from '../../src/address.js';
import { buildVault, type VaultParams } from '../../src/covenant.js';
import { keyedPasskey } from '../../src/bounties/keyed-passkey.js';
import { attachManage, buildClaim, buildJar, manageChallenge, unsignedManage, type JarParams } from '../../src/bounties/allowance.js';
import { sha256, utf8ToBin } from '@bitauth/libauth';
import {
  broadcast,
  loadDemoPasskeyKey,
  loadE2eKeys,
  loadProof,
  network,
  saveProof,
  signP2pkh,
  utxoAt,
  waitConfirmed,
  waitSeen,
} from './lib.js';

const RP_ID = 'bounties.cubby.test';
const START = { txid: '2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993', vout: 0 };
const VAULT_FUND = 150_000n;
const JAR_FUND = 60_000n;
const TOP_UP_TO = 100_000n;
const VAULT_FEE = 12_000n;

interface Proof {
  network: string;
  vaultAddress?: string;
  jarAddress?: string;
  childAddress?: string;
  params?: { allowance: string; periodBlocks: string };
  fund?: string;
  manage?: string;
  manageUnlockingBytes?: number;
  claim?: string;
  notes: string[];
}

const main = async () => {
  const { keyA, addrA, addrB } = await loadE2eKeys();
  const passkey = keyedPasskey(await loadDemoPasskeyKey('allowance-owner'), RP_ID);
  const vaultParams: VaultParams = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP_ID)) };
  const vault = buildVault(vaultParams);
  const vaultAddress = lockingToAddress(vault.lockingBytecode, network);
  const params: JarParams = { ownerVaultLock: vault.lockingBytecode, childLock: addressToLocking(addrB), allowance: 20_000n, periodBlocks: 1n };
  const jar = buildJar(params);
  const jarAddress = lockingToAddress(jar.lockingBytecode, network);
  const proof = await loadProof<Proof>('allowance-chipnet.json', { network: 'chipnet', notes: [] });
  Object.assign(proof, { vaultAddress, jarAddress, childAddress: addrB, params: { allowance: '20000', periodBlocks: '1' } });
  console.log({ vaultAddress, jarAddress, child: addrB });

  if (!proof.fund) {
    const start = await utxoAt(START.txid, START.vout, addrA);
    const fee = 400n;
    const change = start.satoshis - VAULT_FUND - JAR_FUND - fee;
    const signed = signP2pkh(keyA, [start], [
      { lockingBytecode: vault.lockingBytecode, valueSatoshis: VAULT_FUND },
      { lockingBytecode: jar.lockingBytecode, valueSatoshis: JAR_FUND },
      { lockingBytecode: addressToLocking(addrA), valueSatoshis: change },
    ]);
    proof.fund = await broadcast('fund', signed.hex);
    await saveProof('allowance-chipnet.json', proof);
    await waitSeen(proof.fund);
  }

  if (!proof.manage) {
    const vaultUtxo = await utxoAt(proof.fund, 0, vaultAddress);
    const jarUtxo = await utxoAt(proof.fund, 1, jarAddress);
    const outputs = [
      { lockingBytecode: jar.lockingBytecode, valueSatoshis: TOP_UP_TO },
      { lockingBytecode: vault.lockingBytecode, valueSatoshis: vaultUtxo.satoshis + jarUtxo.satoshis - TOP_UP_TO - VAULT_FEE },
    ];
    const unsigned = unsignedManage(vaultUtxo, jarUtxo, outputs);
    const assertion = passkey.assert(manageChallenge(unsigned));
    const built = attachManage(vault, vaultParams, params, unsigned, vaultUtxo, jarUtxo, assertion);
    proof.manageUnlockingBytes = built.tx.inputs[0]!.unlockingBytecode.length;
    proof.manage = await broadcast('manage (top up, passkey approved)', built.hex);
    await saveProof('allowance-chipnet.json', proof);
    await waitSeen(proof.manage);
  }

  if (!proof.claim) {
    await waitConfirmed(proof.manage, 1, 90);
    const jarUtxo = await utxoAt(proof.manage, 0, jarAddress);
    const built = buildClaim(params, jarUtxo);
    proof.claim = await broadcast('claim (allowance to child)', built.hex);
    await saveProof('allowance-chipnet.json', proof);
  }
  await saveProof('allowance-chipnet.json', proof);
  console.log(JSON.stringify(proof, null, 2));
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
