/**
 * Chipnet end to end: faucet two test keys, fund one vault, spend it with a
 * software passkey (byte-exact WebAuthn), broadcast both transactions.
 * Secrets stay in .secrets/ (gitignored). This script never spends mainnet coins.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { decodePrivateKeyWif, encodePrivateKeyWif, generatePrivateKey, sha256, utf8ToBin } from '@bitauth/libauth';
import { NETWORKS } from '../src/network.js';
import { addressToLocking, lockingToAddress, p2pkhAddressFromPrivateKey } from '../src/address.js';
import { broadcastTransaction, getTransaction, utxosFromTransaction, utxosFromWatchtower } from '../src/chain.js';
import { buildP2pkhSend } from '../src/p2pkh-send.js';
import { attachPasskeyUnlock, buildUnsignedVaultSpend, challengeForSpend } from '../src/vault-spend.js';
import { buildVault, type VaultParams } from '../src/covenant.js';
import { createSoftPasskey } from '../src/softAuthenticator.js';
import { claimFaucet } from './faucet.js';
import { claimNinja } from './ninja-faucet.js';

const network = NETWORKS.chipnet;
const RP_ID = 'chipnet-e2e.cubby.test';
const SECRETS_PATH = '/workspace/bch/cubby/.secrets/chipnet-e2e.json';
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

const waitForTx = async (txid: string, attempts = 30): Promise<void> => {
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

const waitForUtxo = async (txid: string, address: string, attempts = 20) => {
  for (let i = 0; i < attempts; i++) {
    const utxos = await utxosFromTransaction(network, txid, address);
    if (utxos.length > 0) return utxos;
    await sleep(2000);
  }
  throw new Error(`No unspent output for ${address} in ${txid} yet.`);
};

const waitForAddressFunds = async (address: string, minSats: bigint, attempts = 30) => {
  let lastTotal = 0n;
  for (let i = 0; i < attempts; i++) {
    const utxos = await utxosFromWatchtower(network, address);
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
  const utxosB = await waitForUtxo(claimB.txid, addrB);
  const consolidate = buildP2pkhSend(keyB, utxosB, addressToLocking(addrA), 'all', addressToLocking(addrB));
  const consolidateId = await broadcastTransaction(network, consolidate.hex);
  console.log(`Consolidate B to A: ${consolidateId}`);
  await waitForTx(consolidateId);
  await waitForUtxo(claimA.txid, addrA);
  return consolidateId;
};

const main = async () => {
  const { keyA, keyB } = await loadOrCreateKeys();
  const addrA = p2pkhAddressFromPrivateKey(keyA, network);
  const addrB = p2pkhAddressFromPrivateKey(keyB, network);
  console.log(`Key A address: ${addrA}`);
  console.log(`Key B address: ${addrB}`);

  const needed = network.recommendedFundSats;
  let faucetTxid = '';
  let faucetSource = 'existing';
  const already = await utxosFromWatchtower(network, addrA);
  const alreadyTotal = already.reduce((s, u) => s + u.satoshis, 0n);
  if (alreadyTotal >= needed) {
    console.log(`Address A already has ${alreadyTotal} units. Skipping faucet.`);
    faucetTxid = already[0]?.txid ?? 'existing';
  } else if (process.env.SKIP_NINJA !== '1') {
    try {
      const ninja = await claimNinja(addrA, 25_000);
      console.log(`Ninja faucet claimed 25000 units, reported txid ${ninja.txid}`);
      faucetTxid = ninja.txid;
      faucetSource = 'ninja';
      try {
        await waitForAddressFunds(addrA, needed, 20);
      } catch {
        console.log('Ninja txid did not appear on Watchtower. Falling back to Apecs drips.');
        faucetSource = 'apecs';
        faucetTxid = await fundFromApecs(addrA, addrB, keyB);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Ninja faucet failed (${message.slice(0, 200)}). Falling back to two Apecs drips.`);
      faucetSource = 'apecs';
      faucetTxid = await fundFromApecs(addrA, addrB, keyB);
    }
  } else {
    console.log('Skipping Ninja (SKIP_NINJA=1). Using Apecs drips.');
    faucetSource = 'apecs';
    faucetTxid = await fundFromApecs(addrA, addrB, keyB);
  }

  const utxosA = await waitForAddressFunds(addrA, needed, 30);
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
  const vaultUtxos = await waitForAddressFunds(vaultAddress, network.vaultSpendFeeSats + 546n, 30);
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
        vaultAddress,
        fundTxid: fundId,
        spendTxid: spendId,
        explorer: report.explorer,
        note: 'Completed test spend from the chipnet end to end script. This is a new project; there is no earlier demo or repo.',
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
