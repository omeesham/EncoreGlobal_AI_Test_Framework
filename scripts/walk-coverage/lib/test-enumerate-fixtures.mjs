#!/usr/bin/env node
// scripts/walk-coverage/lib/test-enumerate-fixtures.mjs
// PLAN_EXHAUSTIVE_WALK_GUARANTEE — Phase 1 unit fixtures for the deterministic Node-side helpers
// of deep-pierce.mjs (templateKey / collapseArchetypes / setAlgebra / renderManifest). Offline, no
// browser. Mirrors the `.claude/hooks/lib/test-*-fixtures.mjs` convention. Exit 1 on any failure.
//
//   node scripts/walk-coverage/lib/test-enumerate-fixtures.mjs   # expect: all pass

import { templateKey, collapseArchetypes, setAlgebra, renderManifest } from './deep-pierce.mjs';

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${name}`); passed++; }
  else { console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ---- templateKey: digit runs collapse to '#' (the repeating-row normalizer) ----
ok('templateKey collapses row index', templateKey('testid:grid-row-5-is-alternate') === 'testid:grid-row-#-is-alternate');
ok('templateKey leaves non-numeric keys intact', templateKey('testid:save-button') === 'testid:save-button');
ok('templateKey collapses multi-digit + multiple runs',
   templateKey('struct:checkbox|row 12 col 3|grid/r12') === 'struct:checkbox|row # col #|grid/r#');

// ---- collapseArchetypes (F3/G8): a 32-row × 4-column homogeneous grid → 4 per-column archetypes ----
function gridEntry(col, row, role, why) {
  return { key: `testid:pricing-grid-row-${row}-${col}`, role, name: '', why, inA: true, inB: role !== 'button-disabled', disabled: false };
}
const COLS = [['is-alternate', 'checkbox', 'role:checkbox'], ['use-eff-dates', 'checkbox', 'role:checkbox'],
              ['start-date', 'textbox', 'role:textbox'], ['end-date', 'textbox', 'role:textbox']];
const gridRaw = [];
for (let row = 0; row < 32; row++) for (const [col, role, why] of COLS) gridRaw.push(gridEntry(col, row, role, why));
// plus a few non-grid singletons that must NOT collapse
gridRaw.push({ key: 'testid:save-button', role: 'button', name: 'Save', why: 'native:button', inA: true, inB: true, disabled: false });
gridRaw.push({ key: 'testid:pay-to-address', role: 'div', name: 'Pay To Address', why: 'cdp:listener', inA: true, inB: false, disabled: false });
// the pilot's canonical A∖B + disabled case: a disabled Save (disabled ⇒ not focusable ⇒ A-only review)
gridRaw.push({ key: 'testid:save-disabled', role: 'button', name: 'Save (disabled)', why: 'native:button', inA: true, inB: false, disabled: true });

const collapsed = collapseArchetypes(gridRaw, 4);
const archetypes = collapsed.filter(e => e.archetype);
ok('128 grid cells collapse to 4 column archetypes', archetypes.length === 4, `got ${archetypes.length}`);
ok('archetype carries rowCount=32', archetypes.every(a => a.rowCount === 32), JSON.stringify(archetypes.map(a => a.rowCount)));
ok('non-grid singletons survive collapse',
   collapsed.some(e => e.key === 'testid:save-button') && collapsed.some(e => e.key === 'testid:pay-to-address'));
ok('collapsed denominator is data-volume-INDEPENDENT (4 archetypes + 3 singletons = 7, not 131)',
   collapsed.length === 7, `got ${collapsed.length}`);

// below-threshold homogeneous group is NOT collapsed (only 3 rows < threshold 4)
const small = [gridEntry('x', 0, 'checkbox', 'role:checkbox'), gridEntry('x', 1, 'checkbox', 'role:checkbox'), gridEntry('x', 2, 'checkbox', 'role:checkbox')];
ok('below-threshold group stays individual', collapseArchetypes(small, 4).length === 3);

// heterogeneous group (same template, different role/why) is NOT collapsed
const hetero = [
  { key: 'testid:r-0-c', role: 'checkbox', name: '', why: 'role:checkbox', inA: true, inB: true, disabled: false },
  { key: 'testid:r-1-c', role: 'button', name: '', why: 'native:button', inA: true, inB: true, disabled: false },
  { key: 'testid:r-2-c', role: 'checkbox', name: '', why: 'role:checkbox', inA: true, inB: true, disabled: false },
  { key: 'testid:r-3-c', role: 'button', name: '', why: 'native:button', inA: true, inB: true, disabled: false },
];
ok('heterogeneous same-template group stays individual', collapseArchetypes(hetero, 4).length === 4);

// ---- setAlgebra (M4): union / intersection / symmetric difference ----
const algEntries = [
  { key: 'a', role: 'button', name: '', why: 'native:button', inA: true, inB: true },    // intersection
  { key: 'b', role: 'button', name: '', why: 'native:button', inA: true, inB: false, disabled: true }, // A-only (disabled Save)
  { key: 'c', role: 'tablist', name: '', why: 'focusable', inA: false, inB: true },       // B-only (focusable tablist)
  { key: 'd', role: 'checkbox', name: '', why: 'role:checkbox', inA: true, inB: true },    // intersection
];
const alg = setAlgebra(algEntries);
ok('setAlgebra union = all entries', alg.unionCount === 4, `got ${alg.unionCount}`);
ok('setAlgebra intersection = 2', alg.intersectionCount === 2, `got ${alg.intersectionCount}`);
ok('setAlgebra A△B review-set = 2 (disabled Save A-only + focusable tablist B-only)', alg.symDiffCount === 2, `got ${alg.symDiffCount}`);
ok('A△B review marks A-only vs B-only direction',
   alg.symDiff.find(s => s.key === 'b').in === 'A-only' && alg.symDiff.find(s => s.key === 'c').in === 'B-only');
ok('empty A△B yields clean hint',
   setAlgebra([{ key: 'x', role: 'button', name: '', why: 'native:button', inA: true, inB: true }]).symDiff.length === 0);

// ---- renderManifest (M3): N rows, Coverage_Ratio 0/N, frontmatter keys, disposition column ----
const md = renderManifest({ walkState: 'office=1604 module=pricing', entries: collapsed, machineFoundDate: '2026-06-19', sourceJson: 'reports/walk-coverage/1604-pricing.json' });
ok('manifest has Coverage Manifest heading', md.includes('## Coverage Manifest (machine-enumerated)'));
ok('manifest Coverage_Ratio starts at 0/N', md.includes(`Coverage_Ratio: 0/${collapsed.length} (0%)`));
ok('manifest carries Walk_State + CrossCheck keys', md.includes('Walk_State: office=1604 module=pricing') && md.includes('CrossCheck:'));
ok('manifest renders one table row per entry',
   (md.match(/^\| `/gm) || []).length === collapsed.length, `rows=${(md.match(/^\| `/gm) || []).length} entries=${collapsed.length}`);
ok('manifest marks A△B review + disabled annotations', md.includes('_(A∖B review)_') && md.includes('_(disabled)_'));
ok('manifest leaves every disposition unfilled (no blanks, explicit _undispositioned_)',
   (md.match(/_undispositioned_/g) || []).length === collapsed.length);

console.log(`\nwalk-coverage enumerate fixtures: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
