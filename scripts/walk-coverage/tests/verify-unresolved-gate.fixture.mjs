#!/usr/bin/env node
// Fixture: verify-unresolved-probe-gate — exercises the PLAN_70 Phase 5 gate.
// Proves: gate fires on unresolved controls, passes on all-resolved, allowlist works,
// malformed/unreviewed allowlist entries fail closed, !derived_types denies, total===0 denies.

import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyDenominator } from '../verify-denominator.mjs';

// Read unresolved_probe_mode from guardrail-config at fixture runtime.
// Fail-safe: unreadable or unparseable config resolves to 'announce', matching the gate's own reader.
function readUnresolvedProbeMode() {
  try {
    const gcPath = join(REPO_ROOT, '.claude', 'guardrail-config.json');
    if (existsSync(gcPath)) {
      const gc = JSON.parse(readFileSync(gcPath, 'utf-8'));
      if (gc.unresolved_probe_mode === 'deny') return 'deny';
    }
  } catch { /* fail-safe to announce */ }
  return 'announce';
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const tmp = mkdtempSync(join(tmpdir(), 'probe-gate-'));
let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log(`  PASS: ${label}`); passed++; }
  else { console.error(`  FAIL: ${label} — ${detail || 'assertion failed'}`); failed++; }
}

// Minimal artifact text with Walk_State for module-config satisfaction
const moduleName = Object.keys((await import('../lib/module-config.mjs')).MODULE_CONFIG)[0] || 'service-charge';
const moduleConfig = (await import('../lib/module-config.mjs')).MODULE_CONFIG[moduleName];
const walkedLabels = (moduleConfig?.requiredStates || []).map(s => s.label).join(',');
const artifactBase = `Walk_State : office=1101 module=${moduleName} walked=[${walkedLabels}]\n`;

// Manifest rows matching entries
function makeArtifact(keys, dispositions = {}) {
  const rows = keys.map(k => `| ${k} | ${dispositions[k] || 'read-only-verified'} | - |`).join('\n');
  return artifactBase + '\n## Coverage Manifest\n| Control Ref | Disposition | TC |\n|---|---|---|\n' + rows;
}

const UNDISPOSITIONED = '_undispositioned_';

function writeJson(name, obj) {
  const p = join(tmp, name);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. All controls resolved → gate does NOT fire ──');
{
  const json = {
    entries: [{ key: 'testid:btn-save', status: 'VISIBLE' }],
    derived_types: {
      'testid:btn-save': { probe: 'resolved', type: 'button', resolved: true },
    },
  };
  const jp = writeJson('all-resolved.json', json);
  const art = makeArtifact(['testid:btn-save']);
  const result = verifyDenominator(art, jp);
  // Should not contain any UNRESOLVED-PROBE-GATE message
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  assert('no gate fire when all resolved', !gateMsg, `got: ${gateMsg}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. Unresolved controls → gate fires (mode-aware prefix check) ──');
{
  const json = {
    entries: [
      { key: 'testid:btn-save', status: 'VISIBLE' },
      { key: 'testid:btn-cancel', status: 'VISIBLE' },
    ],
    derived_types: {
      'testid:btn-save': { probe: 'resolved', type: 'button', resolved: true },
      'testid:btn-cancel': { probe: 'unresolved', type: null, resolved: false },
    },
  };
  const jp = writeJson('one-unresolved.json', json);
  const art = makeArtifact(['testid:btn-save', 'testid:btn-cancel'], {
    'testid:btn-cancel': UNDISPOSITIONED,
  });
  const result = verifyDenominator(art, jp);
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  // This assertion is mode-independent: the gate must always fire when there are unresolved probes.
  assert('gate fires on unresolved', !!gateMsg, 'no UNRESOLVED-PROBE-GATE message found');
  // Read the live mode so this assertion tracks the knob, not a hardcoded expectation.
  // announce → message carries [ANNOUNCE] prefix (non-blocking path)
  // deny    → message does NOT carry [ANNOUNCE] prefix (blocking path)
  // Asserting the pairing proves the knob is load-bearing: a gate whose output is identical in
  // both modes would fail here, whereas a hardcoded string only tests one configuration.
  const liveMode = readUnresolvedProbeMode();
  if (liveMode === 'announce') {
    assert('announce mode: message carries [ANNOUNCE] prefix', gateMsg && gateMsg.startsWith('[ANNOUNCE]'), gateMsg);
  } else {
    assert('deny mode: message does not carry [ANNOUNCE] prefix', gateMsg && !gateMsg.startsWith('[ANNOUNCE]'), gateMsg);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2a. Unresolved controls with valid manifest dispositions → gate does NOT fire ──');
{
  const json = {
    entries: [
      { key: 'testid:covered-field', status: 'VISIBLE' },
      { key: 'testid:oos-field', status: 'VISIBLE' },
    ],
    derived_types: {
      'testid:covered-field': { probe: 'unresolved', type: null, resolved: false },
      'testid:oos-field': { probe: 'unresolved', type: null, resolved: false },
    },
  };
  const jp = writeJson('valid-manifest-dispositions.json', json);
  const art = makeArtifact(['testid:covered-field', 'testid:oos-field'], {
    'testid:covered-field': 'covered-by-TC: TC-SVC-BAS-001',
    'testid:oos-field': 'out-of-scope: outside-module shared application chrome control',
  });
  const result = verifyDenominator(art, jp);
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  assert('valid manifest dispositions suppress unresolved-probe gate', !gateMsg, `got: ${gateMsg}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2b. Unresolved controls without valid dispositions → gate still fires ──');
{
  const json = {
    entries: [{ key: 'testid:undispositioned-field', status: 'VISIBLE' }],
    derived_types: {
      'testid:undispositioned-field': { probe: 'unresolved', type: null, resolved: false },
    },
  };
  const jp = writeJson('undispositioned-unresolved.json', json);
  const art = makeArtifact(['testid:undispositioned-field'], {
    'testid:undispositioned-field': UNDISPOSITIONED,
  });
  const result = verifyDenominator(art, jp);
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  assert('undispositioned unresolved key still fires the gate', !!gateMsg, 'no UNRESOLVED-PROBE-GATE message found');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2c. Malformed manifest dispositions do NOT subtract unresolved controls ──');
{
  const json = {
    entries: [
      { key: 'testid:unknown-token', status: 'VISIBLE' },
      { key: 'testid:oos-empty', status: 'VISIBLE' },
      { key: 'testid:oos-short', status: 'VISIBLE' },
    ],
    derived_types: {
      'testid:unknown-token': { probe: 'unresolved', type: null, resolved: false },
      'testid:oos-empty': { probe: 'unresolved', type: null, resolved: false },
      'testid:oos-short': { probe: 'unresolved', type: null, resolved: false },
    },
  };
  const jp = writeJson('malformed-dispositions.json', json);
  const art = makeArtifact(['testid:unknown-token', 'testid:oos-empty', 'testid:oos-short'], {
    'testid:unknown-token': 'unknown-token: not a valid manifest disposition',
    'testid:oos-empty': 'out-of-scope: ',
    'testid:oos-short': 'out-of-scope: too short',
  });
  const result = verifyDenominator(art, jp);
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  assert('malformed dispositions leave all unresolved keys counted', gateMsg && gateMsg.includes('3/3'), gateMsg || 'no UNRESOLVED-PROBE-GATE message found');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. derived_types missing → gate fires ──');
{
  const json = { entries: [{ key: 'testid:x', status: 'VISIBLE' }] };
  const jp = writeJson('no-derived.json', json);
  const art = makeArtifact(['testid:x']);
  const result = verifyDenominator(art, jp);
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  assert('gate fires when derived_types missing', !!gateMsg, 'no message');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. derived_types empty (total===0) → gate fires ──');
{
  const json = { entries: [{ key: 'testid:x', status: 'VISIBLE' }], derived_types: {} };
  const jp = writeJson('empty-derived.json', json);
  const art = makeArtifact(['testid:x']);
  const result = verifyDenominator(art, jp);
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  assert('gate fires when derived_types empty', !!gateMsg, 'no message');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 5. Allowlist: valid reviewed entry exempts a key ──');
{
  // Write a valid entry to the real allowlist, run the gate, then restore
  const allowlistPath = join(REPO_ROOT, '.claude', 'walk-unresolved-allowlist.json');
  const originalContent = readFileSync(allowlistPath, 'utf-8');
  try {
    const validAllowlist = {
      exemptions: [{
        key: 'testid:btn-save',
        exemption_class: 'known-third-party-widget',
        reason: 'Third-party sort control, no testid available',
        reviewer: 'rutvik@test.com',
        date: '2026-08-16',
        evidence: 'MCP probe run 2026-08-16 confirmed no aria role',
        reviewed: true,
      }],
    };
    writeFileSync(allowlistPath, JSON.stringify(validAllowlist));

    const json = {
      entries: [{ key: 'testid:btn-save', status: 'VISIBLE' }],
      derived_types: {
        'testid:btn-save': { probe: 'unresolved', type: null, resolved: false },
      },
    };
    const jp = writeJson('allowlisted.json', json);
    const art = makeArtifact(['testid:btn-save'], { 'testid:btn-save': UNDISPOSITIONED });
    const result = verifyDenominator(art, jp);
    const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
    assert('valid reviewed entry exempts the key (no gate fire)', !gateMsg, `got: ${gateMsg}`);
  } finally {
    writeFileSync(allowlistPath, originalContent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6a. Allowlist: unreviewed entry does NOT exempt ──');
{
  const allowlistPath = join(REPO_ROOT, '.claude', 'walk-unresolved-allowlist.json');
  const originalContent = readFileSync(allowlistPath, 'utf-8');
  try {
    const unreviewed = {
      exemptions: [{
        key: 'testid:btn-save',
        exemption_class: 'known-third-party-widget',
        reason: 'Third-party sort control',
        reviewer: 'rutvik@test.com',
        date: '2026-08-16',
        evidence: 'MCP probe run',
        reviewed: false,  // NOT reviewed
      }],
    };
    writeFileSync(allowlistPath, JSON.stringify(unreviewed));

    const json = {
      entries: [{ key: 'testid:btn-save', status: 'VISIBLE' }],
      derived_types: {
        'testid:btn-save': { probe: 'unresolved', type: null, resolved: false },
      },
    };
    const jp = writeJson('allowlisted-unreviewed.json', json);
    const art = makeArtifact(['testid:btn-save'], { 'testid:btn-save': UNDISPOSITIONED });
    const result = verifyDenominator(art, jp);
    const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
    assert('unreviewed entry does NOT exempt (gate fires)', !!gateMsg, 'gate should fire');
  } finally {
    writeFileSync(allowlistPath, originalContent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6b. Allowlist: malformed entry (missing fields) does NOT exempt ──');
{
  const allowlistPath = join(REPO_ROOT, '.claude', 'walk-unresolved-allowlist.json');
  const originalContent = readFileSync(allowlistPath, 'utf-8');
  try {
    const malformed = {
      exemptions: [{
        key: 'testid:btn-save',
        reviewed: true,
        // missing: reviewer, date, exemption_class, reason, evidence
      }],
    };
    writeFileSync(allowlistPath, JSON.stringify(malformed));

    const json = {
      entries: [{ key: 'testid:btn-save', status: 'VISIBLE' }],
      derived_types: {
        'testid:btn-save': { probe: 'unresolved', type: null, resolved: false },
      },
    };
    const jp = writeJson('allowlisted-malformed.json', json);
    const art = makeArtifact(['testid:btn-save'], { 'testid:btn-save': UNDISPOSITIONED });
    const result = verifyDenominator(art, jp);
    const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
    assert('malformed entry does NOT exempt (gate fires)', !!gateMsg, 'gate should fire');
  } finally {
    writeFileSync(allowlistPath, originalContent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6c. Allowlist: stale entry (empty key) does NOT exempt ──');
{
  const allowlistPath = join(REPO_ROOT, '.claude', 'walk-unresolved-allowlist.json');
  const originalContent = readFileSync(allowlistPath, 'utf-8');
  try {
    const stale = {
      exemptions: [{
        key: '   ',  // whitespace-only = stale/empty
        exemption_class: 'known-third-party-widget',
        reason: 'stale entry',
        reviewer: 'rutvik@test.com',
        date: '2026-08-16',
        evidence: 'old run',
        reviewed: true,
      }],
    };
    writeFileSync(allowlistPath, JSON.stringify(stale));

    const json = {
      entries: [{ key: 'testid:btn-save', status: 'VISIBLE' }],
      derived_types: {
        'testid:btn-save': { probe: 'unresolved', type: null, resolved: false },
      },
    };
    const jp = writeJson('allowlisted-stale.json', json);
    const art = makeArtifact(['testid:btn-save'], { 'testid:btn-save': UNDISPOSITIONED });
    const result = verifyDenominator(art, jp);
    const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
    assert('stale/empty-key entry does NOT exempt (gate fires)', !!gateMsg, 'gate should fire');
  } finally {
    writeFileSync(allowlistPath, originalContent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6d. Allowlist: unreadable file fails closed (gate fires) ──');
{
  const allowlistPath = join(REPO_ROOT, '.claude', 'walk-unresolved-allowlist.json');
  const originalContent = readFileSync(allowlistPath, 'utf-8');
  try {
    writeFileSync(allowlistPath, '{{{{not valid json at all}}}}');

    const json = {
      entries: [{ key: 'testid:btn-save', status: 'VISIBLE' }],
      derived_types: {
        'testid:btn-save': { probe: 'unresolved', type: null, resolved: false },
      },
    };
    const jp = writeJson('allowlisted-unreadable.json', json);
    const art = makeArtifact(['testid:btn-save'], { 'testid:btn-save': UNDISPOSITIONED });
    const result = verifyDenominator(art, jp);
    const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
    assert('unreadable allowlist fails closed (gate fires)', !!gateMsg, 'gate should fire');
  } finally {
    writeFileSync(allowlistPath, originalContent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 7. 4-sort-button case (real data shape) still fires ──');
{
  // Simulates the History page with 4 unresolved sort buttons
  const json = {
    entries: [
      { key: 'id:radix-sort-1', status: 'VISIBLE' },
      { key: 'id:radix-sort-2', status: 'VISIBLE' },
      { key: 'id:radix-sort-3', status: 'VISIBLE' },
      { key: 'id:radix-sort-4', status: 'VISIBLE' },
      { key: 'id:resolved-tab', status: 'VISIBLE' },
    ],
    derived_types: {
      'id:radix-sort-1': { probe: 'unresolved', type: null, resolved: false, evidence: '' },
      'id:radix-sort-2': { probe: 'unresolved', type: null, resolved: false, evidence: '' },
      'id:radix-sort-3': { probe: 'unresolved', type: null, resolved: false, evidence: '' },
      'id:radix-sort-4': { probe: 'unresolved', type: null, resolved: false, evidence: '' },
      'id:resolved-tab': { probe: 'resolved', type: 'trigger', resolved: true },
    },
  };
  const jp = writeJson('sort-buttons.json', json);
  const art = makeArtifact(['id:radix-sort-1', 'id:radix-sort-2', 'id:radix-sort-3', 'id:radix-sort-4', 'id:resolved-tab'], {
    'id:radix-sort-1': UNDISPOSITIONED,
    'id:radix-sort-2': UNDISPOSITIONED,
    'id:radix-sort-3': UNDISPOSITIONED,
    'id:radix-sort-4': UNDISPOSITIONED,
  });
  const result = verifyDenominator(art, jp);
  const gateMsg = (result.reasons || []).find(r => r.includes('UNRESOLVED-PROBE-GATE'));
  assert('4 sort buttons fire the gate', !!gateMsg, 'no gate message');
  assert('message mentions 4 unresolved', gateMsg && gateMsg.includes('4/5'), gateMsg);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`TOTAL: ${passed} passed, ${failed} failed`);

// Cleanup
rmSync(tmp, { recursive: true, force: true });

if (failed > 0) process.exit(1);
