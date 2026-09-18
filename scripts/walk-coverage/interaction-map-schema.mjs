#!/usr/bin/env node
// scripts/walk-coverage/interaction-map-schema.mjs
// PLAN_FORCED_DISCOVERY_LOCATOR_EXHAUSTION Phase 1 — Interaction-map schema + validator.
//
// Validates interaction-map records against the 9-class taxonomy.
// R4 enforcement: every element MUST emit — silence is a schema violation.
// R3 enforcement: context-selector records MUST cite a second independent source.
//
// Usage:
//   node interaction-map-schema.mjs --self-test
//   node interaction-map-schema.mjs --validate <path.json>
//
// ESM, Node >=18. Matches repo script style (verify-denominator.mjs, cross-check.mjs).

import { readFileSync } from 'node:fs';

export const SCHEMA_VERSION = '1.0.0';

export const ELEMENT_CLASSES = [
  'filter',
  'sort',
  'pagination',
  'editable-cell',
  'guard',
  'io',
  'menu-disclosure',
  'add-picker',
  'context-selector',
];

// Mandatory-effect classes: PROBED status requires probes[] + effectObserved.
export const MANDATORY_EFFECT_CLASSES = [
  'filter', 'sort', 'pagination', 'guard', 'io', 'context-selector',
];

export const VALID_EMISSION_STATUSES = ['PROBED', 'DATA-BLOCKED', 'UNCLASSIFIED'];

export const VALID_DISPOSITIONS = [
  'COVERED', 'DATA-BLOCKED', 'DIFFERENTIAL-DATA-REQUIRED', 'BUG-CONFIRMED',
  'BY-DESIGN', 'UNCLASSIFIED', 'USER-AUTHORIZED-DEFERRAL', 'PARTIAL',
];

// capability values for io elements — marks the element as an export or import surface.
// Absent = oracle 3 reports UNCHECKABLE; present = oracle 3 can detect export+import pairs.
export const VALID_CAPABILITIES = ['export', 'import'];

// ---------------------------------------------------------------------------
// Element-level validation
// ---------------------------------------------------------------------------

/**
 * Validate a single interaction-map element record.
 * @param {object} el - Element record
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateElement(el) {
  const errors = [];
  if (!el || typeof el !== 'object') {
    return { valid: false, errors: ['Element must be a non-null object'] };
  }

  // elementId required
  if (!el.elementId || typeof el.elementId !== 'string' || !el.elementId.trim()) {
    errors.push('MISSING: elementId is required (non-empty string)');
  }

  // class required, must be one of the 9
  if (!el.class || !ELEMENT_CLASSES.includes(el.class)) {
    errors.push(`INVALID-CLASS: must be one of [${ELEMENT_CLASSES.join(', ')}]; got "${el.class ?? '(missing)'}"`);
  }

  // R4: emissionStatus REQUIRED — silence is a schema violation
  if (!el.emissionStatus || !VALID_EMISSION_STATUSES.includes(el.emissionStatus)) {
    errors.push(
      `R4-VIOLATION: emissionStatus REQUIRED [${VALID_EMISSION_STATUSES.join(', ')}]; ` +
      `got "${el.emissionStatus ?? '(missing)'}". ` +
      'Silence (missing emission) must be mechanically distinguishable from "checked, found nothing".'
    );
  }

  // R4: DATA-BLOCKED must carry reason + unlock
  if (el.emissionStatus === 'DATA-BLOCKED') {
    if (!el.dataBlockedReason || typeof el.dataBlockedReason !== 'string' || !el.dataBlockedReason.trim()) {
      errors.push('R4-VIOLATION: DATA-BLOCKED requires non-empty dataBlockedReason');
    }
    if (!el.dataBlockedUnlock || typeof el.dataBlockedUnlock !== 'string' || !el.dataBlockedUnlock.trim()) {
      errors.push('R4-VIOLATION: DATA-BLOCKED requires non-empty dataBlockedUnlock (what makes it exercisable)');
    }
  }

  // Mandatory-effect class + PROBED → probes[] + effectObserved
  const isMandatory = MANDATORY_EFFECT_CLASSES.includes(el.class);
  if (el.emissionStatus === 'PROBED' && isMandatory) {
    if (!Array.isArray(el.probes) || el.probes.length === 0) {
      errors.push(`MANDATORY-EFFECT: "${el.class}" with PROBED status requires non-empty probes[]`);
    }
    if (typeof el.effectObserved !== 'boolean') {
      errors.push(`MANDATORY-EFFECT: "${el.class}" with PROBED status requires explicit boolean effectObserved`);
    }
  }

  // R3: context-selector requires secondSource with type + ref
  if (el.class === 'context-selector') {
    if (!el.secondSource || typeof el.secondSource !== 'object') {
      errors.push(
        'R3-VIOLATION: context-selector MUST cite a secondSource — ' +
        'the selector is not permitted to be its own oracle'
      );
    } else {
      if (!el.secondSource.type || typeof el.secondSource.type !== 'string' || !el.secondSource.type.trim()) {
        errors.push('R3-VIOLATION: secondSource.type must be non-empty (e.g. "api-list", "sibling-screen")');
      }
      if (!el.secondSource.ref || typeof el.secondSource.ref !== 'string' || !el.secondSource.ref.trim()) {
        errors.push('R3-VIOLATION: secondSource.ref must be non-empty (the specific source reference)');
      }
    }
  }

  // disposition required
  if (!el.disposition || typeof el.disposition !== 'string' || !el.disposition.trim()) {
    errors.push('MISSING: disposition is required');
  }

  // basis required (anti-prose-oracle; plan line 197-200)
  if (!el.basis || typeof el.basis !== 'string' || !el.basis.trim()) {
    errors.push('MISSING: basis is required (observed:<file> | claim:<source> | census:<artifact>)');
  }

  // persistedStateReRead (optional, nullable): result of reloading and re-reading persisted state
  // after an io/save/import probe. Absent → oracle 2 reports UNCHECKABLE (≠ PASS).
  // agrees:false → UI claim and server state disagree (FAIL). agrees:true → agreement confirmed.
  if (el.persistedStateReRead !== undefined && el.persistedStateReRead !== null) {
    if (typeof el.persistedStateReRead !== 'object' || Array.isArray(el.persistedStateReRead)) {
      errors.push('INVALID: persistedStateReRead must be an object { agrees: boolean, ... } when present');
    } else if (typeof el.persistedStateReRead.agrees !== 'boolean') {
      errors.push('INVALID: persistedStateReRead.agrees must be an explicit boolean');
    }
  }

  // capability (optional, nullable): marks an io element as an export or import surface.
  // Absent → oracle 3 reports UNCHECKABLE (≠ PASS); present → oracle 3 can detect export+import pairs.
  if (el.capability !== undefined && el.capability !== null) {
    if (!VALID_CAPABILITIES.includes(el.capability)) {
      errors.push(`INVALID: capability must be one of [${VALID_CAPABILITIES.join(', ')}]; got "${el.capability}"`);
    }
  }

  // roundTripDisposition (optional, nullable): records that the system's own output was fed back
  // to its own input and the outcome. Absent when no round-trip was attempted.
  if (el.roundTripDisposition !== undefined && el.roundTripDisposition !== null) {
    if (typeof el.roundTripDisposition !== 'string' || !el.roundTripDisposition.trim()) {
      errors.push('INVALID: roundTripDisposition must be a non-empty string when present');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Map-level validation
// ---------------------------------------------------------------------------

/**
 * Validate a full interaction-map document.
 * @param {object} map - { version, surface, elements: [...] }
 * @returns {{ valid: boolean, errors: Array<{elementId: string, errors: string[]}>, summary: string }}
 */
export function validateMap(map) {
  const allErrors = [];
  if (!map || typeof map !== 'object') {
    return { valid: false, errors: [{ elementId: '(root)', errors: ['Input must be a JSON object'] }], summary: 'Invalid input' };
  }
  if (!map.version) {
    allErrors.push({ elementId: '(root)', errors: ['version field is required'] });
  }
  if (!map.surface || typeof map.surface !== 'string' || !map.surface.trim()) {
    allErrors.push({ elementId: '(root)', errors: ['surface field is required'] });
  }
  if (!Array.isArray(map.elements) || map.elements.length === 0) {
    allErrors.push({ elementId: '(root)', errors: ['elements[] is required and must be non-empty'] });
    return { valid: false, errors: allErrors, summary: 'No elements' };
  }

  for (const el of map.elements) {
    const r = validateElement(el);
    if (!r.valid) {
      allErrors.push({ elementId: el.elementId || '(unknown)', errors: r.errors });
    }
  }

  const valid = allErrors.length === 0;
  const violationCount = allErrors.reduce((s, e) => s + e.errors.length, 0);
  const summary = valid
    ? `PASS: ${map.elements.length} elements validated, 0 violations`
    : `FAIL: ${violationCount} violation(s) across ${allErrors.length} element(s)`;
  return { valid, errors: allErrors, summary };
}

// ---------------------------------------------------------------------------
// Self-test truth table
// ---------------------------------------------------------------------------

function selfTest() {
  const results = [];

  function check(name, input, expectValid) {
    const r = validateElement(input);
    const pass = r.valid === expectValid;
    results.push({ name, expectValid, actualValid: r.valid, pass, errors: r.errors });
  }

  // ---- VALID records ----
  check('T01-valid-filter', {
    elementId: 'active-checkbox', class: 'filter', emissionStatus: 'PROBED',
    probes: [{ action: 'toggle-on', before: { rowCount: 100 }, after: { rowCount: 50 } }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk-A-1105.verify.txt',
  }, true);

  check('T02-valid-context-selector', {
    elementId: 'change-local-office', class: 'context-selector', emissionStatus: 'PROBED',
    probes: [{ action: 'select-office-1105', before: { office: '1604' }, after: { office: '1105' } }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk-A-office-switch.verify.txt',
    secondSource: { type: 'api-list', ref: 'GET /api/locations returns full office set including inactive 1222' },
  }, true);

  check('T03-valid-data-blocked', {
    elementId: 'import-upload', class: 'io', emissionStatus: 'DATA-BLOCKED',
    disposition: 'DATA-BLOCKED', basis: 'observed:import-dialog-open.verify.txt',
    dataBlockedReason: 'Import requires valid CSV matching export schema; no test file available',
    dataBlockedUnlock: 'Export CSV from surface, then re-import for round-trip test',
  }, true);

  check('T04-valid-editable-cell', {
    elementId: 'override-price-cell', class: 'editable-cell', emissionStatus: 'PROBED',
    probes: [{ action: 'click-edit-type-save', before: { value: '10.00' }, after: { value: '25.00' } }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk-A-edit.verify.txt',
  }, true);

  check('T05-valid-unclassified', {
    elementId: 'unknown-widget', class: 'add-picker', emissionStatus: 'UNCLASSIFIED',
    disposition: 'UNCLASSIFIED', basis: 'observed:walk-unclassified.txt',
  }, true);

  // ---- R4 VIOLATIONS ----
  check('T06-R4-missing-emission', {
    elementId: 'currency-filter', class: 'filter',
    disposition: 'COVERED', basis: 'observed:walk-A.txt',
    // emissionStatus deliberately missing → R4 violation
  }, false);

  check('T07-R4-blocked-no-reason', {
    elementId: 'pagination-ctrl', class: 'pagination', emissionStatus: 'DATA-BLOCKED',
    disposition: 'DATA-BLOCKED', basis: 'observed:walk.txt',
    dataBlockedUnlock: 'Find office with >10 rows',
    // dataBlockedReason missing
  }, false);

  check('T08-R4-blocked-no-unlock', {
    elementId: 'pagination-ctrl', class: 'pagination', emissionStatus: 'DATA-BLOCKED',
    disposition: 'DATA-BLOCKED', basis: 'observed:walk.txt',
    dataBlockedReason: 'Office 1604 has only 7 rows',
    // dataBlockedUnlock missing
  }, false);

  // ---- R3 VIOLATIONS ----
  check('T09-R3-no-second-source', {
    elementId: 'change-local-office', class: 'context-selector', emissionStatus: 'PROBED',
    probes: [{ action: 'select', before: {}, after: {} }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    // secondSource missing → R3 violation
  }, false);

  check('T10-R3-empty-source-type', {
    elementId: 'change-local-office', class: 'context-selector', emissionStatus: 'PROBED',
    probes: [{ action: 'select', before: {}, after: {} }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    secondSource: { type: '', ref: 'some-ref' },
  }, false);

  check('T11-R3-empty-source-ref', {
    elementId: 'change-local-office', class: 'context-selector', emissionStatus: 'PROBED',
    probes: [{ action: 'select', before: {}, after: {} }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    secondSource: { type: 'api-list', ref: '' },
  }, false);

  // ---- MISSING FIELDS ----
  check('T12-missing-elementId', {
    class: 'sort', emissionStatus: 'PROBED',
    probes: [{ action: 'click-header' }], effectObserved: true,
    disposition: 'COVERED', basis: 'observed:walk.txt',
  }, false);

  check('T13-missing-disposition', {
    elementId: 'sort-col', class: 'sort', emissionStatus: 'PROBED',
    probes: [{ action: 'click-header' }], effectObserved: true, basis: 'observed:walk.txt',
  }, false);

  check('T14-missing-basis', {
    elementId: 'sort-col', class: 'sort', emissionStatus: 'PROBED',
    probes: [{ action: 'click-header' }], effectObserved: true, disposition: 'COVERED',
  }, false);

  check('T15-invalid-class', {
    elementId: 'mystery', class: 'teleporter', emissionStatus: 'PROBED',
    probes: [{ action: 'beam' }], effectObserved: true,
    disposition: 'UNCLASSIFIED', basis: 'observed:walk.txt',
  }, false);

  // ---- MANDATORY-EFFECT VIOLATIONS ----
  check('T16-mandatory-no-probes', {
    elementId: 'active-filter', class: 'filter', emissionStatus: 'PROBED',
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    // probes[] missing for mandatory-effect class
  }, false);

  check('T17-mandatory-no-effectObserved', {
    elementId: 'active-filter', class: 'filter', emissionStatus: 'PROBED',
    probes: [{ action: 'toggle' }], disposition: 'COVERED', basis: 'observed:walk.txt',
    // effectObserved missing
  }, false);

  // ---- NEW OPTIONAL FIELDS (persistedStateReRead / capability / roundTripDisposition) ----
  check('T18-valid-io-all-new-fields', {
    elementId: 'export-btn', class: 'io', emissionStatus: 'PROBED',
    probes: [{ action: 'click-export', before: {}, after: { fileDownloaded: true } }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    persistedStateReRead: { agrees: true, note: 're-read after save matched UI claim' },
    capability: 'export',
    roundTripDisposition: 'PASS: exported CSV re-imported without schema rejection',
  }, true);

  check('T19-invalid-persistedStateReRead-not-object', {
    elementId: 'save-btn', class: 'io', emissionStatus: 'PROBED',
    probes: [{ action: 'click-save', before: {}, after: {} }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    persistedStateReRead: 'yes-agrees',  // must be an object, not a string
  }, false);

  check('T20-invalid-persistedStateReRead-no-agrees-boolean', {
    elementId: 'save-btn', class: 'io', emissionStatus: 'PROBED',
    probes: [{ action: 'click-save', before: {}, after: {} }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    persistedStateReRead: { note: 'missing agrees field' },  // agrees boolean missing
  }, false);

  check('T21-invalid-capability-unknown-value', {
    elementId: 'export-btn', class: 'io', emissionStatus: 'PROBED',
    probes: [{ action: 'click', before: {}, after: {} }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    capability: 'download',  // not in VALID_CAPABILITIES
  }, false);

  check('T22-invalid-roundTripDisposition-empty-string', {
    elementId: 'export-btn', class: 'io', emissionStatus: 'PROBED',
    probes: [{ action: 'click', before: {}, after: {} }],
    effectObserved: true, disposition: 'COVERED', basis: 'observed:walk.txt',
    roundTripDisposition: '   ',  // non-empty when trimmed required
  }, false);

  // Print truth table
  console.log('INTERACTION-MAP SCHEMA SELF-TEST TRUTH TABLE');
  console.log('='.repeat(90));
  console.log(`${'Test'.padEnd(42)} ${'Expected'.padEnd(10)} ${'Actual'.padEnd(10)} ${'Result'.padEnd(6)}`);
  console.log('-'.repeat(90));

  let allPass = true;
  for (const r of results) {
    const status = r.pass ? 'PASS' : '** FAIL **';
    if (!r.pass) allPass = false;
    console.log(`${r.name.padEnd(42)} ${(r.expectValid ? 'valid' : 'invalid').padEnd(10)} ${(r.actualValid ? 'valid' : 'invalid').padEnd(10)} ${status}`);
    if (!r.pass) {
      for (const e of r.errors) console.log(`    ERROR: ${e}`);
    }
  }

  console.log('-'.repeat(90));
  console.log(`Total: ${results.length} | Passed: ${results.filter(r => r.pass).length} | Failed: ${results.filter(r => !r.pass).length}`);
  console.log(allPass ? '\nVERDICT: ALL SELF-TESTS PASSED' : '\nVERDICT: SELF-TESTS FAILED');
  process.exit(allPass ? 0 : 1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const scriptName = 'interaction-map-schema.mjs';
const isMain = process.argv[1]?.endsWith(scriptName) || process.argv[1]?.endsWith('interaction-map-schema');

if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--self-test') {
    selfTest();
  } else if (args[0] === '--validate' && args[1]) {
    try {
      const raw = readFileSync(args[1], 'utf-8');
      const map = JSON.parse(raw);
      const result = validateMap(map);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    } catch (err) {
      console.error(`Failed to validate: ${err.message}`);
      process.exit(2);
    }
  } else {
    console.log(`Usage:\n  node ${scriptName} --self-test\n  node ${scriptName} --validate <file.json>`);
    process.exit(1);
  }
}
