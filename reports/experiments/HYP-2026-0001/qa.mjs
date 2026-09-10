import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const outDir = 'reports/experiments/HYP-2026-0001/screenshots';
mkdirSync(outDir, { recursive: true });

const pages = [
  ['home', 'http://127.0.0.1:3000/'],
  ['login', 'http://127.0.0.1:3000/login'],
  ['signup', 'http://127.0.0.1:3000/signup'],
  ['dashboard', 'http://127.0.0.1:3000/dashboard'],
  ['radar', 'http://127.0.0.1:3000/dashboard/radar'],
  ['backtest', 'http://127.0.0.1:3000/dashboard/backtest'],
  ['configuracoes', 'http://127.0.0.1:3000/dashboard/configuracoes'],
  ['estatisticas', 'http://127.0.0.1:3000/dashboard/estatisticas'],
];

const issues = [];
const results = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

for (const [name, url] of pages) {
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => pageErrors.push(String(err?.stack || err?.message || err)));
  let status = null;
  let finalUrl = '';
  let title = '';
  let bodyText = '';
  let screenshot = '';
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    status = response?.status() ?? null;
    finalUrl = page.url();
    title = await page.title();
    bodyText = (await page.locator('body').innerText({ timeout: 10000 })).slice(0, 1500);
    screenshot = `${outDir}/${name}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    const nextError = await page.locator('text=/Application error|Unhandled Runtime Error|404|500/i').count();
    if (nextError > 0) issues.push({ page: name, url, severity: 'HIGH', issue: 'Visible runtime/error marker', screenshot });
  } catch (error) {
    issues.push({ page: name, url, severity: 'HIGH', issue: String(error), screenshot });
  }
  results.push({ name, url, status, finalUrl, title, bodyText, consoleMessages, pageErrors, screenshot });
  await page.close();
}

// Invalid login validation smoke test.
{
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text() }); });
  page.on('pageerror', err => pageErrors.push(String(err?.stack || err?.message || err)));
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle', timeout: 45000 });
  const inputs = await page.locator('input').count();
  if (inputs >= 2) {
    await page.locator('input').nth(0).fill('invalid@example.com');
    await page.locator('input').nth(1).fill('wrong-password');
    const buttons = await page.locator('button').count();
    if (buttons > 0) await page.locator('button').first().click();
    await page.waitForTimeout(3000);
  }
  const bodyText = (await page.locator('body').innerText({ timeout: 10000 })).slice(0, 1500);
  const screenshot = `${outDir}/login-invalid.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  results.push({ name: 'login-invalid', url: 'http://127.0.0.1:3000/login', status: null, finalUrl: page.url(), title: await page.title(), bodyText, consoleMessages, pageErrors, screenshot });
  await page.close();
}

await browser.close();
writeFileSync('reports/experiments/HYP-2026-0001/qa-results.json', JSON.stringify({ generatedAt: new Date().toISOString(), results, issues }, null, 2));
console.log(JSON.stringify({ pages: results.length, issues: issues.length, screenshots: results.map(r => r.screenshot) }, null, 2));
