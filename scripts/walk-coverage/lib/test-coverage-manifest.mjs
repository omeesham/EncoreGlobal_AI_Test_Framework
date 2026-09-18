#!/usr/bin/env node
// scripts/walk-coverage/lib/test-coverage-manifest.mjs
// PLAN_EXHAUSTIVE_WALK_GUARANTEE — Phase 4 fixtures for the shared coverage-completeness logic
// (coverage-manifest.mjs). In-memory string cases — no browser, no files. Exit 1 on any failure.
//
//   node scripts/walk-coverage/lib/test-coverage-manifest.mjs

import { coverageVerdict, parseCoverageSignals, isGrandfathered, loadCrossModuleRegistry, completionRefSegments } from './coverage-manifest.mjs';

const LANDING = '2026-06-19';
const PRE_MANDATE_TRACKED_ARTIFACT = 'package.json';
const POST_COVERAGE_PRE_MANDATE_TRACKED_ARTIFACT = 'scripts/walk-coverage/lib/test-coverage-manifest.mjs';
const TEST_COMPLETION_RECORD = 'reports/walk-coverage/test-fixture.json (status=complete, elements=1)';
let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  [PASS] ${name}`); passed++; }
  else { console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); failed++; }
};

const header = (date, ratio, cc, scope, options = {}) => {
  const { completionRecord = TEST_COMPLETION_RECORD } = options;
  return `MCP_Session_Date: ${date}\nCoverage_Ratio: ${ratio}\nWalk_State: office=1604\nCrossCheck: ${cc}\n` +
    (scope ? `coverageScope: ${scope}\n` : '') +
    (completionRecord ? `Completion_Record: ${completionRecord}\n` : '') +
    `\n## Coverage Manifest (machine-enumerated)\n| key | role | found | disposition |\n`;
};

// 1. complete (in-scope, 100%, clean, dispositioned)
const complete = header('2026-06-20', '47/47 (100%)', 'clean') + '| `testid:x` | button | 2026-06-20 | covered-by-TC: TC-1 |\n';
let v = coverageVerdict(complete, LANDING);
ok('complete artifact → applicable + complete', v.applicable && v.complete, JSON.stringify(v.reasons));

// 2. ratio < 100%
v = coverageVerdict(header('2026-06-20', '40/47 (85%)', 'clean'), LANDING);
ok('ratio < 100% → applicable + NOT complete', v.applicable && !v.complete && v.reasons.some(r => /Coverage_Ratio/.test(r)));

// 3. CrossCheck not clean
v = coverageVerdict(header('2026-06-20', '47/47 (100%)', '3 A△B elements to review'), LANDING);
ok('CrossCheck != clean → NOT complete', v.applicable && !v.complete && v.reasons.some(r => /CrossCheck/.test(r)));

// 4. coverageScope PARTIAL
v = coverageVerdict(header('2026-06-20', '47/47 (100%)', 'clean', 'PARTIAL'), LANDING);
ok('coverageScope PARTIAL → NOT complete', v.applicable && !v.complete && v.reasons.some(r => /PARTIAL/.test(r)));

// 5. undispositioned manifest rows
const undisp = header('2026-06-20', '47/47 (100%)', 'clean') + '| `testid:x` | button | 2026-06-20 | _undispositioned_ |\n| `testid:y` | link | 2026-06-20 | _undispositioned_ |\n';
v = coverageVerdict(undisp, LANDING);
ok('undispositioned rows → NOT complete', v.applicable && !v.complete && v.reasons.some(r => /undispositioned/.test(r)), JSON.stringify(v.reasons));

// 6. grandfathered (date precedes landing)
v = coverageVerdict(
  header('2026-06-10', '5/47 (10%)', 'dirty', 'PARTIAL', { completionRecord: '' }),
  LANDING,
  { artifactPath: PRE_MANDATE_TRACKED_ARTIFACT },
);
ok('grandfathered (date < landing) → NOT applicable (complete=true)', !v.applicable && v.complete && v.reasons[0].includes('grandfathered'));

// 7. no coverage manifest at all
v = coverageVerdict(
  'MCP_Session_Date: 2026-06-20\n\n## Field Inventory\n| Field | ... |\n',
  LANDING,
  { artifactPath: PRE_MANDATE_TRACKED_ARTIFACT },
);
ok('no manifest → NOT applicable', !v.applicable && v.complete && v.reasons[0].startsWith('no-coverage-manifest'));

// 8. explicit "100%" form (no N/M)
v = coverageVerdict(`MCP_Session_Date: 2026-06-20\nCoverage_Ratio: 100% complete\nCrossCheck: clean\nCompletion_Record: ${TEST_COMPLETION_RECORD}\n`, LANDING);
ok('explicit 100% form → complete', v.applicable && v.complete, JSON.stringify(v.reasons));

// 9. missing date but has manifest → in-scope (conservative), incomplete if ratio missing
v = coverageVerdict(`Completion_Record: ${TEST_COMPLETION_RECORD}\n## Coverage Manifest (machine-enumerated)\nCrossCheck: clean\n`, LANDING);
ok('missing date + manifest → applicable + incomplete (no ratio)', v.applicable && !v.complete);

// boundary: date == landing is NOT grandfathered (in-scope on the landing day)
ok('date == landing is in-scope (not grandfathered)', isGrandfathered('2026-06-19', LANDING) === false);
ok('date one day before landing IS grandfathered', isGrandfathered('2026-06-18', LANDING) === true);

// signal parser: bolded frontmatter form
const sig = parseCoverageSignals('**Coverage_Ratio**: 12/12 (100%)\n**CrossCheck**: clean\n## Coverage Manifest\n');
ok('parser handles bolded frontmatter', sig.ratioComplete && sig.crossCheckClean && sig.hasManifest);

const plainDateSig = parseCoverageSignals('MCP_Session_Date: 2026-06-20\nCoverage_Ratio: 1/1 (100%)\nCrossCheck: clean\n## Coverage Manifest\n');
ok('parser handles plain MCP_Session_Date frontmatter', plainDateSig.mcpDate === '2026-06-20', `got: ${plainDateSig.mcpDate}`);

// === Provenance sub-gate (SUBPLAN_CGS_B) — dates ON/AFTER 2026-06-24 are provenance-gated ===
// Build a 100%/clean header so provenance is the only variable. Default ratio matches row count.
const provHeader = (date, rows, ratio = '1/1 (100%)', options = {}) =>
  header(date, ratio, 'clean', undefined, options) + rows;
const ROW_ORACLE_OBS = '| `testid:btn-save` | button | 2026-06-25 | read-only-verified: wrapper; provenance: oracle |\n';
const ROW_MISSING_PROV = '| `testid:btn-save` | button | 2026-06-25 | affordance-probed: launcher "Picker" |\n';
const ROW_LIVE_OK = '| `testid:btn-save` | button | 2026-06-25 | affordance-probed: launcher; provenance: live; evidence: .playwright-cli/net-x.json |\n';
const ROW_LIVE_NO_EV = '| `testid:btn-save` | button | 2026-06-25 | read-only-verified: x; provenance: live |\n';
const ROW_TC_ORACLE = '| `testid:btn-save` | button | 2026-06-25 | covered-by-TC: TC-1; provenance: oracle |\n';
const ROW_OOS_ORACLE = '| `testid:nav` | a | 2026-06-25 | out-of-scope: outside-module shared app shell nav is not part of this surface; provenance: oracle |\n';
const ROW_TC_OK = '| `testid:btn-save` | button | 2026-06-25 | covered-by-TC: TC-1 |\n';
const P6_ROWS =
  '| `testid:btn-a` | button | 2026-06-25 | covered-by-TC: TC-1 |\n' +
  '| `testid:btn-b` | button | 2026-06-25 | covered-by-TC: TC-2 |\n' +
  '| `testid:btn-c` | button | 2026-06-25 | covered-by-TC: TC-3 |\n' +
  '| `testid:btn-d` | button | 2026-06-25 | covered-by-TC: TC-4 |\n' +
  '| `testid:btn-e` | button | 2026-06-25 | covered-by-TC: TC-5 |\n' +
  '| `testid:btn-f` | button | 2026-06-25 | covered-by-TC: TC-6 |\n' +
  ROW_OOS_ORACLE;

// P1. oracle on an observation-claiming row → fabrication
v = coverageVerdict(provHeader('2026-06-25', ROW_ORACLE_OBS), LANDING);
ok('P1 oracle on observation row → NOT complete + provenanceFail',
  v.applicable && !v.complete && v.provenanceFail && v.reasons.some(r => /provenance: oracle/.test(r)), JSON.stringify(v.reasons));

// P2. observation row with no provenance token → fabrication (un-fakeable proof required)
v = coverageVerdict(provHeader('2026-06-25', ROW_MISSING_PROV), LANDING);
ok('P2 missing provenance on observation row → NOT complete + provenanceFail',
  v.applicable && !v.complete && v.provenanceFail && v.reasons.some(r => /missing 'provenance: live'/.test(r)));

// P3. provenance: live + evidence pointer, text-only mode (no artifactPath) → trusts the pointer (deep check is Cx's job)
v = coverageVerdict(provHeader('2026-06-25', ROW_LIVE_OK), LANDING);
ok('P3 live+evidence pointer, text-only → complete', v.applicable && v.complete && !v.provenanceFail, JSON.stringify(v.reasons));

// P4. provenance: live but NO evidence pointer → fabrication (text-detectable)
v = coverageVerdict(provHeader('2026-06-25', ROW_LIVE_NO_EV), LANDING);
ok('P4 live but no evidence pointer → NOT complete + provenanceFail',
  v.applicable && !v.complete && v.provenanceFail && v.reasons.some(r => /cites no 'evidence:'/.test(r)));

// P5. covered-by-TC contradicting provenance: oracle → fabrication
v = coverageVerdict(provHeader('2026-06-25', ROW_TC_ORACLE), LANDING);
ok('P5 covered-by-TC + provenance oracle → NOT complete + provenanceFail',
  v.applicable && !v.complete && v.provenanceFail && v.reasons.some(r => /contradicts provenance: oracle/.test(r)));

// P6. out-of-scope is honest inference — oracle there is fine (F7: do not over-reject)
// Cross-module registry confirms `testid:nav` is shared shell (appears in another module).
const shellRegistry = new Map([['testid:nav', new Set(['other-module', 'yet-another'])]]);
v = coverageVerdict(provHeader('2026-06-25', P6_ROWS, '7/7 (100%)'), LANDING, { crossModuleControls: shellRegistry });
ok('P6 out-of-scope + oracle → complete (honest inference, not gated)', v.applicable && v.complete && !v.provenanceFail, JSON.stringify(v.reasons));

// P7. THE no-false-positive guard (F1): a pre-2026-06-24 artifact with an oracle observation row is
// provenance-grandfathered → stays complete (this is exactly why pricing-2026-06-19 does not newly fail).
v = coverageVerdict(
  provHeader('2026-06-23', ROW_ORACLE_OBS.replace('2026-06-25', '2026-06-23'), '1/1 (100%)', { completionRecord: '' }),
  LANDING,
  {
    artifactPath: POST_COVERAGE_PRE_MANDATE_TRACKED_ARTIFACT,
    provenanceLandingDate: '2026-06-27',
  },
);
ok('P7 pre-provenance-landing artifact w/ oracle row → complete (date-gated, no false-positive)',
  v.applicable && v.complete && !v.provenanceFail, JSON.stringify(v.reasons));

// P8. covered-by-TC (no provenance) on a gated artifact → complete (TC-ID is inherent evidence)
v = coverageVerdict(provHeader('2026-06-25', ROW_TC_OK), LANDING);
ok('P8 covered-by-TC (no provenance) on gated artifact → complete', v.applicable && v.complete && !v.provenanceFail, JSON.stringify(v.reasons));

// P9. parser surfaces manifest rows with provenance/evidence tokens
const prows = parseCoverageSignals(provHeader('2026-06-25', ROW_LIVE_OK)).manifestRows;
ok('P9 parser extracts manifest row provenance+evidence',
  prows.length === 1 && prows[0].disposition === 'affordance-probed' && prows[0].provenance === 'live' && prows[0].evidence === '.playwright-cli/net-x.json');

// === Cross-module evidence gate (NM-3344 defence) ===
// F1. Forged row: a real module control with outside-module prefix but NOT in any other module → REJECTED
const FORGED_ROW = '| `testid:terms-conditions-save` | button | 2026-07-01 | `out-of-scope: outside-module — global navigation shell save button not part of Terms and Conditions module` |\n';
const COVERED_ROW = '| `testid:btn-ok` | button | 2026-07-01 | covered-by-TC: TC-1 |\n';
const forgedArtifact = header('2026-07-01', '2/2 (100%)', 'clean') + COVERED_ROW + FORGED_ROW;
// Empty registry = no cross-module evidence for anything
const emptyRegistry = new Map();
v = coverageVerdict(forgedArtifact, LANDING, { crossModuleControls: emptyRegistry, artifactPath: 'specs_planning/_internal/field-inventories/terms-conditions-core-2026-06-20.md' });
ok('F1 forged outside-module row (no cross-module evidence) → NOT complete',
  v.applicable && !v.complete && v.reasons.some(r => /NOT evidenced as shared shell/.test(r)), JSON.stringify(v.reasons));

// F2. Genuine shell row: control appears in another module's inventory → excluded from denominator
const GENUINE_SHELL_ROW = '| `struct:a|Home|div/div/div/div/ul/li` | a | 2026-07-01 | `out-of-scope: outside-module — global navigation link, not a module element` |\n';
const genuineArtifact = header('2026-07-01', '2/2 (100%)', 'clean', undefined, { completionRecord: '' }) + COVERED_ROW + GENUINE_SHELL_ROW;
const registryWithHome = new Map([['struct:a|Home|div/div/div/div/ul/li', new Set(['service-charge-history', 'service-charge-basic-information'])]]);
v = coverageVerdict(genuineArtifact, LANDING, { crossModuleControls: registryWithHome, artifactPath: POST_COVERAGE_PRE_MANDATE_TRACKED_ARTIFACT });
ok('F2 genuine shell row (cross-module evidence) → complete (excluded from denominator)',
  v.applicable && v.complete, JSON.stringify(v.reasons));

// F3. Zero-module-denominator: all rows excluded AND evidenced → pass (genuine all-shell artifact)
const allShellArtifact = header('2026-07-01', '1/1 (100%)', 'clean', undefined, { completionRecord: '' }) + GENUINE_SHELL_ROW;
v = coverageVerdict(allShellArtifact, LANDING, { crossModuleControls: registryWithHome, artifactPath: POST_COVERAGE_PRE_MANDATE_TRACKED_ARTIFACT });
ok('F3 all rows are evidenced shell → complete (zero module-own denominator allowed when evidenced)',
  v.applicable && v.complete, JSON.stringify(v.reasons));

// F4. Zero-module-denominator WITHOUT evidence: all rows claim outside-module but none evidenced → FAIL
const allForgedArtifact = header('2026-07-01', '1/1 (100%)', 'clean') + FORGED_ROW;
v = coverageVerdict(allForgedArtifact, LANDING, { crossModuleControls: emptyRegistry, artifactPath: 'specs_planning/_internal/field-inventories/terms-conditions-core-2026-06-20.md' });
ok('F4 all rows claim outside-module but no evidence → NOT complete',
  v.applicable && !v.complete && v.reasons.some(r => /NOT evidenced/.test(r)), JSON.stringify(v.reasons));

// === Escaped-bar key parsing (NM-3344 manifest reader defect) ===
// E1. A key with escaped bars (\|) parses to the unescaped form
const ESCAPED_BAR_ROW = '| `struct:a\\|Home\\|div/div/div/div/ul/li` | a | 2026-07-01 | `out-of-scope: outside-module — global navigation link, not a module element` |\n';
const escapedRows = parseCoverageSignals(header('2026-07-01', '1/1 (100%)', 'clean', undefined, { completionRecord: '' }) + ESCAPED_BAR_ROW).manifestRows;
ok('E1 escaped-bar key parses to unescaped form',
  escapedRows.length === 1 && escapedRows[0].controlRef === 'struct:a|Home|div/div/div/div/ul/li',
  `got: ${escapedRows[0]?.controlRef}`);

// E1b. A backtick-wrapped key with raw bars also stays intact; older generated manifests used this form.
const BACKTICK_RAW_BAR_ROW = '| `struct:button|Order Search|div/div` | button | 2026-07-01 | read-only-verified |\n';
const rawBarRows = parseCoverageSignals(header('2026-07-01', '1/1 (100%)', 'clean', undefined, { completionRecord: '' }) + BACKTICK_RAW_BAR_ROW).manifestRows;
ok('E1b backtick-wrapped raw-bar key parses intact',
  rawBarRows.length === 1 && rawBarRows[0].controlRef === 'struct:button|Order Search|div/div',
  `got: ${rawBarRows[0]?.controlRef}`);

// E2. An invented key (not in any enumeration) is still rejected by the cross-module gate
const INVENTED_ROW = '| `testid:totally-invented-xyz` | button | 2026-07-01 | `out-of-scope: outside-module — invented element` |\n';
const inventedArtifact = header('2026-07-01', '2/2 (100%)', 'clean') + COVERED_ROW + INVENTED_ROW;
v = coverageVerdict(inventedArtifact, LANDING, { crossModuleControls: emptyRegistry, artifactPath: 'specs_planning/_internal/field-inventories/test-module-2026-07-01.md' });
ok('E2 invented key still rejected (inflation check works)',
  v.applicable && !v.complete && v.reasons.some(r => /NOT evidenced as shared shell/.test(r)), JSON.stringify(v.reasons));

// E3. A case-mismatched key (STRUCT:A|HOME|DIV/DIV vs struct:a|Home|div/div) must NOT parse as equal
const CASE_MISMATCH_ROW = '| `STRUCT:A\\|HOME\\|DIV/DIV` | a | 2026-07-01 | covered-by-TC: TC-99 |\n';
const caseMismatchRows = parseCoverageSignals(header('2026-07-01', '1/1 (100%)', 'clean', undefined, { completionRecord: '' }) + CASE_MISMATCH_ROW).manifestRows;
ok('E3 case-mismatched escaped key parses with original case preserved',
  caseMismatchRows.length === 1 && caseMismatchRows[0].controlRef === 'STRUCT:A|HOME|DIV/DIV',
  `got: ${caseMismatchRows[0]?.controlRef}`);

// E4. Doubled backslash (\\|) outside a code span is literal backslash + delimiter
const DOUBLED_BS_ROW = '| struct:a\\\\|home | a | 2026-07-01 | covered-by-TC: TC-100 |\n';
const doubledBsRows = parseCoverageSignals(header('2026-07-01', '1/1 (100%)', 'clean', undefined, { completionRecord: '' }) + DOUBLED_BS_ROW).manifestRows;
ok('E4 doubled backslash is literal backslash + cell delimiter (key truncates at delimiter)',
  doubledBsRows.length === 1 && doubledBsRows[0].controlRef === 'struct:a\\\\',
  `got: ${doubledBsRows[0]?.controlRef}`);

// E5. Unicode look-alike bar (U+2502 BOX DRAWINGS LIGHT VERTICAL) is NOT a delimiter — stays in key
const UNICODE_BAR_ROW = '| `struct:a\u2502Home\u2502div` | a | 2026-07-01 | covered-by-TC: TC-101 |\n';
const unicodeBarRows = parseCoverageSignals(header('2026-07-01', '1/1 (100%)', 'clean', undefined, { completionRecord: '' }) + UNICODE_BAR_ROW).manifestRows;
ok('E5 unicode look-alike bar stays in key (not a delimiter)',
  unicodeBarRows.length === 1 && unicodeBarRows[0].controlRef === 'struct:a\u2502Home\u2502div',
  `got: ${unicodeBarRows[0]?.controlRef}`);

// E6. completionRefSegments — multi-surface Completion_Record values split into per-JSON paths
const segSingle = completionRefSegments('reports/walk-coverage/a.json (status=complete, elements=1)');
ok('E6a single-segment value yields its one path, annotation stripped',
  segSingle.length === 1 && segSingle[0] === 'reports/walk-coverage/a.json', JSON.stringify(segSingle));
const segMulti = completionRefSegments('reports/wc/a.json (elements=17) · reports/wc/b.json (elements=20) · reports/wc/c.json (elements=20, union=35)');
ok('E6b three-segment value yields three paths with annotations stripped',
  segMulti.length === 3 && segMulti[0] === 'reports/wc/a.json' && segMulti[1] === 'reports/wc/b.json' && segMulti[2] === 'reports/wc/c.json',
  JSON.stringify(segMulti));
ok('E6c empty/absent value yields no segments', completionRefSegments('').length === 0 && completionRefSegments(undefined).length === 0, 'non-empty');

// G. SUBPLAN_GUARDRAIL_CX_GATE_DEFECTS (2026-08-28) — observation-only baseline carve-out (Defect 2)
// and the owner-signed 15%-cap exemption (Defect 3). Each positive case has its refusing twin so the
// carve-outs cannot be widened silently.
const OLD_SITE_PATH = 'specs_planning/_internal/old-site-baseline/fixture-2026-08-25.md';
const NEW_SITE_PATH = 'specs_planning/_internal/field-inventories/fixture-2026-08-25.md';
const OBS_KEYS = 'Observation_Only: true\nWalk_Authorization: owner-authorized bounded observation walk, one non-mutating tab click per tab\n';
const NO_MANIFEST_BODY = (extra = '') => `MCP_Session_Date: 2026-08-25\n${extra}\n## Notes\nno manifest here\n`;

// G1. old-site + both keys → carve-out passes (applicable:false, complete:true, reason names it)
v = coverageVerdict(NO_MANIFEST_BODY(OBS_KEYS), LANDING, { artifactPath: OLD_SITE_PATH });
ok('G1 observation-only old-site baseline with authorization → not-applicable pass',
  !v.applicable && v.complete && v.reasons.some(r => /observation-only old-site baseline/.test(r)), JSON.stringify(v.reasons));

// G2. old-site WITHOUT the keys → manifest mandate still bites
v = coverageVerdict(NO_MANIFEST_BODY(), LANDING, { artifactPath: OLD_SITE_PATH });
ok('G2 old-site baseline without the keys → Coverage Manifest ABSENT still fails',
  v.applicable && !v.complete && v.reasons.some(r => /Coverage Manifest ABSENT/.test(r)), JSON.stringify(v.reasons));

// G3. NEW-site artifact carrying the keys → keys cannot launder it; mandate still bites
v = coverageVerdict(NO_MANIFEST_BODY(OBS_KEYS), LANDING, { artifactPath: NEW_SITE_PATH });
ok('G3 new-site artifact with the keys → Coverage Manifest ABSENT still fails',
  v.applicable && !v.complete && v.reasons.some(r => /Coverage Manifest ABSENT/.test(r)), JSON.stringify(v.reasons));

// G4. short authorization (<20 chars) → refused
v = coverageVerdict(NO_MANIFEST_BODY('Observation_Only: true\nWalk_Authorization: short\n'), LANDING, { artifactPath: OLD_SITE_PATH });
ok('G4 authorization under 20 chars → refused, mandate still fails',
  v.applicable && !v.complete && v.reasons.some(r => /Coverage Manifest ABSENT/.test(r)), JSON.stringify(v.reasons));

// G5/G6/G7 — 15% cap exemption. Fixture: 2 rows, 1 in-module OOS (50% > 15% cap), NM-cited reason.
const CAP_BODY = header('2026-08-25', '2/2 (100%)', 'clean') +
  '| `testid:keep` | button | 2026-08-25 | covered-by-TC: TC-1 |\n' +
  '| `testid:oos` | button | 2026-08-25 | out-of-scope: NM-3343 owns this sibling tab control under the split-ownership ruling |\n';
const CAP_ART = 'specs_planning/_internal/field-inventories/cap-fixture-2026-08-25.md';
const SIGNED = [{ artifact: 'cap-fixture-2026-08-25.md', plan: 'PLAN_X.md', reason: 'split ownership — sibling ticket owns the whole tab, no reclassification', approved_by: 'Owner (chat)', date: '2026-08-26' }];
const UNSIGNED = [{ artifact: 'cap-fixture-2026-08-25.md', plan: 'PLAN_X.md', reason: 'split ownership — sibling ticket owns the whole tab, no reclassification', date: '2026-08-26' }];

// G5. no exemption → cap fails
v = coverageVerdict(CAP_BODY, LANDING, { artifactPath: CAP_ART, oosCapExemptions: [] });
ok('G5 over-cap with no exemption → cap reason fails',
  v.reasons.some(r => /15% module-own cap/.test(r)), JSON.stringify(v.reasons));

// G6. owner-signed exemption → cap waived, echoed in warnings, no cap reason
v = coverageVerdict(CAP_BODY, LANDING, { artifactPath: CAP_ART, oosCapExemptions: SIGNED });
ok('G6 owner-signed exemption → cap waived with loud warning echo',
  !v.reasons.some(r => /15% module-own cap/.test(r)) && (v.warnings || []).some(w => /cap WAIVED by owner-signed exemption/.test(w) && /approved_by=Owner/.test(w)),
  JSON.stringify({ reasons: v.reasons, warnings: v.warnings }));

// G7. unsigned entry (no approved_by) → refused, cap still fails
v = coverageVerdict(CAP_BODY, LANDING, { artifactPath: CAP_ART, oosCapExemptions: UNSIGNED });
ok('G7 unsigned exemption entry → refused, cap still fails',
  v.reasons.some(r => /15% module-own cap/.test(r)) && !(v.warnings || []).some(w => /WAIVED/.test(w)), JSON.stringify(v.reasons));

console.log(`\ncoverage-manifest fixtures: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
