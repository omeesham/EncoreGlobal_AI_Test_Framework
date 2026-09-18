#!/usr/bin/env node
// scripts/walk-coverage/dependent-effect-probe.mjs
// PLAN_UNIQUE_CASE_COVERAGE_FLOOR — Phase 6: dependent-effect probe.
//
// Verifies that editing a SOURCE pricing field propagates to a DEPENDENT control (a DIFFERENT
// control than the one edited). This is structurally distinct from a persistence check: the
// assertion compares before/after on the DEPENDENT field, never the source field.
//
// SCOPE: build-only (offline fixture validation). The live run is dispatcher-held.
// OFFICE FENCE: hard-coded allowlist — 4104 / 4107 / 9220 / 9311 / 2463 / 8843.
// MUTATION: opt-in, explicit invocation only. Never part of enumeration.
//
// Usage:
//   node scripts/walk-coverage/dependent-effect-probe.mjs --office=4107 --module=pricing [--dry-run]
//   node scripts/walk-coverage/dependent-effect-probe.mjs --offline-fixture=<path>
//   node scripts/walk-coverage/dependent-effect-probe.mjs --validate-config --module=pricing

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_CONFIG } from './lib/module-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ---- Hard office fence (code-enforced, not a comment) ----------------------------------------
const ALLOWED_OFFICES = Object.freeze(['4104', '4107', '9220', '9311', '2463', '8843']);

function enforceOfficeFence(office) {
  const normalized = String(office).trim();
  if (!ALLOWED_OFFICES.includes(normalized)) {
    const msg = `[dependent-effect-probe] REFUSED: office "${normalized}" is NOT in the allowed set.\n` +
      `Allowed offices: ${ALLOWED_OFFICES.join(', ')}.\n` +
      `Zero navigation performed. Exiting.`;
    console.error(msg);
    process.exit(1);
  }
  return normalized;
}

// ---- CLI args ---------------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return o;
}

// ---- Config validation (undeclared-pair detection) --------------------------------------------
/**
 * Validates that a module with editable pricing fields has declared dependency pairs.
 * FAIL-CLOSED: editable fields present + zero dependency pairs = failure.
 *
 * @param {string} moduleName
 * @returns {{ ok: boolean, module: string, reason?: string }}
 */
export function validateDependencyConfig(moduleName) {
  const cfg = MODULE_CONFIG[moduleName];
  if (!cfg) {
    return { ok: false, module: moduleName, reason: `Module "${moduleName}" not found in MODULE_CONFIG.` };
  }
  const editable = cfg.editableFields || [];
  const pairs = cfg.dependencyPairs || [];

  if (editable.length > 0 && pairs.length === 0) {
    return {
      ok: false,
      module: moduleName,
      reason: `Module "${moduleName}" declares ${editable.length} editable pricing field(s) ` +
        `(${editable.join(', ')}) but ZERO dependency pairs. ` +
        `Every editable pricing surface must declare source→dependent pairs. This is a coverage gap.`,
    };
  }
  return { ok: true, module: moduleName };
}

// ---- Dependent-effect assertion (the core logic) ---------------------------------------------
/**
 * The structural proof that this is NOT a persistence check:
 * - `sourceField` and `dependentField` are REQUIRED to be DIFFERENT (enforced by assertion).
 * - The probe asserts on `dependentField`'s before/after, never on `sourceField`.
 * - A fixture where sourceField persists but dependentField does NOT update → FAILS.
 *
 * @param {object} fixture
 * @param {string} fixture.sourceField       - The field that was edited
 * @param {string} fixture.dependentField    - The field that should propagate
 * @param {*}      fixture.sourceBeforeValue - Source field value before edit
 * @param {*}      fixture.sourceAfterValue  - Source field value after save+reload
 * @param {*}      fixture.dependentBeforeValue - Dependent field before source edit
 * @param {*}      fixture.dependentAfterValue  - Dependent field after save+reload
 * @returns {{ pass: boolean, observation?: object, reason?: string }}
 */
export function assertDependentEffect(fixture) {
  const { sourceField, dependentField, sourceBeforeValue, sourceAfterValue,
    dependentBeforeValue, dependentAfterValue } = fixture;

  // Structural guard: source and dependent MUST be different fields.
  // This makes the weaker-check substitution (re-reading the same field) structurally impossible.
  if (sourceField === dependentField) {
    throw new Error(
      `[STRUCTURAL VIOLATION] sourceField and dependentField are identical ("${sourceField}"). ` +
      `The probe requires assertion on a DIFFERENT control than the one edited. ` +
      `This is not a persistence check.`
    );
  }

  // Verify the source field actually changed (precondition for a meaningful probe).
  if (sourceBeforeValue === sourceAfterValue) {
    return {
      pass: false,
      reason: `Source field "${sourceField}" did not change (before=${sourceBeforeValue}, after=${sourceAfterValue}). ` +
        `Cannot assess dependent propagation without a source mutation.`,
    };
  }

  // The actual dependent-effect assertion: did the dependent field update?
  const dependentChanged = dependentBeforeValue !== dependentAfterValue;

  if (!dependentChanged) {
    // FAILURE: source changed but dependent did NOT propagate.
    // Emit as an Observation for Phase 5's capture-and-escalate path.
    return {
      pass: false,
      observation: buildObservation({
        sourceField, dependentField,
        sourceBeforeValue, sourceAfterValue,
        dependentBeforeValue, dependentAfterValue,
      }),
      reason: `Dependent field "${dependentField}" did NOT update after source field "${sourceField}" ` +
        `changed from "${sourceBeforeValue}" to "${sourceAfterValue}". ` +
        `Dependent remained: "${dependentBeforeValue}" (before) → "${dependentAfterValue}" (after).`,
    };
  }

  // PASS: dependent field propagated.
  return { pass: true };
}

// ---- Observation contract (Phase 5 reconciliation) -------------------------------------------
// Shape emitted for Phase 5's capture-and-escalate path to consume.
// Section: "dependent-effect-observation"
// Fields: type, sourceField, dependentField, sourceBeforeValue, sourceAfterValue,
//         dependentBeforeValue, dependentAfterValue, timestamp, office, module
function buildObservation({ sourceField, dependentField, sourceBeforeValue, sourceAfterValue,
  dependentBeforeValue, dependentAfterValue, office, module }) {
  return {
    section: 'dependent-effect-observation',
    type: 'DEPENDENT_PROPAGATION_FAILURE',
    sourceField,
    dependentField,
    sourceBeforeValue,
    sourceAfterValue,
    dependentBeforeValue,
    dependentAfterValue,
    timestamp: new Date().toISOString(),
    office: office || null,
    module: module || null,
  };
}

// ---- Offline fixture runner ------------------------------------------------------------------
function runOfflineFixture(fixturePath) {
  if (!existsSync(fixturePath)) {
    console.error(`[dependent-effect-probe] Fixture not found: ${fixturePath}`);
    process.exit(1);
  }
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const results = [];
  for (const fx of (Array.isArray(fixtures) ? fixtures : [fixtures])) {
    try {
      const result = assertDependentEffect(fx);
      results.push({ fixture: fx, ...result });
    } catch (e) {
      results.push({ fixture: fx, pass: false, error: e.message });
    }
  }
  const allPass = results.every(r => r.pass);
  console.log(JSON.stringify({ allPass, results }, null, 2));
  process.exit(allPass ? 0 : 1);
}

// ---- Main (CLI dispatch) ---------------------------------------------------------------------
const args = parseArgs(process.argv);

if (args['validate-config']) {
  const mod = args.module;
  if (!mod) { console.error('--module is required with --validate-config'); process.exit(1); }
  const result = validateDependencyConfig(mod);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (args['offline-fixture']) {
  const fxPath = resolve(args['offline-fixture']);
  runOfflineFixture(fxPath);
}

if (args.office) {
  const office = enforceOfficeFence(args.office);
  const mod = args.module || 'pricing';

  // Validate config first
  const cfgResult = validateDependencyConfig(mod);
  if (!cfgResult.ok) {
    console.error(`[dependent-effect-probe] Config validation FAILED: ${cfgResult.reason}`);
    process.exit(1);
  }

  if (args['dry-run']) {
    console.log(`[dependent-effect-probe] DRY-RUN: office=${office}, module=${mod}`);
    console.log(`  Would navigate to pricing surface for office ${office}`);
    console.log(`  Dependency pairs to probe:`);
    const pairs = MODULE_CONFIG[mod].dependencyPairs;
    for (const p of pairs) {
      console.log(`    ${p.source} → ${p.dependent} (${p.description})`);
    }
    console.log(`  Dry-run complete. No navigation performed.`);
    process.exit(0);
  }

  // Live mode — NOT implemented in this build-only ticket.
  console.error('[dependent-effect-probe] Live mode is dispatcher-held. Use --dry-run or --offline-fixture.');
  process.exit(1);
}

// No valid mode selected
if (!args['offline-fixture'] && !args['validate-config'] && !args.office) {
  console.error('Usage: --office=<id> [--dry-run] | --offline-fixture=<path> | --validate-config --module=<name>');
  process.exit(1);
}
