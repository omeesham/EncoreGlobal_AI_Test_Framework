#!/usr/bin/env node
// scripts/walk-coverage/cross-check.mjs
// PLAN_EXHAUSTIVE_WALK_GUARANTEE — Phase 3: M4 cross-check + fresh-context critic stability gate.
//
// Three modes:
//   --manifest <path>       Load an enumerator JSON; print union/intersection/A△B counts + review list.
//   --diff <jsonA> <jsonB>  Stability check: diff two enumeration JSONs by entry-key SET; report orphans.
//   --self-test             Synthetic fixtures (no browser, no file deps). Exit 1 on any failure.
//
// Imports only from ./lib/deep-pierce.mjs — do NOT re-implement enumeration.
//
// ESM, modern Node (>=18). Match repo script style.

import { readFileSync } from 'node:fs';
import { setAlgebra } from './lib/deep-pierce.mjs';

// ---- pure helpers (also unit-tested by --self-test) ----------------------------------------

/**
 * Diff two entry arrays by key SET.
 * @param {Array<{key: string}>} entriesA
 * @param {Array<{key: string}>} entriesB
 * @returns {{ aOnly: string[], bOnly: string[] }}
 */
export function keySetDiff(entriesA, entriesB) {
  const setA = new Set(entriesA.map(e => e.key));
  const setB = new Set(entriesB.map(e => e.key));
  const aOnly = [...setA].filter(k => !setB.has(k));
  const bOnly = [...setB].filter(k => !setA.has(k));
  return { aOnly, bOnly };
}

/**
 * CrossCheck verdict: 'clean' iff every union element has a non-empty `disposition` field AND
 * zero A△B elements are unclassified (i.e., every symDiff element also has a disposition).
 * A fresh enumerator manifest is always NOT clean (entries are _undispositioned_).
 * @param {Array<{key: string, inA: boolean, inB: boolean, disposition?: string}>} entries
 * @returns {string}  'clean' | summary string describing what is missing
 */
export function crossCheckVerdict(entries) {
  const undispositioned = entries.filter(e => !e.disposition || e.disposition.trim() === '');
  const unclassifiedSymDiff = entries.filter(
    e => ((e.inA && !e.inB) || (!e.inA && e.inB)) && (!e.disposition || e.disposition.trim() === '')
  );
  if (undispositioned.length === 0 && unclassifiedSymDiff.length === 0) return 'clean';
  const parts = [];
  if (undispositioned.length > 0) parts.push(`${undispositioned.length} undispositioned entry(s)`);
  if (unclassifiedSymDiff.length > 0) parts.push(`${unclassifiedSymDiff.length} unclassified A△B element(s)`);
  return `not clean: ${parts.join('; ')}`;
}

// ---- mode: --manifest ----------------------------------------------------------------------

function runManifest(manifestPath) {
  let report;
  try {
    report = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`[cross-check] ERROR: cannot read ${manifestPath}: ${err.message}`);
    process.exit(1);
  }

  const entries = report.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error(`[cross-check] ERROR: no entries array in ${manifestPath}`);
    process.exit(1);
  }

  const alg = setAlgebra(entries);
  const state = report.state || manifestPath;

  console.log(`\n=== M4 Cross-Check — ${state} ===`);
  console.log(`  manifest     : ${manifestPath}`);
  console.log(`  union (A∪B)  : ${alg.unionCount}`);
  console.log(`  intersection : ${alg.intersectionCount}`);
  console.log(`  A△B review   : ${alg.symDiffCount}`);
  console.log(`  hint         : ${alg.crossCheckHint}`);

  const verdict = crossCheckVerdict(entries);
  console.log(`  CrossCheck   : ${verdict}`);

  if (alg.symDiff.length > 0) {
    console.log(`\n--- A△B REVIEW LIST (${alg.symDiff.length} element(s) to classify) ---`);
    for (const item of alg.symDiff) {
      const dis = item.disabled ? ' [disabled]' : '';
      console.log(`  [${item.in}]${dis}  ${item.key}  (role=${item.role}, name="${item.name}")`);
    }
  } else {
    console.log(`\n  No A△B divergence — lenses agree on all ${alg.unionCount} element(s).`);
  }
  console.log('');
}

// ---- mode: --diff --------------------------------------------------------------------------

function runDiff(pathA, pathB) {
  let reportA, reportB;
  try {
    reportA = JSON.parse(readFileSync(pathA, 'utf8'));
  } catch (err) {
    console.error(`[cross-check] ERROR: cannot read ${pathA}: ${err.message}`);
    process.exit(1);
  }
  try {
    reportB = JSON.parse(readFileSync(pathB, 'utf8'));
  } catch (err) {
    console.error(`[cross-check] ERROR: cannot read ${pathB}: ${err.message}`);
    process.exit(1);
  }

  const entriesA = reportA.entries || [];
  const entriesB = reportB.entries || [];
  const { aOnly, bOnly } = keySetDiff(entriesA, entriesB);

  const stateA = reportA.state || pathA;
  const stateB = reportB.state || pathB;

  console.log(`\n=== Stability Diff ===`);
  console.log(`  A: ${stateA}  (${entriesA.length} entries)`);
  console.log(`  B: ${stateB}  (${entriesB.length} entries)`);
  console.log(`  A-not-B (orphans in A): ${aOnly.length}`);
  console.log(`  B-not-A (orphans in B): ${bOnly.length}`);

  if (aOnly.length === 0 && bOnly.length === 0) {
    console.log(`  Result: DETERMINISTIC — zero orphans, entry-key sets are identical.`);
  } else {
    console.log(`  Result: NON-DETERMINISTIC — orphans detected; flag for manual inspection.`);
    if (aOnly.length > 0) {
      console.log(`\n  Keys in A not in B (${aOnly.length}):`);
      for (const k of aOnly) console.log(`    ${k}`);
    }
    if (bOnly.length > 0) {
      console.log(`\n  Keys in B not in A (${bOnly.length}):`);
      for (const k of bOnly) console.log(`    ${k}`);
    }
  }
  console.log('');
}

// ---- mode: --self-test ---------------------------------------------------------------------

function runSelfTest() {
  let passed = 0, failed = 0;
  function ok(name, cond, detail = '') {
    if (cond) { console.log(`  [PASS] ${name}`); passed++; }
    else { console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed++; }
  }

  // ---- setAlgebra over synthetic union ----
  const entries = [
    { key: 'a', role: 'button', name: 'Save',       why: 'native:button',  inA: true,  inB: true  },   // intersection
    { key: 'b', role: 'button', name: 'SaveDis',    why: 'native:button',  inA: true,  inB: false, disabled: true  }, // A-only disabled
    { key: 'c', role: 'tablist', name: 'NavTabs',   why: 'focusable',      inA: false, inB: true  },   // B-only focusable tablist
    { key: 'd', role: 'checkbox', name: 'IsAlt',    why: 'role:checkbox',  inA: true,  inB: true  },   // intersection
  ];

  const alg = setAlgebra(entries);
  ok('setAlgebra union count = 4',         alg.unionCount === 4,         `got ${alg.unionCount}`);
  ok('setAlgebra intersection count = 2',  alg.intersectionCount === 2,  `got ${alg.intersectionCount}`);
  ok('setAlgebra symDiff count = 2',       alg.symDiffCount === 2,       `got ${alg.symDiffCount}`);
  ok('A△B direction A-only (disabled Save)',
    alg.symDiff.find(s => s.key === 'b')?.in === 'A-only',
    JSON.stringify(alg.symDiff));
  ok('A△B direction B-only (focusable tablist)',
    alg.symDiff.find(s => s.key === 'c')?.in === 'B-only',
    JSON.stringify(alg.symDiff));

  // ---- disabled-Save is in A△B review set as A-only ----
  const disabledSaveItem = alg.symDiff.find(s => s.key === 'b');
  ok('disabled-Save appears in A△B as A-only',  disabledSaveItem?.in === 'A-only', JSON.stringify(disabledSaveItem));
  ok('disabled-Save carries disabled=true flag', disabledSaveItem?.disabled === true, JSON.stringify(disabledSaveItem));

  // ---- focusable-tablist is in A△B review set as B-only ----
  const tblItem = alg.symDiff.find(s => s.key === 'c');
  ok('focusable-tablist appears in A△B as B-only', tblItem?.in === 'B-only', JSON.stringify(tblItem));

  // ---- keySetDiff: identical sets → zero orphans ----
  const ea = [{ key: 'x' }, { key: 'y' }, { key: 'z' }];
  const eb = [{ key: 'x' }, { key: 'y' }, { key: 'z' }];
  const diffSame = keySetDiff(ea, eb);
  ok('keySetDiff identical sets → aOnly=0', diffSame.aOnly.length === 0, JSON.stringify(diffSame.aOnly));
  ok('keySetDiff identical sets → bOnly=0', diffSame.bOnly.length === 0, JSON.stringify(diffSame.bOnly));

  // ---- keySetDiff: one added key in A → 1 aOnly ----
  const ec = [{ key: 'x' }, { key: 'y' }, { key: 'z' }, { key: 'w' }];
  const ed = [{ key: 'x' }, { key: 'y' }, { key: 'z' }];
  const diffAdded = keySetDiff(ec, ed);
  ok('keySetDiff one added key in A → aOnly=1', diffAdded.aOnly.length === 1 && diffAdded.aOnly[0] === 'w',
    JSON.stringify(diffAdded));
  ok('keySetDiff one added key in A → bOnly=0', diffAdded.bOnly.length === 0, JSON.stringify(diffAdded.bOnly));

  // ---- keySetDiff: one key only in B → 1 bOnly ----
  const diffBOnly = keySetDiff(ed, ec);
  ok('keySetDiff one key only in B → bOnly=1', diffBOnly.bOnly.length === 1 && diffBOnly.bOnly[0] === 'w',
    JSON.stringify(diffBOnly));
  ok('keySetDiff one key only in B → aOnly=0', diffBOnly.aOnly.length === 0, JSON.stringify(diffBOnly.aOnly));

  // ---- crossCheckVerdict: all-dispositioned → 'clean' ----
  const fullyDispositioned = [
    { key: 'a', inA: true,  inB: true,  disposition: 'covered-by-TC: LOC-001' },
    { key: 'b', inA: true,  inB: false, disposition: 'affordance-probed: AP-042' },
    { key: 'c', inA: false, inB: true,  disposition: 'read-only-verified' },
  ];
  ok('crossCheckVerdict all-dispositioned → clean', crossCheckVerdict(fullyDispositioned) === 'clean',
    crossCheckVerdict(fullyDispositioned));

  // ---- crossCheckVerdict: one undispositioned → not clean ----
  const partiallyDispositioned = [
    { key: 'a', inA: true,  inB: true,  disposition: 'covered-by-TC: LOC-001' },
    { key: 'b', inA: true,  inB: false, disposition: '' },   // empty = undispositioned
    { key: 'c', inA: false, inB: true,  disposition: 'read-only-verified' },
  ];
  const verdictPartial = crossCheckVerdict(partiallyDispositioned);
  ok('crossCheckVerdict one undispositioned → not clean', verdictPartial !== 'clean', verdictPartial);
  ok('crossCheckVerdict mentions undispositioned count',  verdictPartial.includes('undispositioned'), verdictPartial);

  // ---- crossCheckVerdict: no disposition field at all → not clean ----
  const noneDispositioned = [
    { key: 'a', inA: true,  inB: true  },
    { key: 'b', inA: true,  inB: false },
  ];
  const verdictNone = crossCheckVerdict(noneDispositioned);
  ok('crossCheckVerdict no disposition field → not clean', verdictNone !== 'clean', verdictNone);

  // ---- summary ----
  console.log(`\nwalk-coverage cross-check fixtures: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

// ---- CLI dispatch --------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {};
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const m = args[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (m) {
      if (m[2] !== undefined) {
        o[m[1]] = m[2];
      } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
        o[m[1]] = args[++i];
      } else {
        o[m[1]] = true;
      }
    }
  }
  return o;
}

const args = parseArgs(process.argv);

if (args['self-test']) {
  runSelfTest();
} else if (args['manifest']) {
  runManifest(args['manifest']);
} else if (args['diff']) {
  // --diff <jsonA> <jsonB> — the two paths follow --diff sequentially
  // parse them from argv directly (they come after --diff)
  const diffIdx = process.argv.indexOf('--diff');
  const pathA = process.argv[diffIdx + 1];
  const pathB = process.argv[diffIdx + 2];
  if (!pathA || !pathB) {
    console.error('[cross-check] ERROR: --diff requires two JSON paths: --diff <jsonA> <jsonB>');
    process.exit(1);
  }
  runDiff(pathA, pathB);
} else {
  console.log(`
cross-check.mjs — M4 cross-check + fresh-context critic stability gate.

Usage:
  node scripts/walk-coverage/cross-check.mjs --manifest <path-to-enumerator-json>
      Load an enumerator JSON, print union/intersection/A△B counts + review list.

  node scripts/walk-coverage/cross-check.mjs --diff <jsonA> <jsonB>
      Stability check: diff two enumeration JSONs by entry-key set; report orphans.
      Zero orphans ⇒ deterministic. Non-zero ⇒ flag for manual inspection.

  node scripts/walk-coverage/cross-check.mjs --self-test
      Synthetic fixtures (no browser, no file deps). Exit 1 on any failure.

npm shortcut:  npm run walk:cross-check -- --self-test
`);
  process.exit(1);
}
