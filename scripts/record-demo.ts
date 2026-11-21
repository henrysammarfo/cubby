import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve('/tmp/cubby-demo-frames');
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const BASE = process.env.CUBBY_URL ?? 'https://cubby-liart-six.vercel.app';
const CHROME = '/usr/bin/google-chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: DIR, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2800);

const hold = page.locator('#hold');
await hold.scrollIntoViewIfNeeded();
const box = await hold.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1400);
  await page.mouse.up();
  await page.waitForTimeout(2000);
}

await page.locator('#demoProof').scrollIntoViewIfNeeded();
await page.waitForTimeout(2500);

await page.locator('#how').scrollIntoViewIfNeeded();
await page.waitForTimeout(1800);

await page.locator('#try').scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.locator('#connect').click();
await page.locator('#qrWrap').waitFor({ state: 'visible', timeout: 20000 });
await page.locator('#qr').evaluate(`(el) => el.scrollIntoView({ block: 'center' })`);
await page.waitForTimeout(2500);

await page.locator('#business').scrollIntoViewIfNeeded();
await page.waitForTimeout(2000);

await context.close();
await browser.close();
console.log('recorded in', DIR);
