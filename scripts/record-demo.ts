/**
 * Records the 20 second landing film (public/cubby-demo.mp4) from the current
 * landing: hero, hold to open, the demo wallet replay, the proof spend sheet,
 * the three steps, and the BLAZE strip. Run against a local `next start` or the
 * live site: CUBBY_URL=http://localhost:4411 npx tsx scripts/record-demo.ts
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve('/tmp/cubby-demo-frames');
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const BASE = process.env.CUBBY_URL ?? 'https://cubby-liart-six.vercel.app';
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome';
const W = 1440, H = 900;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: DIR, size: { width: W, height: H } } });
const page = await context.newPage();
const smooth = (y: number) => page.evaluate(`window.scrollTo({ top: ${y}, behavior: 'smooth' })`);

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2400);

const hold = page.getByRole('button', { name: /Hold to open/ });
const box = await hold.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
}
await page.waitForTimeout(2200);

await page.getByRole('link', { name: /See inside/ }).click();
await page.waitForURL(/wallet/);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

await page.getByRole('link', { name: /See the proof spend/ }).click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

await page.goto(`${BASE}/?shot=1#how`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await smooth(0);
await page.waitForTimeout(1200);
const how = await page.locator('#how').evaluate(el => (el as HTMLElement).offsetTop);
await smooth(how - 40);
await page.waitForTimeout(2600);
await smooth(0);
await page.waitForTimeout(900);
await page.locator('.bz-vote').hover();
await page.locator('.bz-vote').click();
await page.waitForTimeout(1500);

await context.close();
await browser.close();
console.log('recorded in', DIR);
