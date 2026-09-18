#!/usr/bin/env node
// Regression fixture for colleague-reported walk-coverage tooling bugs.

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractManifestRows } from '../lib/coverage-manifest.mjs';
import { verifyDenominator } from '../verify-denominator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const tmp = join(tmpdir(), `collab-tooling-bugs-${process.pid}`);
const caseRowsPath = join(REPO_ROOT, 'reports', 'walk-coverage', 'case-rows.json');
const backupPath = join(tmp, 'case-rows.backup.json');
let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`PASS: ${label}`);
    passed++;
  } else {
    console.error(`FAIL: ${label}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

function writeFixtureInputs() {
  mkdirSync(tmp, { recursive: true });
  const completionRecordPath = join(tmp, 'collab-bug1-completion.json');
  const inventoryPath = join(tmp, 'collab-bug1-inventory.md');
  const emittedRowsPath = join(tmp, 'case-rows.json');

  writeFileSync(completionRecordPath, JSON.stringify({
    entries: [{ key: 'testid:collab-field', status: 'VISIBLE' }],
    derived_types: {
      'testid:collab-field': { probe: 'unresolved', type: null, resolved: false },
    },
  }, null, 2));

  writeFileSync(inventoryPath, [
    '## Field Inventory',
    '| Field | data-testid | Control Type | Default Value | Validation Rules | Enabled/Disabled States | Cross-field deps | Notes |',
    '|---|---|---|---|---|---|---|---|',
    '| Collab Field | collab-field | text | empty | none | enabled | none | fixture |',
    '',
  ].join('\n'));

  return { completionRecordPath, inventoryPath, emittedRowsPath };
}

function runEmitter(completionRecordPath, inventoryPath, emittedRowsPath) {
  const result = spawnSync(process.execPath, [
    'scripts/walk-coverage/emit-case-rows.mjs',
    `--completion-record=${completionRecordPath}`,
    `--inventory=${inventoryPath}`,
    `--out=${emittedRowsPath}`,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });

  ok('Bug 1 emitter exits 0 for real case-row artifact', result.status === 0, result.stderr || result.stdout);
}

function runEmitterWithStdoutRedirectedToOut(completionRecordPath, inventoryPath, emittedRowsPath) {
  const stdoutFd = openSync(emittedRowsPath, 'a');
  try {
    const result = spawnSync(process.execPath, [
      'scripts/walk-coverage/emit-case-rows.mjs',
      `--completion-record=${completionRecordPath}`,
      `--inventory=${inventoryPath}`,
      `--out=${emittedRowsPath}`,
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', stdoutFd, 'pipe'],
    });

    ok('Bug 1 same-file stdout redirection exits 0', result.status === 0, result.stderr);
  } finally {
    closeSync(stdoutFd);
  }
}

function withCaseRowsArtifact(emittedRowsPath, fn) {
  mkdirSync(dirname(caseRowsPath), { recursive: true });
  const hadOriginal = existsSync(caseRowsPath);
  if (hadOriginal) copyFileSync(caseRowsPath, backupPath);
  copyFileSync(emittedRowsPath, caseRowsPath);
  try {
    fn();
  } finally {
    if (hadOriginal) copyFileSync(backupPath, caseRowsPath);
    else rmSync(caseRowsPath, { force: true });
  }
}

function bug1() {
  const { completionRecordPath, inventoryPath, emittedRowsPath } = writeFixtureInputs();
  runEmitterWithStdoutRedirectedToOut(completionRecordPath, inventoryPath, emittedRowsPath);

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(emittedRowsPath, 'utf-8'));
  } catch (err) {
    ok('Bug 1 same-file redirected artifact is JSON parseable', false, err.message);
    return;
  }

  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  ok('Bug 1 same-file redirected JSON carries rows', Array.isArray(rows) && rows.length > 0, JSON.stringify(parsed));

  runEmitter(completionRecordPath, inventoryPath, emittedRowsPath);

  withCaseRowsArtifact(emittedRowsPath, () => {
    const artifact = [
      'Walk_State: module=corporate-pricing-strategy walked=[resting]',
      '',
      '## Coverage Manifest',
      '| element-key | role | found | disposition |',
      '|---|---|---|---|',
      '| `testid:collab-field` | textbox | 2026-08-18 | read-only-verified |',
      '',
    ].join('\n');
    const result = verifyDenominator(artifact, completionRecordPath);
    ok('Bug 1 verifier reads the same emitted artifact', result.ok === true, result.reason || JSON.stringify(result));
  });
}

function bug2() {
  const rows = extractManifestRows([
    '## Coverage Manifest',
    '| element-key | role | found | disposition |',
    '|---|---|---|---|',
    '| `struct:button|Order Search|div/div` | button | 2026-08-18 | read-only-verified |',
    '',
  ].join('\n'));
  ok(
    'Bug 2 backtick-wrapped key containing bars stays intact',
    rows.length === 1 && rows[0].controlRef === 'struct:button|Order Search|div/div',
    `got ${rows[0]?.controlRef}`,
  );
}

function assertWalkState(label, line) {
  const jsonPath = join(tmp, `${label}.json`);
  writeFileSync(jsonPath, JSON.stringify({ entries: [] }, null, 2));
  const result = verifyDenominator(`${line}\n`, jsonPath);
  const reasons = result.reasons || (result.reason ? [result.reason] : []);
  ok(
    `Bug 3 ${label} Walk_State form parses`,
    !reasons.some(reason => reason.includes('Walk_State line missing/unparseable')),
    reasons.join('; '),
  );
  ok(
    `Bug 3 ${label} Walk_State required state is recognized`,
    !reasons.some(reason => reason.includes('required walk state missing')),
    reasons.join('; '),
  );
}

function bug3() {
  assertWalkState('plain', 'Walk_State: module=corporate-pricing-strategy walked=[resting]');
  assertWalkState('bold', '**Walk_State**: module=corporate-pricing-strategy walked=[resting]');
}

try {
  bug1();
  bug2();
  bug3();
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`TOTAL: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
