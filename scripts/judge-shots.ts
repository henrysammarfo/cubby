/** Screenshots at 390 px of the judge fixes against a local build on :4191 (next start --port 4191). Writes to submission/judge-evidence/judge-fixes. */
import { chromium } from 'playwright';
import { encodeCashAddress, hexToBin, sha256, utf8ToBin } from '@bitauth/libauth';
import { buildVault } from '../src/covenant.js';
import { lockingToAddress } from '../src/address.js';
import { NETWORKS } from '../src/network.js';
import { createSoftPasskey } from '../src/softAuthenticator.js';

const BASE = 'http://localhost:4191';
const OUT = '/workspace/bch/submission/judge-evidence/judge-fixes';
const pk = await createSoftPasskey('localhost');
const x = pk.publicKey.x.toString(16).padStart(64, '0');
const y = pk.publicKey.y.toString(16).padStart(64, '0');
const plainVault = buildVault({ publicKey: pk.publicKey, rpIdHash: sha256.hash(utf8ToBin('localhost')) });
const net = NETWORKS.mainnet;
const stored = { credentialId: 'AAAA', publicKeyX: x, publicKeyY: y, rpId: 'localhost', address: lockingToAddress(plainVault.lockingBytecode, net), network: 'mainnet' };
const backupAddr = encodeCashAddress({ prefix: 'bitcoincash', type: 'p2pkhWithTokens', payload: hexToBin('7a'.repeat(20)) }).address;
const storedBackup = { ...stored, backup: { address: backupAddr, delayBlocks: 12960 } };
const testAddr = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hexToBin('7a'.repeat(20)) }).address;
const mainAddr = encodeCashAddress({ prefix: 'bitcoincash', type: 'p2pkh', payload: hexToBin('5b'.repeat(20)) }).address;
const typo = mainAddr.slice(0, -8) + (mainAddr.at(-8) === 'q' ? 'p' : 'q') + mainAddr.slice(-7);

const browser = await chromium.launch({ executablePath: '/home/box/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome' });
const ctxFor = async (vault: object | null) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([v]) => {
    localStorage.setItem('cubby-network', 'mainnet');
    if (v) { localStorage.setItem('cubby-vault-v1', JSON.stringify(v)); sessionStorage.setItem('cubby-unlocked', '1'); }
  }, [vault]);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  return ctx;
};
const shot = async (page: import('playwright').Page, name: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

let ctx = await ctxFor(stored);
let page = await ctx.newPage();
await page.goto(`${BASE}/wallet`); await shot(page, '01-wallet-hat-top-right');
await page.click('a[aria-label="Connect a wallet with WizardConnect"]');
await page.waitForURL('**/connect'); 
await page.waitForSelector('button.qr-tap', { timeout: 20000 }).catch(() => console.log('no QR (relay)'));
await shot(page, '02-connect-hat-on-qr');
if (await page.$('button.qr-tap')) {
  await page.click('button.qr-tap');
  await shot(page, '03-connect-tapped-copied');
  console.log('clipboard starts with', (await page.evaluate(() => navigator.clipboard.readText())).slice(0, 6));
}
await page.goto(`${BASE}/send`);
await shot(page, '04-send-empty-button-off');
await page.fill('#dest', testAddr); await shot(page, '05-send-wrong-network');
await page.fill('#dest', typo); await shot(page, '06-send-typo');
await page.fill('#dest', mainAddr.slice(0, 30) + mainAddr.slice(30).toUpperCase()); await shot(page, '07-send-mixed-case');
await page.fill('#dest', mainAddr); await shot(page, '08-send-valid');
await page.goto(`${BASE}/settings`); await shot(page, '09-settings-backup-row');
await page.goto(`${BASE}/settings/backup`); await page.waitForTimeout(2500); await shot(page, '10-backup-setup');
await page.fill('#backup', backupAddr); await page.click('text=6 months'); await page.waitForTimeout(1500); await shot(page, '11-backup-filled');
await ctx.close();
ctx = await ctxFor(storedBackup);
page = await ctx.newPage();
await page.goto(`${BASE}/settings/backup`); await page.waitForTimeout(2000); await shot(page, '12-backup-on');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await shot(page, '13-backup-on-note');
await page.goto(`${BASE}/settings`); await shot(page, '14-settings-backup-on');
await ctx.close();
ctx = await ctxFor(null);
page = await ctx.newPage();
const note = `cubby-recovery-v1:mainnet/localhost/${x}/${y}/${backupAddr}/12960`;
await page.goto(`${BASE}/recover`); await shot(page, '15-recover-empty');
await page.fill('#note', note); await shot(page, '16-recover-filled');
await browser.close();
