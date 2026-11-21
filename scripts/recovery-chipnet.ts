/**
 * Chipnet run of the "never stuck" backup (docs/BACKUP-RECOVERY.md), with test coins only.
 *  1. Fund two coins into a box that has a backup wallet (delay: 1 block).
 *  2. Spend coin 2 with the passkey at once (passkey path, sequence 0).
 *  3. Try the recovery spend of coin 1 before it confirms: the node must refuse it (BIP68).
 *  4. After coin 1 has a confirmation, the recovery spend goes through, paying only the backup.
 * Reuses the existing chipnet test keys in .secrets/ (never printed). Never touches mainnet.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { decodePrivateKeyWif, sha256, utf8ToBin } from '@bitauth/libauth';
import { NETWORKS } from '../src/network.js';
import { addressToLocking, lockingToAddress, p2pkhAddressFromPrivateKey } from '../src/address.js';
import { broadcastTransaction, getTransaction, utxosFromTransaction, utxosFromWatchtower, type ChainUtxo } from '../src/chain.js';
import { buildP2pkhSend } from '../src/p2pkh-send.js';
import { attachPasskeyUnlock, buildUnsignedVaultSpend, challengeForSpend } from '../src/vault-spend.js';
import { buildVault, type VaultParams } from '../src/covenant.js';
import { buildRecoverySpend } from '../src/recovery.js';
import { createSoftPasskey } from '../src/softAuthenticator.js';

const network = NETWORKS.chipnet;
if (network.id !== 'chipnet') throw new Error('chipnet only');
const RP_ID = 'chipnet-backup.cubby.test';
const SECRETS_PATH = '/workspace/bch/cubby/.secrets/chipnet-e2e.json';
const OUT = '/workspace/bch/submission/judge-evidence/backup-recovery-chipnet.json';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RECOVERY_COIN = 4_000n;
const PASSKEY_COIN = 12_500n;

const wifKey = (wif: string): Uint8Array => {
  const r = decodePrivateKeyWif(wif);
  if (typeof r === 'string') throw new Error(r);
  return r.privateKey;
};

const coinsOf = async (address: string, hint: string[] = []): Promise<ChainUtxo[]> => {
  const m = new Map<string, ChainUtxo>();
  try { for (const u of await utxosFromWatchtower(network, address)) m.set(`${u.txid}:${u.vout}`, u); } catch { /* explorer below */ }
  for (const t of hint) { try { for (const u of await utxosFromTransaction(network, t, address)) m.set(`${u.txid}:${u.vout}`, u); } catch { /* not yet */ } }
  return [...m.values()];
};

const waitSeen = async (txid: string) => {
  for (let i = 0; i < 60; i++) { try { return await getTransaction(network, txid); } catch { await sleep(2000); } }
  throw new Error(`${txid} never appeared`);
};

const main = async () => {
  const raw = JSON.parse(await readFile(SECRETS_PATH, 'utf8')) as { a: { wif: string }; b: { wif: string } };
  const keyA = wifKey(raw.a.wif);
  const keyB = wifKey(raw.b.wif);
  const addrA = p2pkhAddressFromPrivateKey(keyA, network);
  const addrB = p2pkhAddressFromPrivateKey(keyB, network);
  let payer = keyA; let payerAddr = addrA;
  const hints = process.env.FUND_TXID ? [process.env.FUND_TXID] : [];
  let coins = await coinsOf(addrA, hints);
  const total = (c: ChainUtxo[]) => c.reduce((s, u) => s + u.satoshis, 0n);
  if (total(coins) < RECOVERY_COIN + PASSKEY_COIN + 2_000n) { payer = keyB; payerAddr = addrB; coins = await coinsOf(addrB); }
  console.log(`Payer ${payerAddr} holds ${total(coins)} test units in ${coins.length} coin(s).`);
  if (total(coins) < RECOVERY_COIN + PASSKEY_COIN + 2_000n) throw new Error('Not enough chipnet test coins; stopping (no faucet use from this script).');

  const backupAddress = payerAddr === addrA ? addrB : addrA;
  const passkey = await createSoftPasskey(RP_ID);
  const params: VaultParams = {
    publicKey: passkey.publicKey,
    rpIdHash: sha256.hash(utf8ToBin(RP_ID)),
    backup: { lockingBytecode: addressToLocking(backupAddress), delayBlocks: 1 },
  };
  const vault = buildVault(params);
  const box = lockingToAddress(vault.lockingBytecode, network);
  console.log(`Box with backup: ${box} (redeem ${vault.redeemBytecode.length} B); backup wallet ${backupAddress}; delay 1 block`);

  const f1 = buildP2pkhSend(payer, coins, vault.lockingBytecode, RECOVERY_COIN, addressToLocking(payerAddr));
  const fund1 = await broadcastTransaction(network, f1.hex);
  console.log(`Fund coin 1 (for recovery): ${fund1}`);
  await waitSeen(fund1);
  const change = (await coinsOf(payerAddr, [fund1])).filter((u) => u.txid === fund1);
  const f2 = buildP2pkhSend(payer, change, vault.lockingBytecode, PASSKEY_COIN, addressToLocking(payerAddr));
  const fund2 = await broadcastTransaction(network, f2.hex);
  console.log(`Fund coin 2 (for passkey): ${fund2}`);
  await waitSeen(fund2);

  const boxCoins = await coinsOf(box, [fund1, fund2]);
  const c1 = boxCoins.find((u) => u.txid === fund1);
  const c2 = boxCoins.find((u) => u.txid === fund2);
  if (!c1 || !c2) throw new Error('box coins not found');

  // Passkey path, right away.
  const unsigned = buildUnsignedVaultSpend(network, c2, addressToLocking(payerAddr));
  const assertion = await passkey.assert(challengeForSpend(unsigned), { origin: `https://${RP_ID}` });
  const signed = attachPasskeyUnlock(vault, params, unsigned, c2, assertion);
  const passkeySpend = await broadcastTransaction(network, signed.hex);
  console.log(`Passkey spend with backup on: ${passkeySpend} (unlocking ${signed.unlockingBytes} B)`);

  // Recovery path, too early.
  const rec = buildRecoverySpend(vault, params, { txid: c1.txid, vout: c1.vout, satoshis: c1.satoshis }, 1_500n);
  // Ask the node directly so its own refusal reason is recorded.
  const early = await fetch(`${network.watchtowerBase}/broadcast/`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: rec.hex }),
  });
  const earlyRefusal = `${early.status} ${(await early.text()).slice(0, 300)}`;
  console.log(`Early recovery attempt: ${earlyRefusal}`);
  if (/"success"\s*:\s*true|"txid"/u.test(earlyRefusal)) throw new Error('UNEXPECTED: early recovery accepted');

  // Wait for coin 1 to confirm, then recover.
  let recovery = '';
  for (let i = 0; i < 360 && !recovery; i++) {
    const tx = await getTransaction(network, fund1).catch(() => null);
    if ((tx?.confirmations ?? 0) >= 1) {
      try { recovery = await broadcastTransaction(network, rec.hex); }
      catch (e) { console.log(`Recovery not accepted yet: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`); }
    }
    if (!recovery) await sleep(10_000);
  }
  if (!recovery) throw new Error('coin 1 did not confirm in an hour');
  console.log(`Recovery spend to backup: ${recovery} (${rec.bytes} B, fee 1500)`);

  const ex = (t: string) => `https://chipnet.bchexplorer.info/tx/${t}`;
  const report = {
    network: 'chipnet', finishedAt: new Date().toISOString(), box, backupAddress, delayBlocks: 1,
    redeemBytes: vault.redeemBytecode.length,
    fundRecoveryCoin: fund1, fundPasskeyCoin: fund2,
    passkeySpend, passkeyUnlockingBytes: signed.unlockingBytes,
    earlyRecoveryRefused: earlyRefusal.slice(0, 300),
    recoverySpend: recovery, recoveryTxBytes: rec.bytes,
    explorer: { fundRecoveryCoin: ex(fund1), fundPasskeyCoin: ex(fund2), passkeySpend: ex(passkeySpend), recoverySpend: ex(recovery) },
  };
  await mkdir('/workspace/bch/submission/judge-evidence', { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
};

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
