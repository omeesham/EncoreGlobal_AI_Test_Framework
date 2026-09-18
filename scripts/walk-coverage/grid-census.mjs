#!/usr/bin/env node
// grid-census.mjs — read-only census: does Corporate Pricing > Product Group Override render rows?
// Drives the repo's own @playwright/test (NOT the out-of-repo playwright-cli binary) so it runs
// inside delegated path confinement. READ-ONLY: navigates and reads; never fills, saves, or uploads.
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const STATE = resolve(REPO_ROOT, '.auth/encore-state.json');
const BASE = 'https://cloudapps-e2e.encoreglobal.com/navigator/locations';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
if (!args.offices) { console.error('Usage: --offices=1604,9460 [--json]'); process.exit(1); }
if (!existsSync(STATE)) { console.error(`FAIL: auth state missing at ${STATE}`); process.exit(1); }

const offices = String(args.offices).split(',').map((s) => s.trim()).filter(Boolean);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: JSON.parse(readFileSync(STATE, 'utf-8')) });
const page = await context.newPage();
const results = [];

for (const office of offices) {
  const rec = { office };
  try {
    await page.goto(`${BASE}/${office}/settings/corporate-pricing/pg-override`, { timeout: 30000 });
    await page.locator('text=Change Local Office').first().click({ timeout: 15000 });
    const search = page.locator('input[placeholder="Search by Location Name, Number"]').first();
    await search.waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[role="dialog"] tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
    await search.fill(office);
    const row = page.locator('[role="dialog"] tbody tr', { hasText: office }).first();
    await row.waitFor({ state: 'visible', timeout: 10000 });
    await row.locator('[role="checkbox"]').first().check();
    await page.locator('button:text-is("Select")').first().click();
    await page.waitForFunction(() => {
      const m = document.body.innerText.match(/([0-9,]+) items found/);
      return m && m[1] !== '0';
    }, { timeout: 15000 }).catch(() => { rec.note = 'count stayed 0 through the wait window'; });
    const text = await page.locator('body').innerText();
    rec.items = (text.match(/([0-9,]+) items found/) || [])[1] ?? 'none';
    rec.hasRows = rec.items !== '0' && rec.items !== 'none';
  } catch (err) { rec.error = String(err).slice(0, 120); }
  results.push(rec);
  if (!args.json) console.log(`${office} items=${rec.items ?? '-'} ${rec.hasRows ? 'HAS ROWS' : rec.error ? 'ERROR' : 'empty'}`);
}
await browser.close();
const withRows = results.filter((r) => r.hasRows);
if (args.json) console.log(JSON.stringify({ probed: results.length, withRows: withRows.length, results }, null, 2));
else console.log(`\n${withRows.length} of ${results.length} render rows: ${withRows.map((r) => `${r.office}(${r.items})`).join(', ') || 'none'}`);
