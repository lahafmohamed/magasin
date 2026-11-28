// Outils d'audit. Voir README.md.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const require = createRequire(path.join(HERE, 'deps', 'package.json'));
export const PW = 'Audit2026!x';
const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1148', 'chrome-win', 'chrome.exe');

/** Client API pour un rôle : admin, gerant, caissier, vendeur, depot, lecteur. */
export async function api(n, user = 'admin') {
  const base = `http://localhost:${6140 + n}/api`;
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: PW }) });
  const j = await r.json();
  if (!j.data?.token) throw new Error('connexion impossible: ' + JSON.stringify(j));
  const call = async (method, p, body) => {
    const x = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${j.data.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await x.text(); let json; try { json = JSON.parse(t); } catch { json = { raw: t.slice(0, 500) }; }
    return { status: x.status, json };
  };
  return { token: j.data.token, user: j.data.user, get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b ?? {}), patch: (p, b) => call('PATCH', p, b ?? {}), del: (p) => call('DELETE', p) };
}

/** Requête SQL en LECTURE sur la base de l'agent n (ou 'neuve'). */
export async function sql(n, text, params = []) {
  const breq = createRequire('C:/Users/Mohamed/Desktop/projet/magasinProgramme/backend/package.json');
  const pg = breq('pg');
  const env = fs.readFileSync('C:/Users/Mohamed/Desktop/projet/magasinProgramme/backend/.env', 'utf8');
  const password = /^DB_PASSWORD=(.*)$/m.exec(env)[1].trim().replace(/^"|"$/g, '');
  const c = new pg.Client({ host: 'localhost', user: 'postgres', password, database: `nolyx_audit_${n}` });
  await c.connect();
  try { await c.query('SET default_transaction_read_only = on'); return (await c.query(text, params)).rows; } finally { await c.end(); }
}

/** Navigateur connecté. opts: { user, width, height, theme } → { page, shot(nom), errors, close } */
export async function ui(n, opts = {}) {
  const { user = 'admin', width = 1440, height = 900, theme = 'light', out = path.join(process.env.TEMP, 'nolyx-captures', String(n)) } = opts;
  const { chromium } = require('playwright-core');
  const a = await api(n, user);
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'fr-FR', acceptDownloads: true });
  const origin = `http://localhost:${6150 + n}`;
  await ctx.addCookies([{ name: 'auth_token', value: a.token, url: origin, httpOnly: true }]);
  await ctx.addInitScript(([u, t]) => { localStorage.setItem('auth_user', JSON.stringify(u)); localStorage.setItem('theme', t); }, [a.user, theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push('js: ' + e.message.slice(0, 200)));
  page.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && errors.push(`api ${r.status()} ${r.request().method()} ${r.url().replace(origin, '')}`));
  fs.mkdirSync(out, { recursive: true });
  return {
    page, errors, api: a,
    goto: async (p) => { await page.goto(origin + p); await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {}); await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse'), null, { timeout: 10000 }).catch(() => {}); },
    shot: async (name, full = false) => { const f = path.join(out, name + '.png'); await page.screenshot({ path: f, fullPage: full }); return f; },
    close: () => browser.close(),
  };
}
