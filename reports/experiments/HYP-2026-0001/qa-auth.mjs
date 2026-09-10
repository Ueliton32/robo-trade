import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';
import { mkdirSync, writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
const outDir = 'reports/experiments/HYP-2026-0001/screenshots-auth';
mkdirSync(outDir, { recursive: true });

const user = await prisma.user.findFirst({ select: { id: true, email: true, name: true, role: true }, orderBy: { createdAt: 'asc' } });
if (!user) throw new Error('No user found for authenticated QA');
if (!process.env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET missing');

const token = await encode({
  secret: process.env.NEXTAUTH_SECRET,
  token: { id: user.id, sub: user.id, email: user.email, name: user.name, role: user.role },
  maxAge: 60 * 60,
});

const pages = [
  ['dashboard', 'http://127.0.0.1:3000/dashboard'],
  ['radar', 'http://127.0.0.1:3000/dashboard/radar'],
  ['backtest', 'http://127.0.0.1:3000/dashboard/backtest'],
  ['configuracoes', 'http://127.0.0.1:3000/dashboard/configuracoes'],
  ['estatisticas', 'http://127.0.0.1:3000/dashboard/estatisticas'],
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'next-auth.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);

const results = [];
const issues = [];
for (const [name, url] of pages) {
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text() }); });
  page.on('pageerror', err => pageErrors.push(String(err?.stack || err?.message || err)));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), failure: req.failure()?.errorText }));
  let status = null, finalUrl = '', title = '', bodyText = '', screenshot = `${outDir}/${name}.png`;
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    status = response?.status() ?? null;
    finalUrl = page.url();
    title = await page.title();
    bodyText = (await page.locator('body').innerText({ timeout: 15000 })).slice(0, 3000);
    await page.screenshot({ path: screenshot, fullPage: true });
    if (finalUrl.includes('/login')) issues.push({ page: name, severity: 'HIGH', issue: 'Authenticated session redirected to login', screenshot });
    if (/Application error|Unhandled Runtime Error|Erro interno|500/i.test(bodyText)) issues.push({ page: name, severity: 'HIGH', issue: 'Visible runtime/error text', screenshot });
  } catch (error) {
    issues.push({ page: name, severity: 'HIGH', issue: String(error), screenshot });
  }
  results.push({ name, url, status, finalUrl, title, bodyText, consoleMessages, pageErrors, failedRequests, screenshot });
  await page.close();
}

await browser.close();
await prisma.$disconnect();
writeFileSync('reports/experiments/HYP-2026-0001/qa-auth-results.json', JSON.stringify({ generatedAt: new Date().toISOString(), user: { id: '[REDACTED]', email: '[REDACTED]', role: user.role }, results, issues }, null, 2));
console.log(JSON.stringify({ pages: results.length, issues: issues.length, screenshots: results.map(r => r.screenshot) }, null, 2));
