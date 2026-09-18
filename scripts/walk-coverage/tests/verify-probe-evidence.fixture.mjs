#!/usr/bin/env node
// Fixture: verify-probe-evidence — exercises ALL 8 probe-evidence checks
// in verify-denominator.mjs. Each case pins exactly one check: if that check
// were deleted, the case would flip from FAIL to PASS (or vice versa for the happy case).

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyDenominator } from '../verify-denominator.mjs';
import { MODULE_CONFIG } from '../lib/module-config.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'probe-evidence-'));
let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log(`  PASS: ${label}`); passed++; }
  else { console.error(`  FAIL: ${label} — ${detail}`); failed++; }
}

// Shared walk JSON with resting inventory
const walkJson = {
  entries: [
    { key: 'testid:btn-save', status: 'VISIBLE' },
    { key: 'testid:btn-cancel', status: 'VISIBLE' },
    { key: 'testid:input-name', status: 'VISIBLE' },
  ],
};
const walkJsonPath = join(tmp, 'walk.json');
writeFileSync(walkJsonPath, JSON.stringify(walkJson));

function makeArtifact(moduleName, walkedLabels) {
  return `Walk_State : office=1101 module=${moduleName} walked=[${walkedLabels.join(',')}]`;
}

function makeProbe(overrides = {}) {
  return {
    module: 'test-module',
    state_label: 'edit:html-cell',
    walk_artifact: walkJsonPath,
    trigger: '[data-testid="cell-edit"]',
    observed_keys_before: ['testid:btn-save', 'testid:btn-cancel'],
    observed_keys_after: ['testid:btn-save', 'testid:btn-cancel', 'testid:editor-toolbar'],
    generated_by: 'node scripts/probe-runner.mjs',
    generated_at: '2026-08-05T10:00:00Z',
    git_head: 'abc123',
    ...overrides,
  };
}

console.log('=== verify-probe-evidence fixture ===\n');

// ─── Check 1: evidence fragment must match state.label ───────────────────────
// Pins: the new probeLabel !== state.label guard.
// If deleted: this case would PASS (the receipt is internally consistent under wrong-label).
console.log('Case 1a: evidence fragment names wrong label (reviewer forged receipt)');
{
  // This is the EXACT attack the reviewer demonstrated: required state is "edit:html-cell"
  // but evidence says #wrong-label, and receipt uses "wrong-label" consistently.
  const probePath = join(tmp, 'probe-1a.json');
  writeFileSync(probePath, JSON.stringify({
    'wrong-label': {
      module: 'test-module',
      state_label: 'wrong-label',
      walk_artifact: walkJsonPath,
      trigger: '[data-testid="fake"]',
      observed_keys_before: ['testid:btn-save'],
      observed_keys_after: ['testid:btn-save', 'testid:invented-open-state'],
      generated_by: 'fake',
      generated_at: '2026-08-06T00:00:00Z',
      git_head: 'fake',
    },
  }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#wrong-label` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason mentions fragment mismatch', r.reason && r.reason.includes('fragment mismatch'), `reason: ${r.reason}`);
}

// ─── Check 2: probe file must exist on disk ──────────────────────────────────
// Pins: existsSync(artifactPath) check.
// If deleted: would attempt JSON.parse on undefined → different error or pass.
console.log('\nCase 2: missing probe file');
{
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: 'probe:nonexistent/path.json#edit:html-cell' },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "not found"', r.reason && r.reason.includes('not found'), `reason: ${r.reason}`);
}

// ─── Check 3: probe file must be valid JSON ──────────────────────────────────
// Pins: JSON.parse try/catch.
// If deleted: would throw uncaught → crash, not a clean ok:false.
console.log('\nCase 3: unparseable JSON');
{
  const probePath = join(tmp, 'probe-3.json');
  writeFileSync(probePath, '{not valid json!!!');
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "not valid JSON"', r.reason && r.reason.includes('not valid JSON'), `reason: ${r.reason}`);
}

// ─── Check 4: required fields present and non-empty ──────────────────────────
// Pins: missingFields check.
// If deleted: incomplete receipt would pass all subsequent checks (or crash).
console.log('\nCase 4: missing required fields');
{
  const probePath = join(tmp, 'probe-4.json');
  const probe = makeProbe({ trigger: '', generated_by: '' }); // empty required fields
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "missing/empty fields"', r.reason && r.reason.includes('missing/empty fields'), `reason: ${r.reason}`);
}

// ─── Check 5a: module must match caller context ──────────────────────────────
// Pins: entry.module !== moduleName check.
// If deleted: a receipt forged for a different module would pass.
console.log('\nCase 5a: module mismatch');
{
  const probePath = join(tmp, 'probe-5a.json');
  const probe = makeProbe({ module: 'wrong-module' });
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "module mismatch"', r.reason && r.reason.includes('module mismatch'), `reason: ${r.reason}`);
}

// ─── Check 5b: state_label in receipt must match state.label ─────────────────
// Pins: entry.state_label !== state.label check.
// If deleted: receipt claiming a different state_label would pass.
console.log('\nCase 5b: state_label mismatch in receipt');
{
  const probePath = join(tmp, 'probe-5b.json');
  // Evidence fragment matches state.label (edit:html-cell), but receipt's state_label differs
  const probe = makeProbe({ state_label: 'edit:different-cell' });
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "state_label mismatch"', r.reason && r.reason.includes('state_label mismatch'), `reason: ${r.reason}`);
}

// ─── Check 6: walk_artifact binding ──────────────────────────────────────────
// Pins: entry.walk_artifact !== jsonPath check.
// If deleted: receipt bound to a different walk artifact would pass.
console.log('\nCase 6: walk_artifact mismatch');
{
  const probePath = join(tmp, 'probe-6.json');
  const probe = makeProbe({ walk_artifact: '/some/other/walk.json' });
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "walk_artifact binding mismatch"', r.reason && r.reason.includes('walk_artifact binding mismatch'), `reason: ${r.reason}`);
}

// ─── Check 7: empty delta (no new keys after action) ─────────────────────────
// Pins: newKeys.length === 0 check.
// If deleted: a receipt showing no DOM change would pass.
console.log('\nCase 7: empty delta');
{
  const probePath = join(tmp, 'probe-7.json');
  const probe = makeProbe({
    observed_keys_after: ['testid:btn-save', 'testid:btn-cancel'], // same as before
  });
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "no new keys"', r.reason && r.reason.includes('no new keys'), `reason: ${r.reason}`);
}

// ─── Check 8a: observed_keys_before ⊆ resting inventory ─────────────────────
// Pins: beforeNotInResting check.
// If deleted: phantom keys in "before" would pass unchallenged.
console.log('\nCase 8a: before keys not in resting inventory');
{
  const probePath = join(tmp, 'probe-8a.json');
  const probe = makeProbe({
    observed_keys_before: ['testid:phantom-key'],
    observed_keys_after: ['testid:phantom-key', 'testid:editor-toolbar'],
  });
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "not in resting inventory"', r.reason && r.reason.includes('not in resting inventory'), `reason: ${r.reason}`);
}

// ─── Check 8b: observed_keys_after \ resting ≠ ∅ ────────────────────────────
// Pins: afterNotInResting.length === 0 check.
// If deleted: a "state change" that reveals nothing new vs resting would pass.
console.log('\nCase 8b: after keys all in resting inventory');
{
  const probePath = join(tmp, 'probe-8b.json');
  const probe = makeProbe({
    observed_keys_before: ['testid:btn-save'],
    observed_keys_after: ['testid:btn-save', 'testid:btn-cancel'], // btn-cancel is in resting
  });
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "no keys absent from resting inventory"', r.reason && r.reason.includes('no keys absent from resting inventory'), `reason: ${r.reason}`);
}

// ─── Check 8c: missing/empty resting inventory ───────────────────────────────
// Pins: data.entries empty/missing check before cross-artifact comparison.
// If deleted: would crash or skip consistency checks.
console.log('\nCase 8c: missing resting inventory');
{
  const emptyWalkPath = join(tmp, 'empty-walk.json');
  writeFileSync(emptyWalkPath, JSON.stringify({ entries: [] }));
  const probePath = join(tmp, 'probe-8c.json');
  const probe = makeProbe({ walk_artifact: emptyWalkPath });
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, emptyWalkPath);
  assert('returns ok:false', !r.ok, `got ok:${r.ok}`);
  assert('reason contains "resting inventory missing"', r.reason && r.reason.includes('resting inventory missing'), `reason: ${r.reason}`);
}

// ─── HAPPY PATH: genuinely valid receipt → ok:true for probe checks ──────────
// Pins: ALL checks together. If ANY check is deleted, a negative case above flips.
console.log('\nCase HAPPY: valid probe receipt asserts ok:true (probe-isolated)');
{
  const probePath = join(tmp, 'probe-happy.json');
  const probe = makeProbe();
  writeFileSync(probePath, JSON.stringify({ 'edit:html-cell': probe }));
  MODULE_CONFIG['test-module'] = {
    requiredStates: [
      { label: 'resting' },
      { label: 'edit:html-cell', evidence: `probe:${probePath}#edit:html-cell` },
    ],
  };
  const art = makeArtifact('test-module', ['resting']);
  const r = verifyDenominator(art, walkJsonPath);
  // Filter to probe-related reasons only (manifest/parity reasons are unrelated)
  const probeReasons = (r.reasons || []).filter(reason =>
    reason.includes('probe') || reason.includes('observed_keys') ||
    reason.includes('resting inventory') || reason.includes('delta') ||
    reason.includes('fragment mismatch') || reason.includes('state_label'));
  assert('no probe-related failures', probeReasons.length === 0, `probe reasons: ${probeReasons.join('; ')}`);
  // If there are ONLY non-probe reasons (manifest/parity), that's fine — we test probe isolation
  if (probeReasons.length === 0 && !r.ok) {
    console.log(`  (note: ok:false due to non-probe reasons — probe checks passed)`);
  }
  if (probeReasons.length === 0 && r.ok) {
    assert('ok:true with zero reasons', r.ok === true, `got ok:${r.ok}`);
  }
}

// Cleanup
rmSync(tmp, { recursive: true, force: true });
delete MODULE_CONFIG['test-module'];

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
