#!/usr/bin/env node
// scripts/walk-coverage/probe-archetype.mjs
// PLAN_WALK_STATE_CONTRACT_REALIGN — Per-archetype probe runner.
//
// Produces structured JSON receipts for walk states deliberately excluded from the enumerator's
// breadth-first walk (expand:row-language, edit:html-cell). These receipts satisfy the eight
// verifier checks in verify-denominator.mjs (lines 174–249).
//
// Usage:
//   node scripts/walk-coverage/probe-archetype.mjs --module=terms-conditions --office=1604
//   node scripts/walk-coverage/probe-archetype.mjs --module=service-charge-text --office=1604
//   node scripts/walk-coverage/probe-archetype.mjs --dry-run
//
// The --dry-run flag exercises the receipt-writing logic with synthetic data (no browser).

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { inPageEnumerate } from './lib/deep-pierce.mjs';
import { checkOpenerBound } from './lib/opener-bound-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const BASE = 'https://cloudapps-e2e.encoreglobal.com/navigator';
const DEFAULT_AUTH = join(REPO_ROOT, '.auth', 'encore-state.json');
const FALLBACK_AUTH = join(REPO_ROOT, '.auth', 'e2e-state.json');

// ---- CLI args -------------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return o;
}
const args = parseArgs(process.argv);

// ---- Module probe definitions ---------------------------------------------------------------
// Each module lists the states this probe covers and how to trigger them.
const PROBE_MODULES = {
  'terms-conditions': {
    path: (office) => `${BASE}/locations/${office}/settings/terms-conditions`,
    contentMarker: '[data-testid="terms-conditions-table"]',
    receiptPath: 'reports/walk-coverage/probes/archetype-probe-terms-conditions.json',
    walkArtifact: (office) => resolve(REPO_ROOT, 'reports', 'walk-coverage', `p1-${office}-terms-conditions.json`),
    states: [
      {
        label: 'expand:row-language',
        trigger: 'Click first data row language combobox trigger to open Radix listbox',
        // First row language trigger — pattern: <module>-language-trigger-0
        openerSelector: '[data-testid="terms-conditions-language-trigger-0"]',
        postcondition: '[role="listbox"]',
      },
      {
        label: 'edit:html-cell',
        trigger: 'Double-click first rich-text cell to open Tiptap/ProseMirror editor',
        openerSelector: '[data-testid="terms-conditions-html-cell-0-htmlDisplayText"]',
        openerAction: 'dblclick',
        postcondition: '[contenteditable="true"], .ProseMirror, .tiptap',
      },
    ],
  },
  'service-charge-text': {
    path: (office) => `${BASE}/locations/${office}/settings/service-charge-text`,
    contentMarker: '[data-testid="service-charge-text-table"]',
    receiptPath: 'reports/walk-coverage/probes/archetype-probe-service-charge-text.json',
    walkArtifact: (office) => resolve(REPO_ROOT, 'reports', 'walk-coverage', `p1-${office}-service-charge-text.json`),
    states: [
      {
        label: 'expand:row-language',
        trigger: 'Click first data row language combobox trigger to open Radix listbox',
        openerSelector: '[data-testid="service-charge-text-language-trigger-0"]',
        postcondition: '[role="listbox"]',
      },
      {
        label: 'edit:html-cell',
        trigger: 'Double-click first rich-text cell to open Tiptap/ProseMirror editor',
        openerSelector: '[data-testid="service-charge-text-html-cell-0-htmlDisplayText"]',
        openerAction: 'dblclick',
        postcondition: '[contenteditable="true"], .ProseMirror, .tiptap',
      },
    ],
  },
};

// ---- Git HEAD -------------------------------------------------------------------------------
function getGitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

// ---- Key harvesting (same as enumerateState in enumerate-page.mjs) --------------------------
// Uses inPageEnumerate from lib/deep-pierce.mjs — the identical function the enumerator uses.
// This ensures key format parity so the verifier's subset checks pass.
async function harvestKeys(page) {
  const entries = [];
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(inPageEnumerate);
      entries.push(...r.entries);
    } catch { /* skip inaccessible frames */ }
  }
  return entries.map(e => e.key);
}

// ---- Postcondition wait with retry ----------------------------------------------------------
const SETTLE_MS = 400;
const MAX_ATTEMPTS = 3;
const POSTCONDITION_TIMEOUT = 5000;

async function waitForPostcondition(page, openerLocator) {
  await new Promise(r => setTimeout(r, SETTLE_MS));
  const result = await checkOpenerBound(page, openerLocator);
  if (!result.ok) {
    throw new Error(`opener-bound postcondition failed: ${result.reason} (method: ${result.method})`);
  }
  return result;
}

// ---- Perform a single state probe -----------------------------------------------------------
async function probeState(page, stateDef) {
  const opener = page.locator(stateDef.openerSelector).first();
  await opener.waitFor({ state: 'visible', timeout: 5000 });

  const action = stateDef.openerAction || 'click';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (action === 'dblclick') {
        await opener.dblclick();
      } else {
        await opener.click();
      }
      await waitForPostcondition(page, opener);
      return true;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      await new Promise(r => setTimeout(r, SETTLE_MS));
    }
  }
  return false;
}

// ---- Build receipt entry --------------------------------------------------------------------
function buildReceiptEntry(moduleName, stateDef, walkArtifactPath, keysBefore, keysAfter) {
  return {
    module: moduleName,
    state_label: stateDef.label,
    walk_artifact: walkArtifactPath,
    trigger: stateDef.trigger,
    observed_keys_before: keysBefore,
    observed_keys_after: keysAfter,
    generated_by: `node scripts/walk-coverage/probe-archetype.mjs --module=${moduleName} --office=${args.office || '1604'}`,
    generated_at: new Date().toISOString(),
    git_head: getGitHead(),
  };
}

// ---- Dry-run mode ---------------------------------------------------------------------------
function dryRun() {
  const syntheticBefore = ['testid:foo-bar', 'testid:baz-qux', 'id:main-content'];
  const syntheticAfter = [...syntheticBefore, 'testid:language-option-en', 'role:option:English'];

  const receipt = {
    'expand:row-language': {
      module: 'terms-conditions',
      state_label: 'expand:row-language',
      walk_artifact: resolve(REPO_ROOT, 'reports', 'walk-coverage', 'p1-1604-terms-conditions.json'),
      trigger: 'Click first data row language combobox trigger to open Radix listbox',
      observed_keys_before: syntheticBefore,
      observed_keys_after: syntheticAfter,
      generated_by: 'node scripts/walk-coverage/probe-archetype.mjs --module=terms-conditions --office=1604',
      generated_at: new Date().toISOString(),
      git_head: getGitHead(),
    },
    'edit:html-cell': {
      module: 'terms-conditions',
      state_label: 'edit:html-cell',
      walk_artifact: resolve(REPO_ROOT, 'reports', 'walk-coverage', 'p1-1604-terms-conditions.json'),
      trigger: 'Double-click first rich-text cell to open Tiptap/ProseMirror editor',
      observed_keys_before: syntheticBefore,
      observed_keys_after: [...syntheticBefore, 'testid:editor-toolbar-bold', 'testid:editor-toolbar-italic'],
      generated_by: 'node scripts/walk-coverage/probe-archetype.mjs --module=terms-conditions --office=1604',
      generated_at: new Date().toISOString(),
      git_head: getGitHead(),
    },
  };

  const json = JSON.stringify(receipt, null, 2);
  console.log('--- DRY-RUN OUTPUT (synthetic data, proves serialization only) ---');
  console.log(json);
  console.log('--- END DRY-RUN ---');
  process.exit(0);
}

// ---- Main -----------------------------------------------------------------------------------
async function main() {
  if (args['dry-run']) {
    dryRun();
    return;
  }

  const moduleName = args.module;
  if (!moduleName || !PROBE_MODULES[moduleName]) {
    console.error(`Usage: node probe-archetype.mjs --module=<${Object.keys(PROBE_MODULES).join('|')}> --office=<id>`);
    console.error('       node probe-archetype.mjs --dry-run');
    process.exit(1);
  }

  const office = args.office || '1604';
  const config = PROBE_MODULES[moduleName];
  const walkArtifactPath = config.walkArtifact(office);

  // Auth state — same mechanism as enumerate-page.mjs
  const authPath = existsSync(DEFAULT_AUTH) ? DEFAULT_AUTH : FALLBACK_AUTH;
  if (!existsSync(authPath)) {
    console.error(`FATAL: No auth state found at ${DEFAULT_AUTH} or ${FALLBACK_AUTH}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({ storageState: authPath });
  const page = await context.newPage();

  const receipt = {};
  let failed = false;

  try {
    // Navigate to module page
    const url = config.path(office);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for content marker (readiness gate)
    try {
      await page.locator(config.contentMarker).first().waitFor({ state: 'visible', timeout: 30000 });
    } catch (err) {
      console.error(`FATAL: Content marker "${config.contentMarker}" did not appear within 30s. Login redirect or broken page.`);
      process.exit(1);
    }

    // Settle after initial load
    await new Promise(r => setTimeout(r, SETTLE_MS));

    for (const stateDef of config.states) {
      // Capture resting keys before each state action (navigate fresh each time to avoid state bleed)
      if (config.states.indexOf(stateDef) > 0) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator(config.contentMarker).first().waitFor({ state: 'visible', timeout: 30000 });
        await new Promise(r => setTimeout(r, SETTLE_MS));
      }

      const keysBefore = await harvestKeys(page);

      try {
        await probeState(page, stateDef);
      } catch (err) {
        // Record failure honestly — do NOT write a success-shaped receipt
        console.error(`PROBE FAILED for state "${stateDef.label}": ${err.message}`);
        receipt[stateDef.label] = {
          module: moduleName,
          state_label: stateDef.label,
          walk_artifact: walkArtifactPath,
          trigger: stateDef.trigger,
          observed_keys_before: keysBefore,
          observed_keys_after: [],
          generated_by: `node scripts/walk-coverage/probe-archetype.mjs --module=${moduleName} --office=${office}`,
          generated_at: new Date().toISOString(),
          git_head: getGitHead(),
          error: err.message,
        };
        failed = true;
        continue;
      }

      const keysAfter = await harvestKeys(page);
      receipt[stateDef.label] = buildReceiptEntry(moduleName, stateDef, walkArtifactPath, keysBefore, keysAfter);
    }
  } finally {
    await browser.close();
  }

  // Write receipt — but ONLY if no state failed
  if (failed) {
    console.error('PROBE INCOMPLETE: one or more states could not be opened. No receipt written.');
    process.exit(1);
  }

  const outPath = resolve(REPO_ROOT, config.receiptPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`Receipt written: ${config.receiptPath}`);
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
