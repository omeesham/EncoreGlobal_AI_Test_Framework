#!/usr/bin/env node
// scripts/walk-coverage/tdw-probe.mjs
// PLAN_TIERED_DELEGATED_WALK — Phase 2 per-field probe instrument (the field-level analog of
// enumerate-page.mjs's denominator). A TDW worker runs this to capture RAW static evidence for a
// list of locators on the live page; it encodes NO expected values (that would be "tweaking for
// forced success") — it is pure DOM instrumentation, like the enumerator.
//
// Reuses the canonical saved SSO session (.auth/encore-state.json); ABORTS on a login
// redirect (does NOT reimplement login — LR-054 Instance 3 / raw-chromium anti-pattern).
//
// Usage:
//   node scripts/walk-coverage/tdw-probe.mjs --office=1604 --module=pricing --testids=a,b,c
//   node scripts/walk-coverage/tdw-probe.mjs --url=<full-url> --testids=a,b,c [--names="Pay To Address|Home"]
//
// Output: JSON array on stdout, one object per requested locator, with raw attrs only.

import { chromium } from 'playwright';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const AUTH = join(REPO_ROOT, '.auth', 'encore-state.json');
const BASE = 'https://cloudapps-e2e.encoreglobal.com/navigator';

const args = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] === undefined ? true : m[2]; }

const url = args.url || `${BASE}/locations/${args.office || '1604'}/settings/location`;
const testids = (args.testids || '').split(',').map(s => s.trim()).filter(Boolean);
const names = (args.names || '').split('|').map(s => s.trim()).filter(Boolean);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: AUTH });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500); // Angular + shadow render settle (no networkidle, LR-023)

const here = page.url();
if (/login\.microsoftonline\.com|\/login/i.test(here)) {
  console.error('[tdw-probe] LOGIN REDIRECT — auth expired. Landed on: ' + here);
  await browser.close();
  process.exit(2);
}

// Optional tab activation (Playwright locators pierce shadow DOM natively + fire the full pointer
// sequence Radix needs). Pass --activate=<testid> (comma-list for nested tabs, applied in order).
for (const tid of (args.activate || '').split(',').map(s => s.trim()).filter(Boolean)) {
  try { await page.getByTestId(tid).click({ timeout: 8000 }); await page.waitForTimeout(2500); }
  catch (e) { console.error('[tdw-probe] activate failed for ' + tid + ': ' + e.message); }
}

// Optional interactive affordance probe: --click=testid:<x> | name:<x> — clicks it, then reports any
// dialog/popover that opened + any visible listbox options. Confirms launcher / dropdown affordances.
let clickProbe = null;
if (args.click) {
  const [kind, ...rest] = String(args.click).split(':'); const val = rest.join(':');
  try {
    const loc = kind === 'testid' ? page.getByTestId(val) : page.getByText(val, { exact: true }).first();
    try {
      await loc.click({ timeout: 6000 });
    } catch (clickErr) {
      // LR-057: a launcher label whose for= points at a DISABLED input is blocked by .click()
      // ("element is not enabled") — drive it via dispatchEvent('click') instead.
      await loc.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    await page.waitForTimeout(1500);
    clickProbe = await page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect && el.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; };
      const collect = (sel) => {
        const out = [];
        const walk = (n) => {
          if (n.matches && n.matches(sel) && vis(n))
            out.push((n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 50));
          if (n.shadowRoot) walk(n.shadowRoot);
          for (const c of (n.children || [])) walk(c);
        };
        walk(document.documentElement);
        return out;
      };
      const dialogs = collect('[role="dialog"],[role="alertdialog"]');
      const options = collect('[role="option"]').slice(0, 12);
      return { dialogAppeared: dialogs.length > 0, dialogTitles: dialogs.slice(0, 3), optionCount: options.length, optionsSample: options };
    });
  } catch (e) { clickProbe = { error: e.message }; }
}

const result = await page.evaluate(({ testids, names }) => {
  const findByTestid = (tid) => { let f = null; const w = n => { if (f) return; if (n.getAttribute && n.getAttribute('data-testid') === tid) { f = n; return; } if (n.shadowRoot) w(n.shadowRoot); for (const c of (n.children || [])) w(c); }; w(document.documentElement); return f; };
  const findByName = (nm) => { let f = null; const w = n => { if (f) return; const an = (n.getAttribute && (n.getAttribute('aria-label') || '')) || ''; const tx = (n.children && n.children.length === 0 ? (n.textContent || '') : '').trim(); if ((an === nm || tx === nm) && n.matches && n.matches('a,button,label,[role]')) { f = n; return; } if (n.shadowRoot) w(n.shadowRoot); for (const c of (n.children || [])) w(c); }; w(document.documentElement); return f; };
  const describe = (locator, e) => {
    if (!e) return { locator, found: false };
    const lbl = e.id ? (() => { let r = null; const w = n => { if (r) return; if (n.getAttribute && n.getAttribute('for') === e.id) { r = n; return; } if (n.shadowRoot) w(n.shadowRoot); for (const c of (n.children || [])) w(c); }; w(document.documentElement); return r; })() : null;
    return {
      locator, found: true,
      tag: e.tagName.toLowerCase(),
      role: e.getAttribute('role') || '',
      type: e.getAttribute('type') || '',
      value: (e.value !== undefined && e.value !== null ? String(e.value) : '').slice(0, 40),
      text: (e.children && e.children.length === 0 ? (e.textContent || '') : (e.getAttribute('aria-label') || '')).trim().slice(0, 40),
      disabled: e.disabled === true || e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled'),
      readonly: e.readOnly === true || e.hasAttribute('readonly'),
      ariaChecked: e.getAttribute('aria-checked'),
      ariaInvalid: e.getAttribute('aria-invalid'),
      ariaHaspopup: e.getAttribute('aria-haspopup'),
      ariaExpanded: e.getAttribute('aria-expanded'),
      labelText: lbl ? (lbl.textContent || '').trim().slice(0, 40) : '',
      labelFor: lbl ? true : false,
    };
  };
  const out = [];
  for (const tid of testids) out.push(describe('testid:' + tid, findByTestid(tid)));
  for (const nm of names) out.push(describe('name:' + nm, findByName(nm)));
  return out;
}, { testids, names });

console.log(JSON.stringify(clickProbe ? { fields: result, clickProbe } : result, null, 2));
await browser.close();
