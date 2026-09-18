#!/usr/bin/env node
// scripts/walk-coverage/tests/enumerate-page-fixes.test.mjs
// Unit tests for the four bug-fix causes in enumerate-page.mjs / lib/deep-pierce.mjs.
// No browser required — mocks are used for page-dependent paths.
// Each test is structured so it FAILS against the pre-fix code.

import { deriveFieldType, waitReady, waitReadyContent, enumerateState, renavigateToOrigin, deriveAllFieldTypes, entryKeyToSelector, resolveBranchOpener, MODULE_CONFIG, resolveRunConfig, expandToFixpoint, mergeEntries } from '../enumerate-page.mjs';
import { inPageEnumerate } from '../lib/deep-pierce.mjs';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) { console.log(`  PASS: ${label}`); passed++; }
  else { console.error(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ─── shared legal types (mimics what loadFieldCaseTaxonomy returns) ─────────────
const LEGAL_TYPES = [
  'Numeric/spinbutton', 'Plain text', 'Checkbox', 'Dropdown/combobox',
  'Date', 'Password', 'File upload',
];

console.log('=== enumerate-page-fixes tests ===\n');

// ─── Cause 3a: type-less numeric input resolves as Numeric/spinbutton ────────────
console.log('Cause 3a: type-less decimal INPUT (the 79 percentage inputs) → Numeric/spinbutton');
{
  const obs = { tag: 'INPUT', type: '', role: '', inputmode: 'decimal' };
  const result = deriveFieldType(obs, LEGAL_TYPES);
  assert('resolves to Numeric/spinbutton', result === 'Numeric/spinbutton',
    `got: ${JSON.stringify(result)}`);
}

// ─── Cause 3b: control matching NO rule stays unresolved (not "Plain text") ─────
console.log('\nCause 3b: control with no matching rule stays unresolved');
{
  // A bare INPUT with no type, no role, no inputmode=decimal — no rule should match.
  const obs = { tag: 'INPUT', type: '', role: '', inputmode: '' };
  const result = deriveFieldType(obs, LEGAL_TYPES);
  assert('returns null (unresolved) for unrecognized INPUT', result === null,
    `got: ${JSON.stringify(result)} — pre-fix code returned "Plain text" for bare INPUT`);
  assert('does NOT classify as "Plain text"', result !== 'Plain text',
    `got: ${JSON.stringify(result)}`);
}

// ─── Cause 3c: existing known-good rules still work after catch-all removal ──────
console.log('\nCause 3c: existing rules still resolve correctly after catch-all removal');
{
  assert('TEXTAREA → Plain text',
    deriveFieldType({ tag: 'TEXTAREA', type: '', role: '', inputmode: '' }, LEGAL_TYPES) === 'Plain text');
  assert('INPUT type=number → Numeric/spinbutton',
    deriveFieldType({ tag: 'INPUT', type: 'number', role: '', inputmode: '' }, LEGAL_TYPES) === 'Numeric/spinbutton');
  assert('role=spinbutton → Numeric/spinbutton',
    deriveFieldType({ tag: 'DIV', type: '', role: 'spinbutton', inputmode: '' }, LEGAL_TYPES) === 'Numeric/spinbutton');
  assert('role=combobox → Dropdown/combobox',
    deriveFieldType({ tag: 'DIV', type: '', role: 'combobox', inputmode: '' }, LEGAL_TYPES) === 'Dropdown/combobox');
  assert('SELECT → Dropdown/combobox',
    deriveFieldType({ tag: 'SELECT', type: '', role: '', inputmode: '' }, LEGAL_TYPES) === 'Dropdown/combobox');
  assert('INPUT type=password → Password',
    deriveFieldType({ tag: 'INPUT', type: 'password', role: '', inputmode: '' }, LEGAL_TYPES) === 'Password');
  assert('INPUT type=checkbox → Checkbox',
    deriveFieldType({ tag: 'INPUT', type: 'checkbox', role: '', inputmode: '' }, LEGAL_TYPES) === 'Checkbox');
}

// ─── Cause 2: waitReady throws on timeout instead of returning a partial ─────────
console.log('\nCause 2: waitReady throws on timeout');
{
  let timeoutThrown = false;
  let thrownMessage = '';

  // Mock page: dead page — nothing renders (census 0 can never satisfy the PLAN_76 stability
  // contract, preserving this test's original intent: timeout must THROW, never return a partial).
  const mockPage = {
    evaluate: async () => 0,
    waitForTimeout: async () => {},
  };

  try {
    await waitReady(mockPage, { minTestids: 8, stableReads: 2, interval: 50, timeout: 150 });
    timeoutThrown = false;
  } catch (err) {
    timeoutThrown = true;
    thrownMessage = err.message;
  }

  assert('throws on timeout instead of returning partial',
    timeoutThrown, 'pre-fix code returned last silently; post-fix must throw');
  assert('error message contains WAIT_READY_TIMEOUT',
    thrownMessage.includes('WAIT_READY_TIMEOUT'), `got: ${thrownMessage}`);
  assert('error message contains "Refusing"',
    thrownMessage.includes('Refusing'), `got: ${thrownMessage}`);
}

// ─── Cause 1: renavigateToOrigin calls goto with the original URL ──────────────
console.log('\nCause 1: renavigateToOrigin navigates back to the originating URL');
{
  const gotoCalls = [];
  const mockPage = {
    goto: async (u, opts) => { gotoCalls.push({ u, opts }); return null; },
    evaluate: async () => 10,       // satisfies waitReady minTestids=8 immediately
    waitForTimeout: async () => {},
  };
  await renavigateToOrigin(mockPage, 'http://test.local/target');
  assert('goto called exactly once', gotoCalls.length === 1,
    `got ${gotoCalls.length} calls`);
  assert('goto called with original URL', gotoCalls[0]?.u === 'http://test.local/target',
    `got: ${gotoCalls[0]?.u}`);
  assert('goto uses domcontentloaded', gotoCalls[0]?.opts?.waitUntil === 'domcontentloaded',
    `got: ${JSON.stringify(gotoCalls[0]?.opts)}`);
}

// ─── Cause 4a: enumerateState propagates CONTAINER_NOT_FOUND; tolerates other errors ──
console.log('\nCause 4a: enumerateState propagates CONTAINER_NOT_FOUND, tolerates other frame errors');
{
  // Frame that throws CONTAINER_NOT_FOUND — must propagate (post-fix) not be swallowed (pre-fix).
  const cnfMsg = 'CONTAINER_NOT_FOUND: no <main> element found on http://test.local/page. Refusing to enumerate — no fallback to document.';
  const mockPageCNF = {
    frames: () => [{ evaluate: async () => { throw new Error(cnfMsg); } }],
    mainFrame: function() { return this.frames()[0]; },
  };
  let cnfThrown = false;
  let cnfMsg2 = '';
  try { await enumerateState(mockPageCNF); } catch (err) { cnfThrown = true; cnfMsg2 = err.message; }
  assert('CONTAINER_NOT_FOUND propagates through enumerateState',
    cnfThrown, 'pre-fix: error was swallowed by catch-continue; post-fix must rethrow');
  assert('propagated error contains CONTAINER_NOT_FOUND',
    cnfMsg2.includes('CONTAINER_NOT_FOUND'), `got: ${cnfMsg2}`);

  // Frame that throws a different error (e.g. frame detached) — must be tolerated, not rethrown.
  const mockPageOther = {
    frames: () => [{ evaluate: async () => { throw new Error('Frame was detached'); } }],
    mainFrame: function() { return this.frames()[0]; },
  };
  let otherThrown = false;
  try { await enumerateState(mockPageOther); } catch { otherThrown = true; }
  assert('non-CONTAINER_NOT_FOUND frame errors are still tolerated',
    !otherThrown, 'other frame errors must NOT propagate — only CONTAINER_NOT_FOUND escapes');
}

// ─── Cause 4b: inPageEnumerate raises CONTAINER_NOT_FOUND when DOM has no <main> ──
console.log('\nCause 4b: missing <main> raises CONTAINER_NOT_FOUND');
{
  // We can invoke inPageEnumerate in Node if we mock the DOM APIs it uses.
  // The function only needs document.querySelector, so we inject a minimal global.
  const { inPageEnumerate } = await import('../lib/deep-pierce.mjs');

  // Stub minimal DOM globals so inPageEnumerate can run in Node
  const origDocument = global.document;
  const origLocation = global.location;
  global.document = {
    querySelector: () => null, // no <main> found
  };
  global.location = { href: 'http://test.local/page' };

  let containerErrorThrown = false;
  let containerErrorMsg = '';
  try {
    inPageEnumerate('main');
  } catch (err) {
    containerErrorThrown = true;
    containerErrorMsg = err.message;
  } finally {
    if (origDocument !== undefined) global.document = origDocument;
    else delete global.document;
    if (origLocation !== undefined) global.location = origLocation;
    else delete global.location;
  }

  assert('throws when <main> is missing',
    containerErrorThrown, 'pre-fix: would have called deepAll(null) or deepAll(document) silently');
  assert('error message contains CONTAINER_NOT_FOUND',
    containerErrorMsg.includes('CONTAINER_NOT_FOUND'), `got: ${containerErrorMsg}`);
  assert('error message says "Refusing to enumerate"',
    containerErrorMsg.includes('Refusing to enumerate'), `got: ${containerErrorMsg}`);
}

// ─── Cause 1 (ordering property): tab-role entries are NOT click-probed ─────────────────────
// Property: no element may fail to resolve because an earlier probe in the same pass changed
// what is mounted. Tab triggers (role=tab) unmount the current panel when clicked.
// Fix: 'tab' removed from PROBEABLE_ROLES → tab entries exit as non_probeable, not probed.
// Proof: if 'tab' is in PROBEABLE_ROLES, page.click IS called, this test FAILS.
console.log('\nCause 1 (ordering property): tab-role entry is NOT click-probed');
{
  const clickTargets = [];
  let evalCallCount = 0;
  const mockPage = {
    goto: async () => {},
    evaluate: async () => 10,       // waitReady: satisfied immediately
    waitForTimeout: async () => {},
    $eval: async (sel, fn) => {
      evalCallCount++;
      // Return a tab trigger observation — not resting-conclusive, would trigger probe path
      return fn({
        tagName: 'DIV',
        getAttribute: (attr) => {
          if (attr === 'type') return null;
          if (attr === 'role') return 'tab';
          if (attr === 'inputmode') return null;
          return null;
        },
      });
    },
    click: async (sel) => { clickTargets.push(sel); },
    keyboard: { press: async () => {} },
  };
  const entries = [{ key: 'testid:radix-history-trigger', archetype: false }];
  const rawEntries = [{ key: 'testid:radix-history-trigger' }];
  await deriveAllFieldTypes(mockPage, 'http://test.local/target', entries, rawEntries, ['Plain text']);

  assert('tab-role entry does NOT trigger page.click', clickTargets.length === 0,
    `got ${clickTargets.length} click(s): ${JSON.stringify(clickTargets)} — pre-fix code with "tab" in PROBEABLE_ROLES would click`);
  assert('tab-role entry $eval was still called (element was read)', evalCallCount > 0,
    `$eval called ${evalCallCount} times — should have attempted to read the element`);
}

// ─── Cause 1 (production path): renavigate precedes first $eval in deriveAllFieldTypes ──────
console.log('\nCause 1 (production path): renavigateToOrigin called before Phase 2.2 $eval');
{
  const callSequence = [];
  const mockPage = {
    goto: async () => { callSequence.push('goto'); },
    evaluate: async () => 10,        // waitReady: minTestids satisfied immediately
    waitForTimeout: async () => {},
    $eval: async () => {
      callSequence.push('$eval');
      return { tag: 'INPUT', type: 'text', role: '', inputmode: '' };
    },
  };
  const entries = [{ key: 'testid:field-a', archetype: false }];
  const rawEntries = [{ key: 'testid:field-a' }];
  await deriveAllFieldTypes(mockPage, 'http://test.local/target', entries, rawEntries, ['Plain text']);

  const gotoIdx = callSequence.indexOf('goto');
  const evalIdx = callSequence.indexOf('$eval');
  assert('renavigate (goto) was called before first $eval', gotoIdx !== -1 && gotoIdx < evalIdx,
    `sequence=${JSON.stringify(callSequence)} — deleting the renavigateToOrigin callsite would produce gotoIdx=-1`);
}

// ─── Encoding fix: archetype suffix stripped → selector does NOT contain # or [archetype ──────
console.log('\nEncoding fix: entryKeyToSelector strips archetype suffix from testid key');
{
  // A key as produced by collapseArchetypes() — contains × (U+00D7)
  const archetypeKey = 'testid:service-charge-percentage-# [archetype\u00D779]';
  const selector = entryKeyToSelector(archetypeKey);
  assert('selector does not contain " [archetype"', !selector.includes(' [archetype'),
    `got: ${selector} — corrupted regex leaves archetype suffix in the selector`);
  assert('selector does not contain "[archetype"', !selector.includes('[archetype'),
    `got: ${selector} — corrupted regex leaves archetype suffix in the selector`);
  assert('selector is [data-testid="service-charge-percentage-#"]',
    selector === '[data-testid="service-charge-percentage-#"]',
    `got: ${selector}`);
}

// ─── Branch resolution: recognised branch returns pattern ────────────────────────────────────
// Pre-fix: resolveBranchOpener did not exist → import would fail or return undefined.
// Post-fix: returns the matching pattern object with the correct properties.
// NOTE: this tests the generic pattern pass-through mechanic of resolveBranchOpener,
// not the live History config — the mock uses contentGate: true to mirror the real config.
console.log('\nBranch resolution: recognised branch returns correct pattern');
{
  const mockCfg = {
    openerRoleTextPatterns: [
      { role: 'tab', text: 'Service Charge History', branch: 'tab:history', contentGate: true },
    ],
  };
  const result = resolveBranchOpener(mockCfg, 'tab:history');
  assert('resolveBranchOpener returns the matching pattern',
    result !== null && result !== undefined,
    `got: ${JSON.stringify(result)}`);
  assert('returned pattern has correct branch property',
    result && result.branch === 'tab:history',
    `got branch=${result && result.branch}`);
  assert('returned pattern carries contentGate flag',
    result && result.contentGate === true,
    `got contentGate=${result && result.contentGate}`);
  assert('returned pattern has role and text',
    result && result.role === 'tab' && result.text === 'Service Charge History',
    `got role=${result && result.role} text=${result && result.text}`);
}

// ─── Branch resolution: unrecognised branch throws loudly ────────────────────────────────────
// Pre-fix: no throw — an unknown branch was silently ignored, causing wrong-surface enumeration.
// Post-fix: throws with [FATAL] prefix so CI catches the mistake immediately.
console.log('\nBranch resolution: unrecognised branch throws with [FATAL]');
{
  const mockCfg = {
    openerRoleTextPatterns: [
      { role: 'tab', text: 'Service Charge History', branch: 'tab:history', contentGate: true },
    ],
  };
  let didThrow = false;
  let thrownMsg = '';
  try {
    resolveBranchOpener(mockCfg, 'tab:not-real');
  } catch (err) {
    didThrow = true;
    thrownMsg = err.message;
  }
  assert('throws for unrecognised branch',
    didThrow, 'pre-fix: unknown branch was silently accepted; post-fix must throw');
  assert('error message contains [FATAL]',
    thrownMsg.includes('[FATAL]'), `got: ${thrownMsg}`);
  assert('error message names the bad branch value',
    thrownMsg.includes('tab:not-real'), `got: ${thrownMsg}`);
  assert('error message lists known branches',
    thrownMsg.includes('tab:history'), `got: ${thrownMsg}`);
}

// ─── History content gate: throws when Modified By header never appears ──────────────────────
// This test goes RED if waitReadyContent is removed or made vacuous.
// Proof: remove waitReadyContent from enumerate-page.mjs → import fails → suite fails.
// Remove the throw inside waitReadyContent → 'throws when header absent' assert fails.
console.log('\nHistory content gate: throws when Modified By header never appears');
{
  let threw = false;
  let thrownMsg = '';
  const mockPageNoHeader = {
    waitForSelector: async (_sel, _opts) => { throw new Error('Timeout'); },
  };
  try {
    await waitReadyContent(mockPageNoHeader, { timeout: 100 });
  } catch (err) {
    threw = true;
    thrownMsg = err.message;
  }
  assert('throws when Modified By header absent',
    threw, 'removing waitReadyContent or making it vacuous causes this to fail');
  assert('error contains WAIT_READY_CONTENT_TIMEOUT',
    thrownMsg.includes('WAIT_READY_CONTENT_TIMEOUT'), `got: ${thrownMsg}`);
  assert('error mentions Modified By',
    thrownMsg.includes('Modified By'), `got: ${thrownMsg}`);
}

// ─── History content gate: throws when header present but no rows ─────────────────────────────
console.log('\nHistory content gate: throws when rows never appear after header');
{
  let threw = false;
  let thrownMsg = '';
  let headerWaited = false;
  const mockPageNoRows = {
    waitForSelector: async (sel, _opts) => {
      if (sel === 'text=Modified By') { headerWaited = true; return; } // header resolves
      throw new Error('Timeout'); // rows never appear
    },
  };
  try {
    await waitReadyContent(mockPageNoRows, { timeout: 100 });
  } catch (err) {
    threw = true;
    thrownMsg = err.message;
  }
  assert('waited for Modified By header first', headerWaited);
  assert('throws when rows never appear',
    threw, 'removing the rows gate causes this to fail');
  assert('error contains WAIT_READY_CONTENT_TIMEOUT',
    thrownMsg.includes('WAIT_READY_CONTENT_TIMEOUT'), `got: ${thrownMsg}`);
  assert('error mentions denominator trust',
    thrownMsg.includes('denominator'), `got: ${thrownMsg}`);
}

// ─── History content gate: resolves when header and rows present ──────────────────────────────
console.log('\nHistory content gate: resolves when header and rows both present');
{
  let resolved = false;
  let threw = false;
  const mockPageFull = {
    waitForSelector: async (_sel, _opts) => { /* both selectors resolve immediately */ },
  };
  try {
    await waitReadyContent(mockPageFull, { timeout: 5000 });
    resolved = true;
  } catch {
    threw = true;
  }
  assert('resolves without throwing when content is present', resolved && !threw);
}

// ─── Live MODULE_CONFIG: History branch carries contentGate ──────────────────────────────────
// This test goes RED when contentGate: true is removed from the live MODULE_CONFIG tab:history
// entry. It does NOT import a mock — it reads the real exported config. Removing contentGate
// causes `historyPattern.contentGate` to be undefined, failing the assertion below with a
// named message (not a parse/import error).
console.log('\nLive MODULE_CONFIG: History branch carries contentGate and routes to content gate');
{
  // Locate the tab:history entry in the live service-charge openerRoleTextPatterns.
  const scConfig = MODULE_CONFIG['service-charge'];
  assert('MODULE_CONFIG has service-charge entry',
    scConfig != null,
    'MODULE_CONFIG[\'service-charge\'] is missing');
  const historyPattern = (scConfig && scConfig.openerRoleTextPatterns || []).find(
    (p) => p.branch === 'tab:history'
  );
  assert('tab:history pattern exists in live MODULE_CONFIG',
    historyPattern != null,
    'no openerRoleTextPatterns entry with branch=\'tab:history\' found — was it removed?');
  assert('tab:history carries contentGate: true in live MODULE_CONFIG',
    historyPattern && historyPattern.contentGate === true,
    `got contentGate=${historyPattern && historyPattern.contentGate} — removing contentGate: true from MODULE_CONFIG causes this to fail`);
  assert('tab:history does not carry minTestids (retired property)',
    historyPattern && historyPattern.minTestids === undefined,
    `got minTestids=${historyPattern && historyPattern.minTestids} — minTestids was retired when contentGate replaced it`);
}

// ─── PLAN_76: stability-contract readiness (label-poor surfaces must pass) ──────
// The old gate demanded >= 8 data-testids — an invented floor that permanently blocked
// label-poor pages (live: discount-optimization-settings settles at 1 testid / 0 on tab 2
// while holding 135 buttons + 37 inputs). New contract: interactive census >= 1 and stable,
// DOM node count stable within a small tolerance, minimum elapsed time; testid >= 8 kept
// only as a fast-path accelerator. Mock evaluate returns {t, c, n} snapshots
// (t = testid count, c = interactive census, n = total DOM elements); a bare number is
// treated as the legacy testid-only shape.

function seqPage(snapshots) {
  // Yields snapshots in order; repeats the last one forever. Tracks call count.
  const state = { calls: 0 };
  return {
    state,
    evaluate: async () => {
      const i = Math.min(state.calls, snapshots.length - 1);
      state.calls++;
      return snapshots[i];
    },
    waitForTimeout: async () => {},
  };
}

console.log('\nPLAN_76 A: label-poor page (1 testid, rich census) becomes ready');
{
  const page = seqPage([{ t: 1, c: 120, n: 900 }]);
  let ready = false, result = null, msg = '';
  try { result = await waitReady(page, { interval: 10, timeout: 2000 }); ready = true; }
  catch (err) { msg = err.message; }
  assert('1-testid surface passes readiness', ready,
    `old floor-8 gate times out here — got: ${msg}`);
  assert('returns the testid count', ready && result === 1, `got: ${JSON.stringify(result)}`);
}

console.log('\nPLAN_76 B: zero-testid page (buttons only) becomes ready');
{
  const page = seqPage([{ t: 0, c: 24, n: 400 }]);
  let ready = false, msg = '';
  try { await waitReady(page, { interval: 10, timeout: 2000 }); ready = true; }
  catch (err) { msg = err.message; }
  assert('0-testid surface passes readiness', ready,
    `count-based floors can never pass 0 testids — got: ${msg}`);
}

console.log('\nPLAN_76 C: late-render page is NOT ready until the census settles');
{
  // Chrome shell first (census 10), module content lands later (census 50) and then holds.
  const page = seqPage([
    { t: 1, c: 10, n: 300 }, { t: 1, c: 10, n: 300 }, { t: 1, c: 10, n: 310 },
    { t: 1, c: 50, n: 800 }, { t: 1, c: 50, n: 800 }, { t: 1, c: 50, n: 800 }, { t: 1, c: 50, n: 800 },
  ]);
  let ready = false, msg = '';
  try { await waitReady(page, { interval: 10, timeout: 2000 }); ready = true; }
  catch (err) { msg = err.message; }
  assert('late-render page eventually ready', ready, `got: ${msg}`);
  assert('readiness waited for the post-climb stable window (>= 6 samples)',
    page.state.calls >= 6,
    `declared ready after only ${page.state.calls} samples — premature-ready would under-enumerate (LR-062)`);
}

console.log('\nPLAN_76 D: DOM churn within tolerance still settles; beyond tolerance never does');
{
  // Spinner-class churn: node count oscillates by 1 — within tolerance, must settle.
  const small = seqPage([
    { t: 0, c: 24, n: 400 }, { t: 0, c: 24, n: 401 }, { t: 0, c: 24, n: 400 }, { t: 0, c: 24, n: 401 },
  ]);
  let readySmall = false, msgSmall = '';
  try { await waitReady(small, { interval: 10, timeout: 2000 }); readySmall = true; }
  catch (err) { msgSmall = err.message; }
  assert('±1 node churn settles (within tolerance)', readySmall, `got: ${msgSmall}`);

  // Structural churn: node count keeps jumping by 10 — content still arriving, must NOT settle.
  const seq = [];
  for (let i = 0; i < 400; i++) seq.push({ t: 0, c: 24, n: 400 + (i % 2) * 10 });
  const big = seqPage(seq);
  let threwBig = false, msgBig = '';
  try { await waitReady(big, { interval: 10, timeout: 300 }); }
  catch (err) { threwBig = true; msgBig = err.message; }
  assert('±10 node churn never settles → loud timeout', threwBig,
    'structural churn declared ready — premature-ready corrupts the denominator');
  assert('churn timeout message carries WAIT_READY_TIMEOUT', msgBig.includes('WAIT_READY_TIMEOUT'), `got: ${msgBig}`);
}

console.log('\nPLAN_76 E: label-rich fast-path still fires (>= 8 stable testids, census-independent)');
{
  const page = seqPage([{ t: 10, c: 0, n: 100 }]);
  let ready = false, result = null, msg = '';
  try { result = await waitReady(page, { interval: 10, timeout: 2000 }); ready = true; }
  catch (err) { msg = err.message; }
  assert('fast-path declares ready on stable testid-rich page', ready, `got: ${msg}`);
  assert('fast-path returns testid count', ready && result === 10, `got: ${JSON.stringify(result)}`);
  assert('fast-path needed few samples (accelerator, not the slow contract)',
    page.state.calls <= 4, `took ${page.state.calls} samples`);
}

console.log('\nPLAN_76 F: dead page (legacy numeric mock, nothing renders) throws the enriched timeout');
{
  const page = { evaluate: async () => 0, waitForTimeout: async () => {} };
  let threw = false, msg = '';
  try { await waitReady(page, { interval: 10, timeout: 200 }); }
  catch (err) { threw = true; msg = err.message; }
  assert('dead page still throws loudly', threw, 'silent partial forbidden');
  assert('timeout message reports census alongside testids',
    msg.includes('census'), `got: ${msg}`);
}

// ─── g76 Defect 1: readiness must scope to <main>, not document ──────────────────
// A stable app-shell (document-level census constant) with <main> content arriving late
// must NOT declare ready before late content lands. Pre-fix: waitReady walked document,
// so stable chrome satisfied the window while <main> was empty.
console.log('\ng76 Defect 1: stable app-shell does NOT satisfy readiness while <main> content arrives late');
{
  // Simulate: first 5 polls return stable chrome (as if document had stable buttons),
  // then content appears in <main> (census jumps), then stabilizes.
  // Under the fix, waitReady calls inPageEnumerate('main') — so the mock must return
  // the inPageEnumerate shape scoped to <main> content only.
  // Polls 0-4: <main> is empty (no entries, 0 scanned) — CONTAINER_NOT_FOUND throw
  // Polls 5+: <main> appears with content that stabilizes
  let pollCount = 0;
  const mockPage = {
    evaluate: async () => {
      pollCount++;
      if (pollCount <= 5) {
        // <main> not yet mounted — inPageEnumerate throws CONTAINER_NOT_FOUND
        throw new Error('CONTAINER_NOT_FOUND: no <main> element found on http://test.local/page. Refusing to enumerate — no fallback to document.');
      }
      // <main> now mounted with content — return inPageEnumerate shape
      return { entries: [{ key: 'testid:field-1' }, { key: 'role:button|Save' }], candidates: [], stats: { scanned: 50, shadowHosts: 0, uniqueKeys: 2 } };
    },
    waitForTimeout: async () => {},
  };
  let ready = false, msg = '';
  try { await waitReady(mockPage, { interval: 10, timeout: 2000 }); ready = true; }
  catch (err) { msg = err.message; }
  assert('readiness waits for <main> to appear (not satisfied by chrome)', ready, `got: ${msg}`);
  assert('needed >5 polls (waited for <main> to mount)', pollCount > 5,
    `declared ready after ${pollCount} polls — pre-fix would fire on stable document chrome immediately`);
}

// ─── g76 Defect 2: kinds absent from old narrow selector still hold readiness open ─────
// Late content composed ONLY of kinds absent from the old KINDS selector (data-testid-only,
// summary, iframe, tabindex) must still register in the census. Pre-fix: waitReady used a
// narrow KINDS selector that missed these; post-fix uses inPageEnumerate's matchReasonA.
console.log('\ng76 Defect 2: late content with only non-KINDS elements (testid, summary, iframe, tabindex) holds readiness');
{
  // Simulate: first 3 polls show a small <main> with 1 button, then content arrives
  // composed only of elements the OLD narrow selector missed (testid-only divs, summary, iframe).
  // Under the fix, these count as interactive (matchReasonA matches them), so census jumps.
  let pollCount = 0;
  const mockPage = {
    evaluate: async () => {
      pollCount++;
      if (pollCount <= 3) {
        // Small initial state — 1 button
        return { entries: [{ key: 'role:button|OK' }], candidates: [], stats: { scanned: 10, shadowHosts: 0, uniqueKeys: 1 } };
      }
      if (pollCount <= 5) {
        // Late content arrives: testid-only divs, summary, iframe, tabindex spans
        return { entries: [
          { key: 'role:button|OK' }, { key: 'testid:widget-1' }, { key: 'testid:widget-2' },
          { key: 'struct:summary|Details|form' }, { key: 'struct:iframe||content' },
          { key: 'struct:span|helper|tabindex' },
        ], candidates: [], stats: { scanned: 80, shadowHosts: 0, uniqueKeys: 6 } };
      }
      // Stabilizes at 6
      return { entries: [
        { key: 'role:button|OK' }, { key: 'testid:widget-1' }, { key: 'testid:widget-2' },
        { key: 'struct:summary|Details|form' }, { key: 'struct:iframe||content' },
        { key: 'struct:span|helper|tabindex' },
      ], candidates: [], stats: { scanned: 80, shadowHosts: 0, uniqueKeys: 6 } };
    },
    waitForTimeout: async () => {},
  };
  let ready = false, msg = '';
  try { await waitReady(mockPage, { interval: 10, timeout: 2000 }); ready = true; }
  catch (err) { msg = err.message; }
  assert('late non-KINDS content eventually becomes ready', ready, `got: ${msg}`);
  assert('did NOT declare ready during the 1-element phase (waited for late content)',
    pollCount > 5,
    `declared ready after ${pollCount} polls — pre-fix narrow KINDS missed these elements so census=1 was stable`);
}

// ─── g76 Defect 3: waitReady calls inPageEnumerate with 'main' (real path proof) ─────
// Proves the ACTUAL function+arg passed to page.evaluate is inPageEnumerate and 'main'.
// Fails if waitReady is reverted to a hand-rolled selector or document scope.
console.log('\ng76 Defect 3: waitReady invokes inPageEnumerate with container arg "main"');
{
  let capturedFn = null, capturedArg = null, pollCount = 0;
  const mockPage = {
    evaluate: async (fn, ...args) => {
      pollCount++;
      capturedFn = fn;
      capturedArg = args[0];
      // Return stable result immediately so it resolves after CENSUS_STABLE_READS
      return { entries: [{ key: 'testid:a' }, { key: 'testid:b' }, { key: 'testid:c' },
                         { key: 'testid:d' }, { key: 'testid:e' }, { key: 'testid:f' },
                         { key: 'testid:g' }, { key: 'testid:h' }, { key: 'testid:i' }],
               candidates: [], stats: { scanned: 20, shadowHosts: 0, uniqueKeys: 9 } };
    },
    waitForTimeout: async () => {},
  };
  await waitReady(mockPage, { interval: 10, timeout: 2000 });
  assert('page.evaluate receives inPageEnumerate (the shared enumerator function)',
    capturedFn === inPageEnumerate,
    `got different function: ${capturedFn && capturedFn.name}`);
  assert('page.evaluate receives "main" as the container argument',
    capturedArg === 'main',
    `got arg: ${JSON.stringify(capturedArg)}`);
}

// ─── g76 Finding 2: genuine errors surface in timeout message (LR-003) ──────────────
console.log('\ng76 Finding 2: genuine evaluate errors are surfaced in timeout message');
{
  let pollCount = 0;
  const mockPage = {
    evaluate: async () => {
      pollCount++;
      throw new Error('Serialization failed: cannot serialize function');
    },
    waitForTimeout: async () => {},
  };
  let msg = '';
  try { await waitReady(mockPage, { interval: 10, timeout: 80 }); }
  catch (err) { msg = err.message; }
  assert('timeout message includes WAIT_READY_TIMEOUT', msg.includes('[WAIT_READY_TIMEOUT]'), `got: ${msg}`);
  assert('timeout message includes the actual error text', msg.includes('Serialization failed'),
    `error not surfaced in timeout: ${msg}`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);

// ═══════════════════════════════════════════════════════════════════════════════
// g78-V7 tests: fixpoint timing, adhoc config, occurrence counts
// ═══════════════════════════════════════════════════════════════════════════════

// Shared mock factory: a page whose enumerateState returns entries from a sequence.
// Each enumerateState call consumes from scanSequence; repeats the last one forever.
function mockEnumPage(scanSequence) {
  let callCount = 0;
  const frame = {
    evaluate: async () => {
      const idx = Math.min(callCount, scanSequence.length - 1);
      callCount++;
      return scanSequence[idx];
    },
  };
  return {
    get scanCount() { return callCount; },
    frames: () => [frame],
    mainFrame: () => frame,
    waitForTimeout: async () => {},
  };
}

function makeEnumResult(n) {
  const entries = Array.from({ length: n }, (_, i) => ({
    key: `testid:field-${i}`, role: 'input', name: `field ${i}`,
    why: 'testid', inA: true, inB: false, disabled: false,
  }));
  return { entries, candidates: [], stats: { scanned: n, shadowHosts: 0, uniqueKeys: n } };
}

// ─── T-race: pre-fix RED, post-fix GREEN ─────────────────────────────────────
// Mock page: scan calls return 9, 9, 48, 48, 95, 95, 95... (pairs per cycle)
console.log('\nT-race (RED — pre-fix legacy || break)');
{
  const seq = [
    makeEnumResult(9), makeEnumResult(9),     // cycle 1: top=9, bottom=9
    makeEnumResult(48), makeEnumResult(48),   // cycle 2: top=48, bottom=48
    makeEnumResult(95), makeEnumResult(95),   // cycle 3+: stable at 95
    makeEnumResult(95), makeEnumResult(95),
    makeEnumResult(95), makeEnumResult(95),
    makeEnumResult(95), makeEnumResult(95),
  ];
  const page = mockEnumPage(seq);
  const accum = new Map();
  const report = { cycles: [], branches: [] };
  const result = await expandToFixpoint(page, accum, null, false, 10, report, { _testLegacyBreak: true });
  console.log(`  PRE-FIX: accum=${accum.size} (expected <95)`);
  assert('T-race RED: pre-fix accum below 95', accum.size < 95,
    `got accum=${accum.size} — legacy || should break on clicked=0 before all keys arrive`);
}

console.log('\nT-race (GREEN — post-fix && break + confirmation)');
{
  const seq = [
    makeEnumResult(9), makeEnumResult(9),
    makeEnumResult(48), makeEnumResult(48),
    makeEnumResult(95), makeEnumResult(95),
    makeEnumResult(95), makeEnumResult(95),
    makeEnumResult(95), makeEnumResult(95),
    makeEnumResult(95), makeEnumResult(95),
    makeEnumResult(95), makeEnumResult(95),
  ];
  const page = mockEnumPage(seq);
  const accum = new Map();
  const report = { cycles: [], branches: [] };
  const result = await expandToFixpoint(page, accum, null, false, 10, report);
  console.log(`  POST-FIX: accum=${accum.size}, settled=${result.settled}`);
  assert('T-race GREEN: post-fix captures all 95', accum.size === 95,
    `got accum=${accum.size}`);
  assert('T-race GREEN: settled=true', result.settled === true);
  // Verify late keys are tagged 'resting'
  const lateKeys = [...accum.values()].filter(e => parseInt(e.key.split('-')[1]) >= 9);
  const allResting = lateKeys.every(e => e.branches && e.branches.includes('resting'));
  assert('T-race GREEN: every late key tagged resting', allResting,
    `found non-resting late key`);
}

// ─── T-positive-control: forever-growing page MUST halt ──────────────────────
console.log('\nT-positive-control: forever-growing page ends in halted path');
{
  // Each scan adds 5 more keys, forever
  let n = 0;
  const frame = {
    evaluate: async () => {
      n += 5;
      return makeEnumResult(n);
    },
  };
  const page = {
    frames: () => [frame],
    mainFrame: () => frame,
    waitForTimeout: async () => {},
  };
  const accum = new Map();
  const report = { cycles: [], branches: [] };
  const result = await expandToFixpoint(page, accum, null, false, 6, report);
  console.log(`  settled=${result.settled}, msg=${(result.msg || '').slice(0, 80)}`);
  assert('T-positive-control: settled=false (halted)', result.settled === false,
    `expected halted path but got settled=true with accum=${accum.size}`);
  assert('T-positive-control: msg contains FIXPOINT-EXHAUSTED',
    result.msg && result.msg.includes('FIXPOINT-EXHAUSTED'),
    `got msg: ${result.msg}`);
  assert('T-positive-control: msg contains "Refusing to emit"',
    result.msg && result.msg.includes('Refusing to emit'),
    `got msg: ${result.msg}`);
}

// ─── T-stable-small: 9-key page completes at exactly 9 ──────────────────────
console.log('\nT-stable-small: stable 9-key page completes correctly');
{
  const seq = Array(20).fill(makeEnumResult(9));
  const page = mockEnumPage(seq);
  const accum = new Map();
  const report = { cycles: [], branches: [] };
  const result = await expandToFixpoint(page, accum, null, false, 6, report);
  console.log(`  accum=${accum.size}, settled=${result.settled}`);
  assert('T-stable-small: accum is exactly 9', accum.size === 9,
    `got accum=${accum.size} — fix must not inflate a genuinely small page`);
  assert('T-stable-small: settled=true', result.settled === true);
}

// ─── T-adhoc: resolveRunConfig produces adhoc for --url without --module ─────
console.log('\nT-adhoc: resolveRunConfig adhoc and validation');
{
  const rc1 = resolveRunConfig(
    { url: 'https://x/navigator/locations/1607/settings/foo' },
    MODULE_CONFIG
  );
  assert('T-adhoc: module=adhoc', rc1.moduleName === 'adhoc',
    `got moduleName=${rc1.moduleName}`);
  assert('T-adhoc: office=1607', rc1.office === '1607',
    `got office=${rc1.office}`);
  assert('T-adhoc: cfg=null', rc1.cfg === null,
    `got cfg=${JSON.stringify(rc1.cfg)}`);
  assert('T-adhoc: no error', rc1.error === undefined);

  // --url with --module=pricing should exit 2 when URL doesn't match
  const rc2 = resolveRunConfig(
    { url: 'https://x/navigator/locations/1607/settings/foo', module: 'pricing' },
    MODULE_CONFIG
  );
  assert('T-adhoc: --url + --module mismatch → exitCode 2', rc2.exitCode === 2,
    `got exitCode=${rc2.exitCode}, error=${rc2.error}`);
}

// ─── T-counts: mergeEntries preserves max occurrences; manifest renders ×N ───
console.log('\nT-counts: occurrence counting in mergeEntries');
{
  const accum = new Map();
  // First merge: 36 occurrences of the same key
  const entries1 = [{ key: 'struct:input|Date|grid/row', role: 'input', name: 'Date',
    why: 'native:input', inA: true, inB: false, disabled: false, occurrences: 36 }];
  mergeEntries(accum, entries1, 'resting', false);
  assert('T-counts: first merge sets occurrences=36',
    accum.get('struct:input|Date|grid/row').occurrences === 36,
    `got ${accum.get('struct:input|Date|grid/row').occurrences}`);

  // Second merge: same key with 20 occurrences — max should stay 36
  const entries2 = [{ key: 'struct:input|Date|grid/row', role: 'input', name: 'Date',
    why: 'native:input', inA: true, inB: false, disabled: false, occurrences: 20 }];
  mergeEntries(accum, entries2, 'expand-1', false);
  assert('T-counts: max-merge keeps 36 (not overwritten by 20)',
    accum.get('struct:input|Date|grid/row').occurrences === 36,
    `got ${accum.get('struct:input|Date|grid/row').occurrences}`);

  // Verify renderManifest produces ×N
  const { renderManifest } = await import('../lib/deep-pierce.mjs');
  const manifest = renderManifest({
    walkState: 'test', entries: [...accum.values()],
    machineFoundDate: '2026-08-18', sourceJson: 'test.json'
  });
  assert('T-counts: manifest renders (×36 live)',
    manifest.includes('(×36 live)'),
    `manifest does not contain (×36 live)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// g78-V9 tests: URL-to-config resolution, hydration-131 mock
// ═══════════════════════════════════════════════════════════════════════════════

// ─── T-url-resolves-config: pricing URL with --module resolves pricing cfg ───
console.log('\nT-url-resolves-config: pricing URL with --module resolves to pricing config');
{
  const BASE = 'https://cloudapps-e2e.encoreglobal.com/navigator';
  const pricingUrl = `${BASE}/locations/1604/settings/location`;
  // URL-only resolves to pricing (no urlGroup siblings in production config — stand-in removed).
  // The urlGroup mechanism is still tested with test-local fixtures in T-urlgroup-ambiguity below.
  const rcAlone = resolveRunConfig({ url: pricingUrl }, MODULE_CONFIG);
  assert('T-url-resolves-config: URL-only resolves pricing (no siblings)',
    rcAlone.moduleName === 'pricing' && !rcAlone.error,
    `got: ${JSON.stringify({ moduleName: rcAlone.moduleName, error: rcAlone.error, exitCode: rcAlone.exitCode })}`);
  // With --module, resolves correctly
  const rc = resolveRunConfig({ url: pricingUrl, module: 'pricing' }, MODULE_CONFIG);
  assert('T-url-resolves-config: moduleName=pricing', rc.moduleName === 'pricing',
    `got moduleName=${rc.moduleName}`);
  assert('T-url-resolves-config: cfg is not null', rc.cfg !== null,
    `got cfg=${rc.cfg}`);
  assert('T-url-resolves-config: office=1604', rc.office === '1604',
    `got office=${rc.office}`);
  assert('T-url-resolves-config: no error', rc.error === undefined);
  const rcModule = resolveRunConfig({ module: 'pricing', office: '1604' }, MODULE_CONFIG);
  assert('T-url-resolves-config: cfg matches --module=pricing cfg',
    rc.cfg === rcModule.cfg, 'config objects differ');
}

// ─── T-url-no-match: URL matching no config → adhoc ─────────────────────────
console.log('\nT-url-no-match: unrecognized URL resolves to adhoc');
{
  const rc = resolveRunConfig(
    { url: 'https://cloudapps-e2e.encoreglobal.com/navigator/locations/1607/settings/unknown-page' },
    MODULE_CONFIG
  );
  assert('T-url-no-match: moduleName=adhoc', rc.moduleName === 'adhoc',
    `got moduleName=${rc.moduleName}`);
  assert('T-url-no-match: cfg=null', rc.cfg === null,
    `got cfg=${JSON.stringify(rc.cfg)}`);
  assert('T-url-no-match: office=1607', rc.office === '1607',
    `got office=${rc.office}`);
  assert('T-url-no-match: no error', rc.error === undefined);
}

// ─── T-url-ambiguous: URL matching two configs exits 2 ──────────────────────
console.log('\nT-url-ambiguous: ambiguous URL exits 2 naming both candidates');
{
  const ambiguousConfig = {
    modA: { path: (o) => `https://example.com/locations/${o}/settings/shared` },
    modB: { path: (o) => `https://example.com/locations/${o}/settings/shared` },
  };
  const rc = resolveRunConfig(
    { url: 'https://example.com/locations/1604/settings/shared/page' },
    ambiguousConfig
  );
  assert('T-url-ambiguous: exitCode=2', rc.exitCode === 2,
    `got exitCode=${rc.exitCode}`);
  assert('T-url-ambiguous: error names modA', rc.error && rc.error.includes('modA'),
    `error: ${rc.error}`);
  assert('T-url-ambiguous: error names modB', rc.error && rc.error.includes('modB'),
    `error: ${rc.error}`);
}

// ─── T-provenance: resolved module/office in return, never a default ─────────
console.log('\nT-provenance: resolved values reflect URL, not defaults');
{
  const BASE = 'https://cloudapps-e2e.encoreglobal.com/navigator';
  const rc = resolveRunConfig(
    { url: `${BASE}/locations/9999/settings/location`, module: 'pricing' },
    MODULE_CONFIG
  );
  assert('T-provenance: office=9999 (from URL)', rc.office === '9999',
    `got office=${rc.office}`);
  assert('T-provenance: moduleName=pricing (resolved)', rc.moduleName === 'pricing',
    `got moduleName=${rc.moduleName}`);
  assert('T-provenance: url preserved', rc.url.includes('9999'),
    `got url=${rc.url}`);
}

// ─── T-hydration-131: mock reproducing the colleague's shape ─────────────────
// Phase 1: resting hydration (no openers, cfg=null) — page hydrates 9→92 across scans.
// Legacy || break: clicked=0 on cycle 1 → breaks at 9. Post-fix &&: continues until added=0 → 92.
// Phase 2: with cfg resolved (opener activates tab, adds 39) → total 131.
console.log('\nT-hydration-131: hydration mock reaches 131 post-fix');
{
  function makeNamedEntries(start, count, prefix) {
    return Array.from({ length: count }, (_, i) => ({
      key: `testid:${prefix}-${start + i}`, role: 'input', name: `${prefix} ${start + i}`,
      why: 'testid', inA: true, inB: false, disabled: false,
    }));
  }
  function makeResultFrom(entries) {
    return { entries, candidates: [], stats: { scanned: entries.length, shadowHosts: 0, uniqueKeys: entries.length } };
  }

  const baseEntries9 = makeNamedEntries(0, 9, 'field');
  const baseEntries48 = makeNamedEntries(0, 48, 'field');
  const baseEntries92 = makeNamedEntries(0, 92, 'field');
  const tabEntries39 = makeNamedEntries(92, 39, 'field');
  const allEntries131 = [...baseEntries92, ...tabEntries39];

  // Phase 1: resting hydration WITHOUT cfg — clicked is always 0
  console.log('  Phase 1: resting hydration (no cfg)');
  {
    const seq = [
      makeResultFrom(baseEntries9), makeResultFrom(baseEntries9),     // cycle 1
      makeResultFrom(baseEntries48), makeResultFrom(baseEntries48),   // cycle 2
      makeResultFrom(baseEntries92), makeResultFrom(baseEntries92),   // cycle 3
      makeResultFrom(baseEntries92), makeResultFrom(baseEntries92),   // cycle 4 stable
      makeResultFrom(baseEntries92),                                  // confirm
      makeResultFrom(baseEntries92),
    ];
    // Legacy run — clicked=0 always → || breaks cycle 1
    const pageL = mockEnumPage([...seq]);
    const accumL = new Map();
    const reportL = { cycles: [], branches: [] };
    await expandToFixpoint(pageL, accumL, null, false, 10, reportL, { _testLegacyBreak: true });
    console.log(`    LEGACY:   accum=${accumL.size} (expected <=9)`);
    assert('T-hydration-131: legacy resting stops at <=9', accumL.size <= 9,
      `got accum=${accumL.size}`);

    // Post-fix run — && requires both clicked=0 AND added=0
    const pageF = mockEnumPage([...seq]);
    const accumF = new Map();
    const reportF = { cycles: [], branches: [] };
    await expandToFixpoint(pageF, accumF, null, false, 10, reportF);
    console.log(`    POST-FIX: accum=${accumF.size} (expected 92)`);
    assert('T-hydration-131: post-fix resting reaches 92', accumF.size === 92,
      `got accum=${accumF.size}`);
  }

  // Phase 2: with cfg resolved (opener activates tab, adds 39)
  console.log('  Phase 2: with cfg (tab activation adds 39 -> 131)');
  {
    const tabOpenerKey = 'testid:activate-tab-1';
    const tabOpenerEntry = { key: tabOpenerKey, role: 'button', name: 'Tab 1',
      why: 'testid', inA: true, inB: false, disabled: false };
    const mockCfg = { openerTestidPatterns: [/activate-tab/i] };

    const seq = [
      makeResultFrom([...baseEntries92, tabOpenerEntry]),  // cycle 1 top: see opener
      makeResultFrom(allEntries131),                        // cycle 1 bottom: tab revealed 39
      makeResultFrom(allEntries131),                        // cycle 2 top
      makeResultFrom(allEntries131),                        // cycle 2 bottom
      makeResultFrom(allEntries131),                        // confirm
      makeResultFrom(allEntries131),
    ];
    const page = mockEnumPage(seq);
    page.locator = () => ({ count: async () => 1, first: () => ({ click: async () => {} }) });
    const accum = new Map();
    const report = { cycles: [], branches: [] };
    const result = await expandToFixpoint(page, accum, mockCfg, false, 10, report);
    console.log(`    POST-FIX: accum=${accum.size}, settled=${result.settled}`);
    assert('T-hydration-131: with cfg reaches 131', accum.size === 131,
      `got accum=${accum.size}`);
    assert('T-hydration-131: settled=true', result.settled === true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// g78-V13 tests: segment-boundary matching, longest-prefix-wins, provenance guard
// ═══════════════════════════════════════════════════════════════════════════════

// ─── T-segment-boundary: /settings/aardvark does NOT match /settings/a config ─
console.log('\nT-segment-boundary: prefix must end at segment boundary');
{
  const segConfig = {
    short: { path: (o) => `https://example.com/locations/${o}/settings/a` },
    longer: { path: (o) => `https://example.com/locations/${o}/settings/ab` },
  };
  const rc = resolveRunConfig(
    { url: 'https://example.com/locations/1604/settings/aardvark' },
    segConfig
  );
  assert('T-segment-boundary: /settings/aardvark → adhoc (not short)',
    rc.moduleName === 'adhoc', `got moduleName=${rc.moduleName}`);

  // But /settings/a/sub DOES match short (segment boundary /)
  const rc2 = resolveRunConfig(
    { url: 'https://example.com/locations/1604/settings/a/sub' },
    segConfig
  );
  assert('T-segment-boundary: /settings/a/sub → short',
    rc2.moduleName === 'short', `got moduleName=${rc2.moduleName}`);

  // Exact match works
  const rc3 = resolveRunConfig(
    { url: 'https://example.com/locations/1604/settings/a' },
    segConfig
  );
  assert('T-segment-boundary: exact /settings/a → short',
    rc3.moduleName === 'short', `got moduleName=${rc3.moduleName}`);
}

// ─── T-longest-prefix: nested configs resolve to most specific ───────────────
console.log('\nT-longest-prefix: longest prefix wins among segment-boundary matches');
{
  const nestedConfig = {
    parent: { path: (o) => `https://x.com/locations/${o}/settings/corporate-pricing` },
    child:  { path: (o) => `https://x.com/locations/${o}/settings/corporate-pricing/pg-override` },
  };
  const rc = resolveRunConfig(
    { url: 'https://x.com/locations/1604/settings/corporate-pricing/pg-override' },
    nestedConfig
  );
  assert('T-longest-prefix: pg-override URL → child (not parent)',
    rc.moduleName === 'child', `got moduleName=${rc.moduleName}`);

  const rc2 = resolveRunConfig(
    { url: 'https://x.com/locations/1604/settings/corporate-pricing' },
    nestedConfig
  );
  assert('T-longest-prefix: parent URL → parent',
    rc2.moduleName === 'parent', `got moduleName=${rc2.moduleName}`);
}

// ─── T-provenance-guard: --module naming wrong (shorter) config for longer URL ─
console.log('\nT-provenance-guard: --module=parent with child URL exits 2');
{
  const nestedConfig = {
    parent: { path: (o) => `https://x.com/locations/${o}/settings/corporate-pricing` },
    child:  { path: (o) => `https://x.com/locations/${o}/settings/corporate-pricing/pg-override` },
  };
  const rc = resolveRunConfig(
    { url: 'https://x.com/locations/1604/settings/corporate-pricing/pg-override', module: 'parent' },
    nestedConfig
  );
  assert('T-provenance-guard: exitCode=2', rc.exitCode === 2,
    `got exitCode=${rc.exitCode}, error=${rc.error}`);
  assert('T-provenance-guard: error names child',
    rc.error && rc.error.includes('child'),
    `error: ${rc.error}`);
}

// ─── T-all-configs-own-path: every MODULE_CONFIG resolves from its own path ──
console.log('\nT-all-configs-own-path: each config resolves from its own generated URL');
{
  const office = '1604';
  const results = [];
  for (const [name, cfg] of Object.entries(MODULE_CONFIG)) {
    let url;
    try { url = cfg.path(office); } catch { results.push({ name, status: 'SKIP (path() throws)' }); continue; }
    // Shared-URL configs (urlGroup) require --module; others resolve by URL alone
    const rc = cfg.urlGroup
      ? resolveRunConfig({ url, module: name }, MODULE_CONFIG)
      : resolveRunConfig({ url }, MODULE_CONFIG);
    if (rc.error) {
      results.push({ name, status: `ERROR: ${rc.error}` });
    } else if (rc.moduleName !== name) {
      results.push({ name, status: `WRONG: resolved as ${rc.moduleName}` });
    } else {
      results.push({ name, status: 'OK' });
    }
  }
  for (const r of results) {
    console.log(`    ${r.name}: ${r.status}`);
    assert(`T-all-configs-own-path: ${r.name}`,
      r.status === 'OK', r.status);
  }
}

// ─── T-urlgroup-ambiguity: shared URL without --module refuses ───────────────
console.log('\nT-urlgroup-ambiguity: shared-URL configs refuse URL-only resolution');
{
  const sharedConfig = {
    tabA: { urlGroup: 'shared', path: (o) => `https://x.com/locations/${o}/page` },
    tabB: { urlGroup: 'shared', path: (o) => `https://x.com/locations/${o}/page` },
  };
  const rc = resolveRunConfig(
    { url: 'https://x.com/locations/1604/page' },
    sharedConfig
  );
  assert('T-urlgroup-ambiguity: exitCode=2', rc.exitCode === 2,
    `got exitCode=${rc.exitCode}`);
  assert('T-urlgroup-ambiguity: error names tabA', rc.error && rc.error.includes('tabA'),
    `error: ${rc.error}`);
  assert('T-urlgroup-ambiguity: error names tabB', rc.error && rc.error.includes('tabB'),
    `error: ${rc.error}`);
  // With --module, resolves correctly
  const rc2 = resolveRunConfig(
    { url: 'https://x.com/locations/1604/page', module: 'tabB' },
    sharedConfig
  );
  assert('T-urlgroup-ambiguity: --module=tabB resolves', rc2.moduleName === 'tabB',
    `got moduleName=${rc2.moduleName}`);
}

// ─── T-no-silent-default: missing --module or --office errors ────────────────
console.log('\nT-no-silent-default: no --module and no --url errors');
{
  const rc = resolveRunConfig({ office: '1604' }, MODULE_CONFIG);
  assert('T-no-silent-default: missing --module → error', rc.exitCode === 2,
    `got: ${JSON.stringify(rc)}`);
  const rc2 = resolveRunConfig({ module: 'pricing' }, MODULE_CONFIG);
  assert('T-no-silent-default: missing --office → error', rc2.exitCode === 2,
    `got: ${JSON.stringify(rc2)}`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
