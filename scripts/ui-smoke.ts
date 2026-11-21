import { chromium, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../design/v2/screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.CUBBY_URL ?? 'http://127.0.0.1:4173';
const CHROME = '/usr/bin/google-chrome';
const issues: string[] = [];

const VAULT = {
  credentialId: 'AQIDBA',
  publicKeyX: '11'.repeat(32),
  publicKeyY: '22'.repeat(32),
  rpId: '127.0.0.1',
  address: 'bchtest:pwh5d9m9akqawmr4aczes0auk426kkftpsthn99tqex3xdatjc7zsdcfzwewk',
  network: 'chipnet',
};

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false });
};

const withVault = async (browser: Browser, viewport: { width: number; height: number }, dpr = 1): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  await context.addInitScript((vault) => {
    localStorage.setItem('cubby-vault-v1', JSON.stringify(vault));
  }, VAULT);
  const page = await context.newPage();
  return { context, page };
};

const overflowAt = async (browser: Browser, width: number, engine: string, path = '/?shot=1'): Promise<void> => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  const ok = m.scroll === m.client && m.bodyScroll <= m.client;
  const line = `${engine} ${width}${path}: scrollWidth=${m.scroll} clientWidth=${m.client} body=${m.bodyScroll}`;
  console.log(ok ? `ok  ${line}` : `FAIL ${line}`);
  if (!ok) issues.push(`Horizontal overflow ${line}`);
  await page.close();
};

const chromeLaunch = { executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] };

const SCREENS: Array<{ name: string; path: string; vault?: boolean }> = [
  { name: 'home', path: '/?shot=1' },
  { name: 'film', path: '/?shot=1#demoFilm' },
  { name: 'create', path: '/?shot=1&screen=create' },
  { name: 'unlock', path: '/?shot=1&screen=unlock', vault: true },
  { name: 'dashboard', path: '/?shot=1&screen=dashboard', vault: true },
  { name: 'receive', path: '/?shot=1&screen=receive', vault: true },
  { name: 'send', path: '/?shot=1&screen=send', vault: true },
  { name: 'review', path: '/?shot=1&screen=review', vault: true },
  { name: 'success', path: '/?shot=1&screen=success', vault: true },
  { name: 'activity', path: '/?shot=1&screen=activity', vault: true },
  { name: 'details', path: '/?shot=1&screen=details', vault: true },
];

const runChromiumScreens = async (): Promise<void> => {
  const browser = await chromium.launch(chromeLaunch);
  for (const [w, h, label] of [
    [1440, 900, '1440'],
    [390, 844, '390'],
  ] as const) {
    const dpr = label === '390' ? 2 : 1;
    for (const screen of SCREENS) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      if (screen.vault) {
        await context.addInitScript((vault) => {
          localStorage.setItem('cubby-vault-v1', JSON.stringify(vault));
        }, VAULT);
      }
      const page = await context.newPage();
      await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(400);
      if (screen.name === 'film') {
        await page.locator('#demoFilm').scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
      }
      await shot(page, `${screen.name}-${label}`);
      await context.close();
    }
  }

  const overflowBrowser = await chromium.launch(chromeLaunch);
  for (const width of [360, 375, 390, 430]) {
    await overflowAt(overflowBrowser, width, 'chromium', '/?shot=1');
    await overflowAt(overflowBrowser, width, 'chromium', '/?shot=1&screen=dashboard');
  }
  await overflowBrowser.close();
  await browser.close();
};

const iphoneCheck = async (browser: Browser, label: string, viewport: { width: number; height: number }): Promise<void> => {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((vault) => {
    localStorage.setItem('cubby-vault-v1', JSON.stringify(vault));
  }, VAULT);
  const page = await context.newPage();
  await page.goto(`${BASE}/?shot=1`, { waitUntil: 'networkidle', timeout: 30000 });
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (overflow.scroll !== overflow.client) issues.push(`${label} landing overflow ${overflow.scroll}/${overflow.client}`);
  else console.log(`ok  ${label} landing overflow ${overflow.scroll}/${overflow.client}`);
  const first = await page.evaluate(() => {
    const title = document.getElementById('title')?.getBoundingClientRect();
    const cta = document.getElementById('openApp')?.getBoundingClientRect();
    const inner = window.innerHeight;
    return { inner, titleTop: title?.top, ctaBottom: cta?.bottom, ctaInView: !!cta && cta.bottom < inner && cta.top >= 0 };
  });
  console.log(`${label} landing`, JSON.stringify(first));
  if (!first.ctaInView) issues.push(`${label} Open the app is not in the first screen`);
  await page.screenshot({ path: resolve(OUT, `home-webkit-${label}.png`) });

  await page.goto(`${BASE}/?shot=1&screen=dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
  const dash = await page.evaluate(() => {
    const dock = document.getElementById('dock')?.getBoundingClientRect();
    const bal = document.getElementById('bal')?.getBoundingClientRect();
    const wrap = dock && [...document.querySelectorAll('#dock a')].some((a) => (a as HTMLElement).offsetHeight > 40);
    return {
      overflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      dockTop: dock?.top,
      balBottom: bal?.bottom,
      balAboveDock: !!bal && !!dock && bal.bottom < dock.top,
      dockWraps: wrap ?? false,
    };
  });
  console.log(`${label} dashboard`, JSON.stringify(dash));
  if (!dash.overflow) issues.push(`${label} dashboard overflow`);
  if (!dash.balAboveDock) issues.push(`${label} balance sits under the dock`);
  if (dash.dockWraps) issues.push(`${label} dock labels wrap`);
  await page.screenshot({ path: resolve(OUT, `dashboard-webkit-${label}.png`) });
  await context.close();
};

const runWebkit = async (): Promise<void> => {
  const browser = await webkit.launch();
  for (const width of [360, 375, 390, 430]) {
    await overflowAt(browser, width, 'webkit', '/?shot=1');
    await overflowAt(browser, width, 'webkit', '/?shot=1&screen=dashboard');
  }
  await iphoneCheck(browser, 'iphone-14', { width: 390, height: 844 });
  await iphoneCheck(browser, 'iphone-15', { width: 393, height: 852 });
  await browser.close();
};

const main = async (): Promise<void> => {
  await runChromiumScreens();
  await runWebkit();
  if (issues.length) {
    console.error(`UI smoke failed:\n${issues.map((i) => `- ${i}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`\nUI smoke passed. Screenshots in ${OUT}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
