/**
 * Chipnet end to end: use already-funded test keys (or a faucet), fund one vault,
 * spend it with a software passkey (byte-exact WebAuthn), broadcast both transactions.
 * Secrets stay in .secrets/ (gitignored). This script never spends mainnet coins.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { decodePrivateKeyWif, encodePrivateKeyWif, generatePrivateKey, sha256, utf8ToBin } from '@bitauth/libauth';
import { NETWORKS } from '../src/network.js';
import { addressToLocking, lockingToAddress, p2pkhAddressFromPrivateKey } from '../src/address.js';
import {
  broadcastTransaction,
  getTransaction,
  utxosFromTransaction,
  utxosFromWatchtower,
  type ChainUtxo,
} from '../src/chain.js';
import { buildP2pkhSend } from '../src/p2pkh-send.js';
import { attachPasskeyUnlock, buildUnsignedVaultSpend, challengeForSpend } from '../src/vault-spend.js';
import { buildVault, type VaultParams } from '../src/covenant.js';
import { createSoftPasskey } from '../src/softAuthenticator.js';
import { claimFaucet } from './faucet.js';
import { claimNinja } from './ninja-faucet.js';

const network = NETWORKS.chipnet;
const RP_ID = 'chipnet-e2e.cubby.test';
const SECRETS_PATH = '/workspace/bch/cubby/.secrets/chipnet-e2e.json';
const KNOWN_FAUCET = process.env.FAUCET_TXID ?? '0f44dde17217258290fd77d4a926cde5d654503d49080fac811cfeeaa34bb149';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const decodeWif = (wif: string): Uint8Array => {
  const result = decodePrivateKeyWif(wif);
  if (typeof result === 'string') throw new Error(result);
  return result.privateKey;
};

const loadOrCreateKeys = async (): Promise<{ keyA: Uint8Array; keyB: Uint8Array }> => {
  try {
    const raw = JSON.parse(await readFile(SECRETS_PATH, 'utf8')) as { a?: { wif?: string }; b?: { wif?: string } };
    if (raw.a?.wif && raw.b?.wif) {
      const keyA = decodeWif(raw.a.wif);
      const keyB = decodeWif(raw.b.wif);
      console.log('Reusing existing chipnet e2e keys.');
      return { keyA, keyB };
    }
  } catch {
    /* create new keys */
  }
  const keyA = generatePrivateKey();
  const keyB = generatePrivateKey();
  await mkdir('/workspace/bch/cubby/.secrets', { recursive: true });
  const addrA = p2pkhAddressFromPrivateKey(keyA, network);
  const addrB = p2pkhAddressFromPrivateKey(keyB, network);
  await writeFile(
    SECRETS_PATH,
    JSON.stringify(
      {
        network: 'chipnet',
        createdAt: new Date().toISOString(),
        a: { address: addrA, wif: encodePrivateKeyWif(keyA, 'testnet') },
        b: { address: addrB, wif: encodePrivateKeyWif(keyB, 'testnet') },
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  return { keyA, keyB };
};

const waitForTx = async (txid: string, attempts = 45): Promise<void> => {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      await getTransaction(network, txid);
      return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      await sleep(2000);
    }
  }
  throw new Error(`Transaction ${txid} did not appear on the explorer: ${last}`);
};

const collectUtxos = async (address: string, hintTxids: string[] = []): Promise<ChainUtxo[]> => {
  const byKey = new Map<string, ChainUtxo>();
  try {
    for (const utxo of await utxosFromWatchtower(network, address)) {
      byKey.set(`${utxo.txid}:${utxo.vout}`, utxo);
    }
  } catch (error) {
    console.log(`Watchtower utxo lookup failed (${error instanceof Error ? error.message : String(error)}). Using the explorer.`);
  }
  for (const txid of hintTxids) {
    if (!/^[0-9a-f]{64}$/i.test(txid)) continue;
    try {
      for (const utxo of await utxosFromTransaction(network, txid, address)) {
        byKey.set(`${utxo.txid}:${utxo.vout}`, utxo);
      }
    } catch (error) {
      console.log(`Explorer does not yet have ${txid} for ${address}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return [...byKey.values()];
};

const waitForFunds = async (address: string, minSats: bigint, hintTxids: string[], attempts = 45): Promise<ChainUtxo[]> => {
  let lastTotal = 0n;
  let utxos: ChainUtxo[] = [];
  for (let i = 0; i < attempts; i++) {
    utxos = await collectUtxos(address, hintTxids);
    lastTotal = utxos.reduce((s, u) => s + u.satoshis, 0n);
    if (lastTotal >= minSats) return utxos;
    await sleep(2000);
  }
  throw new Error(`Address ${address} only has ${lastTotal} units after waiting (needed ${minSats}).`);
};

const claimWithRetry = async (address: string, label: string) => {
  for (let i = 0; i < 4; i++) {
    try {
      const result = await claimFaucet(address);
      console.log(`${label}: faucet sent ${result.amountSat} units in ${result.txid}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('429') ||
        message.includes('COOLDOWN') ||
        message.includes('IP_LIMIT') ||
        message.includes('DAILY_CAP') ||
        message.includes('502') ||
        message.includes('UPSTREAM') ||
        message.includes('fulcrum')
      ) {
        const wait = 20_000 * (i + 1);
        console.log(`${label}: faucet asked us to wait (${message.slice(0, 160)}). Sleeping ${wait / 1000}s.`);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${label}: faucet still rate limited after retries. Stopped rather than bypassing limits.`);
};

const fundFromApecs = async (addrA: string, addrB: string, keyB: Uint8Array): Promise<string> => {
  const claimA = await claimWithRetry(addrA, 'A');
  const claimB = await claimWithRetry(addrB, 'B');
  await waitForTx(claimA.txid);
  await waitForTx(claimB.txid);
  const utxosB = await waitForFunds(addrB, 1n, [claimB.txid], 30);
  const consolidate = buildP2pkhSend(keyB, utxosB, addressToLocking(addrA), 'all', addressToLocking(addrB));
  const consolidateId = await broadcastTransaction(network, consolidate.hex);
  console.log(`Consolidate B to A: ${consolidateId}`);
  await waitForTx(consolidateId);
  return consolidateId;
};

const main = async () => {
  const { keyA, keyB } = await loadOrCreateKeys();
  const addrA = p2pkhAddressFromPrivateKey(keyA, network);
  const addrB = p2pkhAddressFromPrivateKey(keyB, network);
  console.log(`Key A address: ${addrA}`);
  console.log(`Key B address: ${addrB}`);

  const needed = network.recommendedFundSats;
  let faucetTxid = KNOWN_FAUCET;
  let faucetSource = 'existing';

  let utxosA = await collectUtxos(addrA, [KNOWN_FAUCET]);
  let alreadyTotal = utxosA.reduce((s, u) => s + u.satoshis, 0n);
  if (alreadyTotal < needed) {
    console.log(`Waiting for faucet payment ${KNOWN_FAUCET} to appear (currently ${alreadyTotal} units).`);
    await waitForTx(KNOWN_FAUCET, 45);
    utxosA = await waitForFunds(addrA, needed, [KNOWN_FAUCET], 45);
    alreadyTotal = utxosA.reduce((s, u) => s + u.satoshis, 0n);
  }

  if (alreadyTotal >= needed) {
    console.log(`Address A already has ${alreadyTotal} units. Skipping faucet claims.`);
    faucetTxid = utxosA.find((u) => u.txid === KNOWN_FAUCET)?.txid ?? utxosA[0]?.txid ?? KNOWN_FAUCET;
    faucetSource = faucetTxid === KNOWN_FAUCET ? 'googol' : 'existing';
  } else if (process.env.SKIP_NINJA === '1') {
    console.log('Skipping Ninja (SKIP_NINJA=1). Using Apecs drips.');
    faucetSource = 'apecs';
    faucetTxid = await fundFromApecs(addrA, addrB, keyB);
    utxosA = await waitForFunds(addrA, needed, [KNOWN_FAUCET, faucetTxid], 45);
  } else {
    try {
      const ninja = await claimNinja(addrA, 25_000);
      console.log(`Ninja faucet claimed 25000 units, reported txid ${ninja.txid}`);
      faucetTxid = ninja.txid;
      faucetSource = 'ninja';
      utxosA = await waitForFunds(addrA, needed, [KNOWN_FAUCET, ninja.txid], 20);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Ninja faucet failed or did not appear (${message.slice(0, 200)}). Falling back to two Apecs drips.`);
      faucetSource = 'apecs';
      faucetTxid = await fundFromApecs(addrA, addrB, keyB);
      utxosA = await waitForFunds(addrA, needed, [KNOWN_FAUCET, faucetTxid], 45);
    }
  }

  console.log(`Address A funded with ${utxosA.reduce((s, u) => s + u.satoshis, 0n)} units across ${utxosA.length} output(s).`);

  const passkey = await createSoftPasskey(RP_ID);
  const params: VaultParams = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP_ID)) };
  const vault = buildVault(params);
  const vaultAddress = lockingToAddress(vault.lockingBytecode, network);
  console.log(`Vault address: ${vaultAddress}`);

  const fund = buildP2pkhSend(keyA, utxosA, vault.lockingBytecode, 'all', addressToLocking(addrA));
  const fundId = await broadcastTransaction(network, fund.hex);
  console.log(`Fund vault from A: ${fundId} (local ${fund.txid})`);
  await waitForTx(fundId);
  const vaultUtxos = await waitForFunds(vaultAddress, network.vaultSpendFeeSats + 546n, [fundId], 45);
  const combined = vaultUtxos.reduce((s, u) => s + u.satoshis, 0n);
  console.log(`Vault now has ${vaultUtxos.length} output(s) totalling ${combined} units.`);
  const chosen = vaultUtxos[0];
  if (chosen === undefined) throw new Error('Vault has no unspent output.');
  if (chosen.satoshis < network.vaultSpendFeeSats + 546n) {
    throw new Error(`Vault output is ${chosen.satoshis} units, below the ${network.vaultSpendFeeSats + 546n} needed for a spend.`);
  }

  const destLock = addressToLocking(addrA);
  const unsigned = buildUnsignedVaultSpend(network, chosen, destLock);
  const assertion = await passkey.assert(challengeForSpend(unsigned), { origin: `https://${RP_ID}` });
  const signed = attachPasskeyUnlock(vault, params, unsigned, chosen, assertion);
  const spendId = await broadcastTransaction(network, signed.hex);
  console.log(`Passkey spend: ${spendId} (local ${signed.txid}); unlocking ${signed.unlockingBytes} bytes`);
  await waitForTx(spendId);

  const report = {
    network: 'chipnet',
    finishedAt: new Date().toISOString(),
    vaultAddress,
    receiveAddress: addrA,
    faucet: faucetTxid,
    faucetSource,
    fund: fundId,
    spend: spendId,
    spendUnlockingBytes: signed.unlockingBytes,
    vaultOutputSatoshis: String(chosen.satoshis),
    explorer: {
      faucet: `https://chipnet.bchexplorer.info/tx/${faucetTxid}`,
      fund: `https://chipnet.bchexplorer.info/tx/${fundId}`,
      spend: `https://chipnet.bchexplorer.info/tx/${spendId}`,
    },
  };
  await mkdir('/workspace/bch/submission', { recursive: true });
  await writeFile('/workspace/bch/submission/chipnet-e2e.json', JSON.stringify(report, null, 2) + '\n');
  await mkdir('/workspace/bch/cubby/web/public', { recursive: true });
  await writeFile(
    '/workspace/bch/cubby/web/public/demo-proof.json',
    JSON.stringify(
      {
        network: 'chipnet',
        networkLabel: 'Test network',
        vaultAddress,
        faucetTxid,
        fundTxid: fundId,
        spendTxid: spendId,
        fund: fundId,
        spend: spendId,
        explorer: {
          faucet: `https://chipnet.bchexplorer.info/tx/${faucetTxid}`,
          fund: `https://chipnet.bchexplorer.info/tx/${fundId}`,
          spend: `https://chipnet.bchexplorer.info/tx/${spendId}`,
        },
        note: 'Completed test network spend from the chipnet end to end script. This is a new project; there is no earlier demo or repo.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
