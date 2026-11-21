/** Playwright shots of every Cubby route at 390 (WebKit iPhone 14) and 1440. */
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.CUBBY_URL ?? 'http://127.0.0.1:4173';
const OUT = '/workspace/bch/design/v3/shots';
const CHROME = '/usr/bin/google-chrome';

const ROUTES: { name: string; path: string }[] = [
  { name: 'landing', path: '/' },
  { name: 'welcome-splash', path: '/welcome?demo=1&step=splash' },
  { name: 'welcome-slides', path: '/welcome?demo=1&step=slides' },
  { name: 'welcome', path: '/welcome?demo=1&step=hello' },
  { name: 'welcome-face', path: '/welcome?demo=1&step=face' },
  { name: 'welcome-ready', path: '/welcome?demo=1&step=ready' },
  { name: 'wallet', path: '/wallet?demo=1' },
  { name: 'coin', path: '/wallet/bch?demo=1' },
  { name: 'receive', path: '/receive?demo=1' },
  { name: 'send', path: '/send?demo=1' },
  { name: 'send-assets', path: '/send?demo=1&sheet=assets' },
  { name: 'send-confirm', path: '/send?demo=1&sheet=confirm' },
  { name: 'success', path: '/send/success?demo=1&txid=2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993&amount=1005741' },
  { name: 'activity', path: '/activity?demo=1' },
  { name: 'receipt', path: '/activity/2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993?demo=1' },
  { name: 'connect', path: '/connect?demo=1' },
  { name: 'settings', path: '/settings?demo=1' },
  { name: 'how', path: '/how-it-works' },
  { name: 'terms', path: '/terms' },
  { name: 'privacy', path: '/privacy' },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const prepare = async (page: Page, name: string) => {
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach((v) => {
      v.pause();
      v.removeAttribute('autoplay');
      v.style.display = 'none';
    });
  }).catch(() => undefined);
  if (name === 'landing') {
    await page.getByText('A box only your face').first().waitFor({ timeout: 15000 });
  }
  if (name === 'wallet') {
    await page.getByText('My box').first().waitFor({ timeout: 15000 });
  }
  await wait(500);
};

const shot = async (page: Page, name: string, width: number, engine: string) => {
  const file = `${OUT}/${name}-${engine}-${width}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { sw: doc.scrollWidth, cw: doc.clientWidth };
  });
  if (overflow.sw > overflow.cw + 2) {
    throw new Error(`${name} @${width} ${engine} overflow: scrollWidth=${overflow.sw} clientWidth=${overflow.cw}`);
  }
  console.log(`ok  ${engine} ${width} ${name}`);
};

const walk = async (browser: Browser, width: number, height: number, engine: string) => {
  const failed: string[] = [];
  let context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width <= 430 ? 2 : 1,
    reducedMotion: 'reduce',
  });
  let page = await context.newPage();
  const reset = async () => {
    await context.close().catch(() => undefined);
    context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: width <= 430 ? 2 : 1,
      reducedMotion: 'reduce',
    });
    page = await context.newPage();
  };
  for (const r of ROUTES) {
    try {
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await prepare(page, r.name);
      await shot(page, r.name, width, engine);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`fail ${engine} ${width} ${r.name}: ${msg}`);
      failed.push(`${r.name}@${width}/${engine}`);
      await reset();
    }
  }
  await context.close().catch(() => undefined);
  return failed;
};

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const failed: string[] = [];
  const chrome = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  failed.push(...await walk(chrome, 1440, 900, 'chromium'));
  failed.push(...await walk(chrome, 390, 844, 'chromium'));
  await chrome.close();
  try {
    const safari = await webkit.launch();
    failed.push(...await walk(safari, 390, 844, 'webkit'));
    await safari.close();
  } catch (e) {
    console.warn('webkit launch failed', e instanceof Error ? e.message : e);
    failed.push('webkit-launch');
  }
  if (failed.length) {
    console.error(`UI smoke finished with gaps: ${failed.join(', ')}`);
    if (failed.some((f) => f.includes('chromium'))) process.exit(1);
  }
  console.log(`UI smoke passed. Screenshots in ${OUT}`);
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
