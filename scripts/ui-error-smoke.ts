/** Fail the deploy if any Cubby route throws a page error (the CSP/libauth crash class). */
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/usr/bin/google-chrome';
const LOCAL = process.argv.includes('--local');
const LOCAL_PORT = Number(process.env.CUBBY_SMOKE_PORT ?? 4177);
let BASE = process.env.CUBBY_URL ?? (LOCAL ? `http://127.0.0.1:${LOCAL_PORT}` : 'http://127.0.0.1:4173');

export const ROUTES: { name: string; path: string }[] = [
  { name: 'landing', path: '/' },
  { name: 'film', path: '/film' },
  { name: 'deck', path: '/deck' },
  { name: 'wallet', path: '/wallet' },
  { name: 'wallet-demo', path: '/wallet?demo=1' },
  { name: 'send', path: '/send' },
  { name: 'send-demo', path: '/send?demo=1' },
  { name: 'receive', path: '/receive' },
  { name: 'receive-demo', path: '/receive?demo=1' },
  { name: 'connect', path: '/connect' },
  { name: 'connect-demo', path: '/connect?demo=1' },
  { name: 'settings', path: '/settings' },
  { name: 'settings-demo', path: '/settings?demo=1' },
  { name: 'welcome', path: '/welcome' },
  { name: 'activity-demo', path: '/activity?demo=1' },
  { name: 'allowance-demo', path: '/allowance?demo=1' },
  { name: 'id-demo', path: '/id?demo=1' },
  { name: 'how', path: '/how-it-works' },
  { name: 'terms', path: '/terms' },
  { name: 'privacy', path: '/privacy' },
];

type Issue = { route: string; kind: string; message: string };

const ignoreConsole = (text: string): boolean => {
  if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return true;
  if (/net::ERR_ABORTED/.test(text) || /NS_BINDING_ABORTED/.test(text)) return true;
  if (/favicon\.ico/.test(text)) return true;
  // Playwright's WebKit build on this box often cannot open outbound HTTPS (watchtower, explorers).
  // Never ignore an Application error or a missing wasm-unsafe-eval crash.
  if (/Failed to load resource: TLS support is not available/.test(text)) return true;
  return false;
};

const isFatal = (text: string): boolean =>
  /Application error|client-side exception|unsafe-eval|WebAssembly|wasm-unsafe-eval|ChunkLoadError/i.test(text);

const attach = (page: Page, route: string, issues: Issue[]): void => {
  page.on('pageerror', (err) => {
    issues.push({ route, kind: 'pageerror', message: err.message });
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (isFatal(text) || (msg.type() === 'error' && !ignoreConsole(text))) {
      issues.push({ route, kind: `console.${msg.type()}`, message: text });
    }
  });
};

const loadRoute = async (page: Page, route: string, pathName: string, issues: Issue[]): Promise<void> => {
  attach(page, route, issues);
  const res = await page.goto(`${BASE}${pathName}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (res && res.status() >= 500) {
    issues.push({ route, kind: 'http', message: `HTTP ${res.status()}` });
  }
  await page.waitForTimeout(1500);
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  if (/Application error|client-side exception/i.test(body)) {
    issues.push({ route, kind: 'body', message: body.slice(0, 280) });
  }
};

const walk = async (browser: Browser, engine: string, width: number, height: number): Promise<Issue[]> => {
  const issues: Issue[] = [];
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const r of ROUTES) {
    const routeIssues: Issue[] = [];
    try {
      await loadRoute(page, `${r.name}@${engine}${width}`, r.path, routeIssues);
    } catch (error) {
      routeIssues.push({
        route: `${r.name}@${engine}${width}`,
        kind: 'goto',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    issues.push(...routeIssues);
    if (routeIssues.some((i) => i.kind === 'goto')) {
      await context.close().catch(() => undefined);
      return issues;
    }
  }
  await context.close();
  return issues;
};

const waitForServer = async (url: string, timeoutMs: number): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok || res.status === 307 || res.status === 308 || res.status === 200) return;
    } catch {
      /* still booting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Local server at ${url} did not become ready in ${timeoutMs}ms`);
};

const startLocalServer = async (): Promise<ChildProcess> => {
  const nextBin = path.join(ROOT, 'node_modules', '.bin', 'next');
  const child = spawn(nextBin, ['start', '--port', String(LOCAL_PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(LOCAL_PORT) },
  });
  let output = '';
  child.stdout?.on('data', (buf: Buffer) => {
    output += buf.toString();
  });
  child.stderr?.on('data', (buf: Buffer) => {
    output += buf.toString();
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`next start exited ${code}\n${output.slice(-2000)}`);
    }
  });
  BASE = `http://127.0.0.1:${LOCAL_PORT}`;
  await waitForServer(BASE, 30000);
  return child;
};

const main = async (): Promise<void> => {
  let server: ChildProcess | undefined;
  if (LOCAL) {
    server = await startLocalServer();
  }
  const issues: Issue[] = [];
  try {
    const chrome = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
    issues.push(...(await walk(chrome, 'chromium', 390, 844)));
    await chrome.close();
    const safari = await webkit.launch();
    issues.push(...(await walk(safari, 'webkit', 390, 844)));
    await safari.close();
  } finally {
    if (server && server.pid) {
      server.kill('SIGTERM');
    }
  }
  if (issues.length) {
    for (const issue of issues) {
      console.error(`FAIL ${issue.route} [${issue.kind}] ${issue.message}`);
    }
    throw new Error(`UI error smoke failed: ${issues.length} issue(s) on ${[...new Set(issues.map((i) => i.route))].join(', ')}`);
  }
  console.log(`UI error smoke passed. ${ROUTES.length} routes, Chromium 390 and WebKit 390, no page errors.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
