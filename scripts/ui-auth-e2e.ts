/**
 * Chromium virtual-authenticator path through the real UI, then a chipnet
 * fund and spend. Secrets stay in .secrets/ and are never printed.
 * Never spends mainnet coins.
 */
import { chromium } from 'playwright';
import { decodePrivateKeyWif } from '@bitauth/libauth';
import { readFile } from 'node:fs/promises';
import { NETWORKS } from '../src/network.js';
import { addressToLocking, p2pkhAddressFromPrivateKey } from '../src/address.js';
import { broadcastTransaction, getTransaction, utxosFromWatchtower, utxosFromTransaction, type ChainUtxo } from '../src/chain.js';
import { buildP2pkhSend } from '../src/p2pkh-send.js';
import { claimFaucet } from './faucet.js';
import { claimNinja } from './ninja-faucet.js';

const BASE = process.env.CUBBY_URL ?? 'http://localhost:4173';
const CHROME = '/usr/bin/google-chrome';
const SECRETS_PATH = '/workspace/bch/cubby/.secrets/chipnet-e2e.json';
const network = NETWORKS.chipnet;
const FUND_SATS = network.recommendedFundSats;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const decodeWif = (wif: string): Uint8Array => {
  const result = decodePrivateKeyWif(wif);
  if (typeof result === 'string') throw new Error(result);
  return result.privateKey;
};

const loadKeys = async (): Promise<{ keyA: Uint8Array; addrA: string; addrB: string }> => {
  const raw = JSON.parse(await readFile(SECRETS_PATH, 'utf8')) as { a: { wif: string; address: string }; b: { address: string } };
  const keyA = decodeWif(raw.a.wif);
  return { keyA, addrA: raw.a.address, addrB: raw.b.address };
};

const collectUtxos = async (address: string, hintTxids: string[] = []): Promise<ChainUtxo[]> => {
  const byKey = new Map<string, ChainUtxo>();
  try {
    for (const utxo of await utxosFromWatchtower(network, address)) byKey.set(`${utxo.txid}:${utxo.vout}`, utxo);
  } catch {
    /* explorer fallback below */
  }
  for (const txid of hintTxids) {
    try {
      for (const utxo of await utxosFromTransaction(network, txid, address)) byKey.set(`${utxo.txid}:${utxo.vout}`, utxo);
    } catch {
      /* not visible yet */
    }
  }
  return [...byKey.values()];
};

const waitForFunds = async (address: string, minSats: bigint, hintTxids: string[], attempts = 40): Promise<ChainUtxo[]> => {
  let last = 0n;
  for (let i = 0; i < attempts; i++) {
    const utxos = await collectUtxos(address, hintTxids);
    last = utxos.reduce((s, u) => s + u.satoshis, 0n);
    if (last >= minSats) return utxos;
    await sleep(2000);
  }
  throw new Error(`Address did not reach ${minSats} units (had ${last}).`);
};

const fundAddress = async (dest: string, keys: { keyA: Uint8Array; addrA: string }): Promise<string> => {
  const have = await collectUtxos(keys.addrA);
  const total = have.reduce((s, u) => s + u.satoshis, 0n);
  if (total < FUND_SATS + 2000n) {
    console.log('Existing test key has no spendable coins. Asking a test faucet for a P2PKH drip (no captcha bypass).');
    let faucetTxid = '';
    let faucetAmt = 0n;
    try {
      const claimed = await claimFaucet(keys.addrA);
      faucetTxid = claimed.txid;
      faucetAmt = claimed.amountSat;
      console.log(`Apecs accepted a drip of ${claimed.amountSat} units to the test key. ${claimed.txid}`);
    } catch (apecsError) {
      const reason = apecsError instanceof Error ? apecsError.message : String(apecsError);
      console.log(`Apecs was unavailable (${reason.slice(0, 180)}). Trying the Ninja faucet.`);
      const ninja = await claimNinja(keys.addrA, 25_000);
      faucetTxid = ninja.txid;
      faucetAmt = 25_000n;
      console.log(`Ninja accepted a drip. ${ninja.txid}`);
    }
    await waitForFunds(keys.addrA, faucetAmt > 0n ? faucetAmt : FUND_SATS, [faucetTxid], 60);
  }
  const spendable = await collectUtxos(keys.addrA);
  const sent = buildP2pkhSend(keys.keyA, spendable, addressToLocking(dest), FUND_SATS, addressToLocking(keys.addrA));
  const txid = await broadcastTransaction(network, sent.hex);
  console.log(`Funded the box from the test key. deposit ${txid}`);
  return txid;
};

const main = async (): Promise<void> => {
  const keys = await loadKeys();
  const destAddress = keys.addrB || p2pkhAddressFromPrivateKey(keys.keyA, network);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.getByRole('link', { name: 'Open the app' }).click();
  await page.getByRole('button', { name: 'Use my face or fingerprint' }).click();
  try {
    await page.waitForSelector('#screenHome:not([hidden])', { timeout: 30000 });
  } catch (error) {
    const status = await page.locator('#lockStatus').textContent().catch(() => '');
    const createShown = await page.locator('#screenCreate').isVisible().catch(() => false);
    const unlockShown = await page.locator('#screenUnlock').isVisible().catch(() => false);
    await page.screenshot({ path: '/tmp/ui-auth-create-fail.png', fullPage: false });
    throw new Error(`Create did not open the box. create=${createShown} unlock=${unlockShown} status=${status || '(none)'} origin=${page.url()}`);
  }
  const vaultAddress = (await page.locator('#dashAddress').getAttribute('title')) || (await page.locator('#vaultAddress').textContent()) || '';
  // dash shows a short address; the full one is on Receive
  await page.goto(`${BASE}/#receive`);
  await page.waitForSelector('#vaultAddress');
  const fullAddress = (await page.locator('#vaultAddress').textContent())?.trim() ?? '';
  if (!fullAddress.startsWith('bchtest:')) throw new Error(`Create did not yield a test-network address (got ${fullAddress || vaultAddress || 'empty'}).`);
  console.log(`Created a box at ${fullAddress}`);

  const deposit = await fundAddress(fullAddress, keys);
  await waitForFunds(fullAddress, FUND_SATS, [deposit]);
  await page.goto(`${BASE}/#app`);
  // already unlocked this session if we stay in the same page... hash routing may show unlock
  if (await page.locator('#unlockBtn').isVisible()) {
    await page.locator('#unlockBtn').click();
    await page.waitForSelector('#screenHome:not([hidden])', { timeout: 30000 });
  }
  await page.waitForFunction(() => {
    const el = document.getElementById('balUnits');
    return !!el && !el.textContent?.startsWith('0 units');
  }, { timeout: 60000 });
  const bal = await page.locator('#balUnits').textContent();
  console.log(`Box balance on screen: ${bal}`);

  await page.goto(`${BASE}/#send`);
  await page.fill('#dest', destAddress);
  await page.getByRole('button', { name: 'Max' }).click();
  await page.getByRole('button', { name: 'Review send' }).click();
  const hold = page.locator('#reviewConfirm');
  await hold.click(); // reduced motion: click confirms
  await page.waitForSelector('#screenSuccess:not([hidden])', { timeout: 60000 });
  const spendTxid = (await page.locator('#successTxid').textContent())?.trim() ?? '';
  if (!/^[0-9a-f]{64}$/i.test(spendTxid)) throw new Error(`Spend did not return a payment id (got ${spendTxid}).`);
  console.log(`Spend broadcast. spend ${spendTxid}`);
  await getTransaction(network, spendTxid);
  console.log(`Spend visible on the explorer. https://chipnet.bchexplorer.info/tx/${spendTxid}`);
  console.log(`Deposit https://chipnet.bchexplorer.info/tx/${deposit}`);
  await browser.close();
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
