import { chromium, webkit, type Browser, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../design/v2/screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.CUBBY_URL ?? 'http://127.0.0.1:4173';
const CHROME = '/usr/bin/google-chrome';
const issues: string[] = [];

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false });
};

const overflowAt = async (browser: Browser, width: number, engine: string): Promise<void> => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  try {
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (error) {
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    void error;
  }
  await page.waitForSelector('#stage');
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  const ok = m.scroll === m.client && m.bodyScroll <= m.client;
  const line = `${engine} ${width}: scrollWidth=${m.scroll} clientWidth=${m.client} body=${m.bodyScroll}`;
  console.log(ok ? `ok  ${line}` : `FAIL ${line}`);
  if (!ok) issues.push(`Horizontal overflow ${line}`);
  await page.close();
};

const holdFlow = async (page: Page): Promise<void> => {
  const hold = page.locator('#hold');
  await hold.scrollIntoViewIfNeeded();
  const box = await hold.boundingBox();
  if (!box) throw new Error('Hold button is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1400);
  await page.mouse.up();
  await page.waitForTimeout(1600);
  const state = await page.locator('#vault').getAttribute('data-state');
  if (state !== 'success' && state !== 'checking') {
    issues.push(`Hold flow ended in data-state=${state}`);
  } else {
    console.log(`ok  hold flow state=${state}`);
  }
};

const chromeLaunch = { executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] };

const runChromiumScreens = async (): Promise<void> => {
  const browser = await chromium.launch(chromeLaunch);
  for (const [w, h, label] of [
    [1440, 900, '1440'],
    [390, 844, '390'],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: label === '390' ? 2 : 1 });
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await shot(page, `home-${label}`);

    await page.goto(`${BASE}/?shot=1&state=success`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await shot(page, `home-success-${label}`);

    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'networkidle' });
    await page.locator('#demoFilm').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `film-${label}`);

    await page.locator('#demoProof').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `proof-${label}`);

    await page.locator('#how').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `how-${label}`);

    await page.locator('#try').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `try-${label}`);

    await page.locator('#connect').click();
    await page.locator('#qrWrap').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#qr').evaluate(`(el) => el.scrollIntoView({ block: 'center' })`);
    await page.waitForTimeout(400);
    await shot(page, `connect-${label}`);

    await page.locator('#activity').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `activity-${label}`);

    await page.locator('#business').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `business-${label}`);

    await page.locator('footer.site').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `footer-${label}`);

    await page.evaluate(() => {
      const modal = document.getElementById('reviewModal') as HTMLDialogElement | null;
      const title = document.getElementById('reviewTitle');
      const body = document.getElementById('reviewBody');
      if (!modal || !title || !body) return;
      title.textContent = 'Review this action';
      body.innerHTML = '<dt>Network</dt><dd>Test network</dd><dt>Amount</dt><dd>20 000 units</dd>';
      modal.showModal();
    });
    await page.waitForTimeout(200);
    await shot(page, `review-${label}`);
    await page.close();
  }
  await browser.close();
};

const runIos = async (): Promise<void> => {
  const browser = await webkit.launch();
  const devices: Array<{ name: string; width: number; height: number }> = [
    { name: 'iPhone 14', width: 390, height: 844 },
    { name: 'iPhone 15', width: 393, height: 852 },
  ];
  for (const d of devices) {
    const page = await browser.newPage({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: 3,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      hasTouch: true,
      isMobile: true,
    });
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    const ok = m.scroll === m.client;
    const slug = d.name.replace(/\s+/g, '-').toLowerCase();
    console.log(ok ? `ok  webkit ${d.name} overflow ${m.scroll}/${m.client}` : `FAIL webkit ${d.name} overflow ${m.scroll}/${m.client}`);
    if (!ok) issues.push(`WebKit ${d.name} overflow scrollWidth=${m.scroll} clientWidth=${m.client}`);
    await shot(page, `home-webkit-${slug}`);

    const howColor = await page.locator('a.btn-on-dark').evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor };
    });
    console.log(`webkit ${d.name} How it works color=${howColor.color} bg=${howColor.bg}`);
    // Dark text on cream: rgb 11,11,15 on 247,242,234
    if (howColor.color === howColor.bg) issues.push(`How it works contrast failed on ${d.name}`);

    const first = await page.evaluate(`(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      const dock = box('.dock');
      const hold = box('#hold');
      const vault = box('#vault');
      const art = box('#art');
      const limit = dock ? dock.top - 4 : window.innerHeight;
      return {
        inner: window.innerHeight,
        dock, hold, vault, art,
        holdAboveDock: !!(hold && hold.bottom <= limit && hold.height > 0),
        vaultInView: !!(vault && vault.top < limit && vault.width !== 0),
        artInView: !!(art && art.top < limit && art.height > 80),
      };
    })()`) as {
      inner: number;
      holdAboveDock: boolean;
      vaultInView: boolean;
      artInView: boolean;
    };
    console.log(`webkit ${d.name} first screen`, JSON.stringify(first));
    if (!first.holdAboveDock) issues.push(`Hold to open is below the dock on ${d.name}`);
    if (!first.vaultInView) issues.push(`Vault card not in first screen on ${d.name}`);
    if (!first.artInView) issues.push(`Mascot art not in first screen on ${d.name}`);

    await holdFlow(page);
    await shot(page, `home-webkit-${slug}-held`);
    await page.close();
  }
  await browser.close();
};

const runOverflowMatrix = async (): Promise<void> => {
  const chrome = await chromium.launch(chromeLaunch);
  for (const w of [360, 375, 390, 430]) await overflowAt(chrome, w, 'chromium');
  await chrome.close();
  const safari = await webkit.launch();
  for (const w of [360, 375, 390, 430]) await overflowAt(safari, w, 'webkit');
  await safari.close();
};

const chromiumHold = async (): Promise<void> => {
  const browser = await chromium.launch(chromeLaunch);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/?shot=1`, { waitUntil: 'networkidle' });
  await holdFlow(page);
  await browser.close();
};

await runChromiumScreens();
await runOverflowMatrix();
await runIos();
await chromiumHold();

if (issues.length) {
  console.error('\nUI smoke failed:');
  for (const i of issues) console.error(' -', i);
  process.exit(1);
}
console.log(`\nUI smoke passed. Screenshots in ${OUT}`);
