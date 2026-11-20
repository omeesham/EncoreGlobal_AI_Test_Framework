/**
 * Validates the toolkit's own rules: each utility runs on a deliberately bad fixture and must raise the expected
 * findings (and nothing it should not). Run: npx ts-node src/utils/qa-toolkit/cli.ts self-test
 */
import * as path from 'path';
import type { Finding, ToolkitOptions, Utility, UtilityResult } from '../core/types';
import { validateAssertions } from '../assertions/assertion-validator';
import { bugDraft, classifyFailure, expectedActual, type Evidence, type FailureInput } from '../bugs/bug-detector';
import { analyzeCoverage, parseAcceptance, parsePlan, requirementIds, scenariosOf, type CoverageCase } from '../coverage/coverage-analyzer';
import { detectDuplicates, readSpecTests, type WorkbookCase } from '../duplicates/duplicate-detector';
import { collectHistory, judge, playwrightArgs } from '../flaky/flaky-analyzer';
import { analyzeLocators, checkSelector, suggestLocator } from '../locators/locator-validator';
import { analyzeScripts } from '../script-quality/script-quality-analyzer';

const FIXTURES = path.join(__dirname, 'fixtures');

interface Expectation { rule: string; line?: number; min?: number }
interface Check { utility: string; passed: boolean; detail: string }

function expectRules(utility: string, findings: Finding[], expected: Expectation[]): Check[] {
  return expected.map(({ rule, line, min = 1 }) => {
    const hits = findings.filter((f) => f.rule === rule && (line === undefined || f.line === line));
    return {
      utility,
      passed: hits.length >= min,
      detail: `${rule}${line ? ` @${line}` : ''}: expected ≥${min}, found ${hits.length}`,
    };
  });
}

/** Expected findings per fixture line — kept next to the fixture's own comments. */
function checkScriptQuality(root: string): Check[] {
  const file = path.join(FIXTURES, 'quality-sample.spec.ts');
  const { findings } = analyzeScripts(root, [file]);
  const checks = expectRules('quality', findings, [
    { rule: 'hardcoded-credential', line: 7 },
    { rule: 'focused-test', line: 14 },
    { rule: 'missing-await', line: 15 },
    { rule: 'missing-await', line: 16 },
    { rule: 'missing-await', line: 17 },
    { rule: 'hardcoded-wait', line: 18 },
    { rule: 'hardcoded-credential', line: 19 },
    { rule: 'no-assertion', line: 23 },
    { rule: 'force-action', line: 24 },
    { rule: 'networkidle-wait', line: 25 },
    { rule: 'debug-pause', line: 26 },
    { rule: 'empty-catch', line: 27 },
    { rule: 'swallowed-rejection', line: 28 },
    { rule: 'hardcoded-wait', line: 29 },
    { rule: 'duplicate-title', line: 33 },
  ]);
  // Negative checks: the awaited calls and the test with an assertion must stay clean.
  const falseAwait = findings.filter((f) => f.rule === 'missing-await' && ![15, 16, 17].includes(f.line));
  checks.push({ utility: 'quality', passed: falseAwait.length === 0, detail: `no missing-await on awaited calls (found ${falseAwait.length})` });
  const falseNoAssert = findings.filter((f) => f.rule === 'no-assertion' && f.line !== 23);
  checks.push({ utility: 'quality', passed: falseNoAssert.length === 0, detail: `no-assertion only on SAMPLE-002 (found ${falseNoAssert.length} elsewhere)` });
  const leaked = findings.filter((f) => f.rule === 'hardcoded-credential' && (f.snippet ?? '').includes('FakeP4ss!'));
  checks.push({ utility: 'quality', passed: leaked.length === 0, detail: 'credential values are masked in snippets' });
  return checks;
}

/** ASSERT-NNN <rule> tests must raise <rule>; GOOD-NNN tests must raise nothing. */
function checkAssertions(root: string): Check[] {
  const { findings } = validateAssertions(root, [path.join(FIXTURES, 'assertion-sample.spec.ts')]);
  const checks: Check[] = [];
  for (const [title, rule] of [
    ['ASSERT-001 no-business-assertion', 'no-business-assertion'],
    ['ASSERT-002 tautological-assertion', 'tautological-assertion'],
    ['ASSERT-003 matcherless-expect', 'matcherless-expect'],
    ['ASSERT-004 weak-assertions-only', 'weak-assertions-only'],
    ['ASSERT-005 unverified-final-action', 'unverified-final-action'],
    ['ASSERT-006 conditional-assertions-only', 'conditional-assertions-only'],
    ['ASSERT-007 non-retrying-assertion', 'non-retrying-assertion'],
    ['ASSERT-008 cleanup-outside-finally', 'cleanup-outside-finally'],
  ] as const) {
    const hit = findings.some((f) => f.test === title && f.rule === rule);
    checks.push({ utility: 'assertions', passed: hit, detail: `${rule} raised on "${title}"` });
  }
  for (const good of ['GOOD-001 action then a content assertion', 'GOOD-002 assertion through a helper, clean-up in finally',
    'GOOD-003 closing with Escape after the assertion', 'GOOD-004 the same assertion helper called twice']) {
    const extra = findings.filter((f) => f.test === good);
    checks.push({ utility: 'assertions', passed: extra.length === 0,
      detail: `"${good}" stays clean (found ${extra.map((f) => f.rule).join(', ') || 'nothing'})` });
  }
  return checks;
}

/** Selector rules on strings, suggestions, and resolution/dedupe/positional rules on the fixture. */
function checkLocators(root: string): Check[] {
  const checks: Check[] = [];
  const rule = (selector: string, expected: string, present = true): void => {
    const hit = checkSelector(selector).some((i) => i.rule === expected);
    checks.push({ utility: 'locators', passed: hit === present, detail: `${present ? '' : 'no '}${expected} for ${selector}` });
  };
  rule('#radix-_r_12_', 'generated-id');
  rule('[aria-controls="radix-:r4:"]', 'generated-id');
  rule('[data-radix-popper-content-wrapper] input', 'generated-id', false);
  rule('#commission-tiers-currency', 'generated-id', false);
  rule('.css-1x2y3z4 > span', 'generated-class');
  rule('/html/body/div[2]', 'absolute-xpath');
  rule('xpath=.//label[normalize-space(text())="Name"]/following::input[1]', 'xpath-locator');
  rule('tbody tr:nth-child(3)', 'positional-css');
  rule('div.text-destructive', 'style-class');
  rule('div span', 'generic-tag');
  rule('main button[aria-label="Grid Options"]', 'generic-tag', false);
  rule('main tbody tr:has(td + td)', 'generic-tag', false);
  rule('main button[aria-label="Close"', 'invalid-selector');
  rule('button:text-is("Save")', 'text-coupled');
  rule('[data-testid="commission-tiers-add-row"]', 'generic-tag', false);
  rule('[data-testid="commission-tiers-add-row"]', 'text-coupled', false);
  rule('[data-testid^="commission-tier-${…}-"]', 'invalid-selector', false);

  const suggest = (selector: string, expected: string): void => {
    const got = suggestLocator(selector);
    checks.push({ utility: 'locators', passed: got === expected, detail: `suggest ${expected} for ${selector} (got ${got ?? 'none'})` });
  };
  suggest('[data-testid="add-row"]', "getByTestId('add-row')");
  suggest('main button:text-is("Save")', "getByRole('button', { name: 'Save' })");
  suggest('main button[aria-label="Grid Options"]', "getByRole('button', { name: 'Grid Options' })");
  suggest('[role="dialog"]:has-text("Copy")', "getByRole('dialog', { name: 'Copy' })");
  suggest('xpath=.//label[normalize-space(text())="Local Office"]/parent::*', "getByLabel('Local Office')");

  const { findings, entries } = analyzeLocators(root, [path.join(FIXTURES, 'locator-sample.spec.ts')]);
  const has = (r: string, text: string): boolean => findings.some((f) => f.rule === r && f.message.includes(text));
  checks.push({ utility: 'locators', passed: has('text-coupled', 'used 2 times'), detail: 'a constant used twice is reported once, with its use count' });
  checks.push({ utility: 'locators', passed: has('generated-id', '#radix-_r_12_'), detail: 'constant resolved through the type checker (generated id)' });
  checks.push({ utility: 'locators', passed: has('absolute-xpath', '/html/body'), detail: 'absolute XPath constant found' });
  checks.push({ utility: 'locators', passed: findings.some((f) => f.rule === 'positional-locator' && f.message.startsWith('nth(2)')), detail: 'nth(2) reported' });
  checks.push({ utility: 'locators', passed: findings.some((f) => f.rule === 'positional-locator' && f.message.startsWith('first()')), detail: 'first() reported' });
  checks.push({ utility: 'locators', passed: findings.some((f) => f.rule === 'unscoped-text'), detail: 'page.getByText() reported' });
  checks.push({ utility: 'locators', passed: entries.some((e) => e.text === '[data-testid="cell-${…}"]' && e.partial), detail: 'selector builder resolved with a placeholder' });
  checks.push({ utility: 'locators', passed: !findings.some((f) => f.message.includes('cell-${…}')), detail: 'data-testid builder raises nothing' });
  const tabB = entries.find((e) => e.text === '[data-testid="tab-b"]');
  checks.push({ utility: 'locators', passed: !!tabB && tabB.uses >= 1, detail: 'both branches of cond ? A : B count as used' });
  return checks;
}

/** Spec duplicates on the fixture; workbook duplicates on in-memory cases (no binary fixture needed). */
function checkDuplicates(root: string): Check[] {
  const specs = readSpecTests(root, [path.join(FIXTURES, 'duplicate-sample.spec.ts')]);
  const cases: WorkbookCase[] = [
    { id: 'TC-WB-001', title: 'Save stores the band', file: 'wb.xlsx', row: 2, steps: 'Open the page => Page shown | Click Save => Saved' },
    { id: 'TC-WB-002', title: 'Saving keeps the value', file: 'wb.xlsx', row: 4, steps: 'Open the page => Page shown | Click Save => Saved' },
    { id: 'TC-WB-001', title: 'Delete removes the band', file: 'wb.xlsx', row: 6, steps: 'Open the page => Page shown | Click Delete => Gone' },
    { id: 'TC-WB-003', title: 'Export downloads the file', file: 'wb.xlsx', row: 8, steps: 'Click Export => File saved' },
  ];
  const findings = detectDuplicates(specs, cases);
  const has = (rule: string, text: string): boolean => findings.some((f) => f.rule === rule && f.message.includes(text));
  return [
    { utility: 'duplicates', passed: has('duplicate-tc-id', 'TC-DUP-001 is declared by 2'), detail: 'duplicate TC id across two test() calls' },
    { utility: 'duplicates', passed: has('duplicate-title', 'TC-DUP-001, TC-DUP-002') || has('duplicate-title', 'TC-DUP-002'), detail: 'same scenario under two ids' },
    { utility: 'duplicates', passed: findings.some((f) => f.rule === 'duplicate-script' && /TC-DUP-00[34]/.test(f.test ?? '')), detail: 'identical test bodies' },
    { utility: 'duplicates', passed: has('parameterizable-script', 'TC-DUP-005, TC-DUP-006'), detail: 'bodies differing only in literals' },
    { utility: 'duplicates', passed: !findings.some((f) => f.message.includes('TC-DUP-007')), detail: 'an office loop (one declaration) is not a duplicate' },
    { utility: 'duplicates', passed: has('duplicate-tc-id', 'TC-WB-001 appears on 2 rows'), detail: 'workbook: same TC id on two rows' },
    { utility: 'duplicates', passed: has('duplicate-steps', 'TC-WB-001, TC-WB-002'), detail: 'workbook: identical steps under two ids' },
    { utility: 'duplicates', passed: !findings.some((f) => f.message.includes('TC-WB-003')), detail: 'workbook: a distinct case stays clean' },
  ];
}

/** Acceptance parsing, id/wording matching, scenario needs; plan parsing (ranges, parent/epic, not-automated). */
function checkCoverage(): Check[] {
  const criteria = parseAcceptance([
    '# Tier/Flat acceptance criteria',
    '- AC-01: Comm % must be between 0 and 100; other values are refused',
    '- AC-02: Export downloads the grid as an Excel file',
    '| AC-03 | Notes accept at most 500 characters |',
    '- AC-04: The page shows the office name in the header',
    '- Users without commission rights see a forbidden message',
  ].join('\n'));
  const cases: CoverageCase[] = [
    { id: 'TC-X-001', title: 'Comm % accepts 50', text: 'AC-01 type 50 kept' },
    { id: 'TC-X-002', title: 'Export downloads TierFlat.xlsx', text: 'AC-02 click Export' },
    { id: 'TC-X-003', title: 'Notes keep 500 characters', text: 'AC-03 type 500 characters, all kept' },
    { id: 'TC-X-004', title: 'Header shows the office name', text: 'open page, read header office name' },
    { id: 'TC-X-005', title: 'Notes refuse 501 characters', text: 'AC-03 type 501 characters, refused' },
  ];
  const { findings, covered } = analyzeCoverage(criteria, cases, 'x.xlsx', 'acceptance');
  const has = (rule: string, id: string): boolean => findings.some((f) => f.rule === rule && f.test === id);
  const plan = parsePlan([
    '# NM-9999 — Sample plan',
    '| Ticket | NM-9999 (parent NM-9000, epic NM-9001); features NM-2083 |',
    'Requirements matrix TC-SP-01…04 → 01 001 · 02 002',
    '| §8 Export (NM-4444) | No Export — by design; TC-SP-05…06 not applicable |',
    '## 7. Not automated (and why)',
    '| TC-SP-03 Restricted user | No low-privilege account | — |',
  ].join('\n'));
  const planIds = plan.map((c) => c.id).sort().join(',');
  return [
    { utility: 'coverage', passed: criteria.length === 5 && criteria[4]!.id === 'AC-05', detail: `acceptance file parsed: ${criteria.length} criteria, unnumbered one gets AC-05` },
    { utility: 'coverage', passed: has('missing-negative', 'AC-01'), detail: 'AC-01 "must be between…" with only a positive case → missing-negative' },
    { utility: 'coverage', passed: has('missing-boundary', 'AC-01'), detail: 'AC-01 names 0 and 100 → missing-boundary' },
    { utility: 'coverage', passed: !findings.some((f) => f.test === 'AC-03'), detail: 'AC-03 covered at 500 and refused at 501 → clean' },
    { utility: 'coverage', passed: has('text-match-only', 'AC-04'), detail: 'AC-04 matched by wording only' },
    { utility: 'coverage', passed: has('uncovered-criterion', 'AC-05'), detail: 'AC-05 has no case → uncovered' },
    { utility: 'coverage', passed: covered === 4, detail: `4 of 5 criteria covered (got ${covered})` },
    { utility: 'coverage', passed: requirementIds('trace TC-TF-07/10, NM-3673').join(',') === 'TC-TF-07,TC-TF-10,NM-3673', detail: 'TC-TF-07/10 expands to two ids' },
    { utility: 'coverage', passed: planIds === 'NM-2083,NM-4444,TC-SP-01,TC-SP-02,TC-SP-03,TC-SP-04,TC-SP-05,TC-SP-06', detail: `plan ids: ranges expanded, ticket/parent/epic left out (${planIds})` },
    { utility: 'coverage', passed: !!plan.find((c) => c.id === 'TC-SP-03')?.documented && !!plan.find((c) => c.id === 'NM-2083')?.feature, detail: 'plan: not-automated reason and feature ticket recognised' },
    { utility: 'coverage', passed: ['NM-4444', 'TC-SP-05', 'TC-SP-06'].every((id) => !!plan.find((c) => c.id === id)?.documented), detail: 'plan: "by design / not applicable" rows (with a range) count as documented' },
    { utility: 'coverage', passed: !scenariosOf({ id: 'X', title: 'Add Row adds a row with Lower Tier Boundary 0', text: '' }).has('negative')
      && scenariosOf({ id: 'X', title: 'Comm % refuses 101', text: 'Upper Tier Boundary' }).has('negative'), detail: 'scenario type read from the title; field names do not make a case negative' },
  ];
}

/** One synthetic failure per class, plus the time-window rule. */
function checkBugs(): Check[] {
  const none: Evidence = { console: [], network: [], pageErrors: [] };
  const base: FailureInput = { title: 'TC-X-001: Saving keeps the value', file: 'x.spec.ts', testStatus: 'unexpected', lastStatus: 'failed',
    error: '', evidence: none, outsideWindow: 0, steps: [] };
  const assertion = 'Error: expect(received).toBe(expected)\n\nExpected: "1"\nReceived: ""';
  const cases: [string, FailureInput, string, string?][] = [
    ['known bug, failed as expected', { ...base, testStatus: 'expected', knownBug: 'BUG-X-001: blank day', error: assertion }, 'known-defect'],
    ['known bug, passed', { ...base, testStatus: 'unexpected', lastStatus: 'passed', knownBug: 'BUG-X-001: blank day' }, 'possibly-fixed'],
    ['passed on retry', { ...base, testStatus: 'flaky', error: assertion }, 'synchronization'],
    ['redirected to sign-in', { ...base, pageUrl: 'https://host/navigator/auth/sign-in', error: assertion }, 'environment'],
    ['DNS failure', { ...base, error: 'page.goto: net::ERR_NAME_NOT_RESOLVED at https://host/' }, 'environment'],
    ['element not stable', { ...base, error: 'locator.click: Timeout 10000ms exceeded.\n  - element is not stable' }, 'synchronization'],
    ['strict mode violation', { ...base, error: 'Error: strict mode violation: locator(\'button\') resolved to 3 elements' }, 'automation'],
    ['TypeError in test code', { ...base, error: "TypeError: Cannot read properties of undefined (reading 'click')" }, 'automation'],
    ['missing data', { ...base, error: 'Error: Needs two service types with no tiers' }, 'test-data'],
    ['locator timeout, no app error', { ...base, error: "locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator('#save')" }, 'automation'],
    ['assertion + 500 in window', { ...base, error: assertion, evidence: { ...none, network: ['500 https://host/api/save'] } }, 'application', 'High'],
    ['assertion, nothing else', { ...base, error: assertion }, 'application', 'Medium'],
    ['assertion, error text shown', { ...base, error: 'Expected: "Saved"\nReceived: "Unexpected error: duplicate key" expect(x).toHaveText' }, 'application', 'High'],
    ['unknown', { ...base, error: 'Error: boom' }, 'needs-triage'],
  ];
  const checks: Check[] = cases.map(([name, input, cls, confidence]) => {
    const c = classifyFailure(input);
    return { utility: 'bugs', passed: c.cls === cls && (!confidence || c.confidence === confidence),
      detail: `${name} → ${cls}${confidence ? ` (${confidence})` : ''} (got ${c.cls}, ${c.confidence})` };
  });
  const ea = expectedActual('Expected: "1"\nReceived: ""');
  checks.push({ utility: 'bugs', passed: ea.expected === '"1"' && ea.actual === '""', detail: 'expected / actual read from the assertion error' });
  const diff = expectedActual('expect(received).toEqual(expected)\n\n- Expected  - 2\n+ Received  + 1\n\n  Array [\n    "",\n-   "1",\n-   "2",\n+   "x",\n  ]');
  checks.push({ utility: 'bugs', passed: diff.expected === 'includes "1", "2"' && diff.actual === 'includes "x"', detail: `toEqual diff read (${diff.expected} / ${diff.actual})` });
  const draft = bugDraft({ ...base, error: assertion, steps: ['Step 1: Open Reset Dates', 'Step 2: Save'] }, classifyFailure({ ...base, error: assertion }), 'https://host/');
  checks.push({ utility: 'bugs', passed: draft.includes('**Expected:** "1"') && draft.includes('1. Open Reset Dates'), detail: 'draft carries steps, expected and actual' });
  return checks;
}

/** History grouping and verdicts on a synthetic repeated run (repeats = specs with the same title). */
function checkFlaky(root: string): Check[] {
  const spec = (title: string, status: string, result: string, duration = 1000, fail = false) => ({
    title, file: 'x.spec.ts',
    tests: [{ projectName: 'chromium', status, ...(fail ? { annotations: [{ type: 'fail' }] } : {}),
      results: [{ status: result, duration, ...(result === 'failed' ? { error: { message: 'Error: boom' } } : {}) }] }],
  });
  const report = { suites: [{ specs: [
    spec('A stable', 'expected', 'passed'), spec('B flaky', 'expected', 'passed'), spec('C broken', 'unexpected', 'failed'), spec('D known bug', 'expected', 'failed', 1000, true), spec('E slow', 'expected', 'passed', 2000),
    spec('A stable', 'expected', 'passed'), spec('B flaky', 'unexpected', 'failed'), spec('C broken', 'unexpected', 'failed'), spec('D known bug', 'expected', 'failed', 1000, true), spec('E slow', 'expected', 'passed', 30000),
    spec('A stable', 'expected', 'passed'), spec('B flaky', 'expected', 'passed'), spec('C broken', 'unexpected', 'failed'), spec('D known bug', 'expected', 'failed', 1000, true), spec('E slow', 'expected', 'passed', 2500),
  ] }] };
  const histories = collectHistory(report);
  const findings = judge(histories);
  const rule = (title: string): string[] => findings.filter((f) => f.test === title).map((f) => f.rule);
  const args = playwrightArgs({ root, dryRun: true, paths: ['tests/x.spec.ts'], outDir: 'reports/qa-toolkit', grep: 'TC-1', repeat: 4 }, 'out');
  return [
    { utility: 'flaky', passed: histories.length === 5 && histories.every((h) => h.runs.length === 3), detail: '5 tests × 3 runs grouped by title' },
    { utility: 'flaky', passed: rule('A stable').length === 0, detail: 'always passing → no finding' },
    { utility: 'flaky', passed: rule('B flaky').includes('flaky') && findings.some((f) => f.test === 'B flaky' && f.message.includes('✓ ✗ ✓')), detail: 'pass/fail/pass → flaky with history ✓ ✗ ✓' },
    { utility: 'flaky', passed: rule('C broken').includes('always-fails'), detail: 'fails every run → always-fails, not flaky' },
    { utility: 'flaky', passed: rule('D known bug').length === 0, detail: 'test.fail test failing every run behaves as declared → stable' },
    { utility: 'flaky', passed: rule('E slow').includes('unstable-duration'), detail: '2 s / 30 s / 2.5 s → unstable-duration' },
    { utility: 'flaky', passed: ['--repeat-each=4', '--retries=0', '--workers=1', '--reporter=json', '--grep=TC-1'].every((a) => args.includes(a)) && args.some((a) => a.startsWith('--output=')),
      detail: 'command forces repeats, no retries, one worker, JSON reporter, own output folder' },
  ];
}

export const selfTest: Utility = {
  name: 'self-test',
  title: 'QA Toolkit Self-Test',
  summary: 'Runs every utility on its bad-code fixture and checks the expected findings.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    const checks = [...checkScriptQuality(options.root), ...checkAssertions(options.root), ...checkLocators(options.root),
      ...checkDuplicates(options.root), ...checkCoverage(), ...checkBugs(), ...checkFlaky(options.root)];
    const failed = checks.filter((c) => !c.passed);
    return {
      utility: 'self-test', title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: options.dryRun,
      scanned: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
      findings: failed.map((c) => ({
        utility: 'self-test', rule: `${c.utility}-rule`, severity: 'High' as const, file: 'src/utils/qa-toolkit/self-test', line: 0,
        message: c.detail, recommendation: 'Fix the rule (or the fixture expectation) before relying on this utility.',
      })),
      notes: checks.map((c) => `${c.passed ? 'PASS' : 'FAIL'}  [${c.utility}] ${c.detail}`),
    };
  },
};

export default selfTest;
