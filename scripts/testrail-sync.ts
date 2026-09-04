/**
 * TestRail sync utility — the one entrypoint that takes newly authored
 * `testcases/**\/*.xlsx` all the way into live TestRail cases, kept in
 * lockstep with the Playwright specs and the generated CSVs.
 *
 * Pipeline (each step gates the next — a failure anywhere stops the run
 * before it touches TestRail):
 *
 *   1. Regenerate `testcases-testrail-import/**\/*.csv` from
 *      `testcases/**\/*.xlsx` (delegates to
 *      scripts/convert-testcases-to-testrail.py). Whenever a new module's
 *      testcases are authored, this is the step that produces its TestRail
 *      import CSV automatically — no hand conversion.
 *   2. Cross-validate the three-way chain — spec title <-> workbook row <->
 *      CSV row, in ascending TC-id order — via the existing
 *      `check:tc-ids` / `check:alignment` gates. Any mismatch aborts here,
 *      before anything is sent to TestRail.
 *   3. Diff config/testrail/case-map.json against the (now-verified) CSVs
 *      and import ONLY the TC ids that have no TestRail case id yet.
 *      Cases already present in case-map.json are left untouched — re-runs
 *      are safe and idempotent.
 *   4. Write the case ids TestRail hands back into
 *      config/testrail/case-map.json — the file the reporter
 *      (src/reporter/testrail-reporter.ts) and every spec's TC-id already
 *      resolve results against (see README.md "How tests map to TestRail
 *      cases", strategy 2/3) — AND tag each new case's test() call in its
 *      spec file with `{ tag: '@C<id>' }` (strategy 1, the same convention
 *      tests/corporate-pricing/*.spec.ts already uses). A per-run report of
 *      TC id -> case id -> spec file:line is also written to
 *      reports/testrail-import-report.json.
 *   5. Dry run is the DEFAULT (see below) — steps 1-2 run for real (they
 *      have no side effects outside this repo) and step 3 only probes
 *      TestRail connectivity and prints what *would* be imported. Pass
 *      --execute to actually create cases and write case-map.json.
 *
 * Usage (run from the repo root):
 *   npm run testrail:sync                        # dry run (safe, default)
 *   npm run testrail:sync:execute                 # real import + case-map write
 *   npm run testrail:sync -- --only local-office
 *   npm run testrail:sync:execute -- --only local-office-ect
 *   npm run testrail:sync -- --skip-convert --skip-checks   # advanced/debug only
 *
 * Env: the same TESTRAIL_* vars as src/reporter/testrail-reporter.ts (see
 * .env.testrail.example) — TESTRAIL_HOST, TESTRAIL_USERNAME, TESTRAIL_API_KEY,
 * TESTRAIL_PROJECT_ID, and optionally TESTRAIL_SUITE_ID — loaded via
 * dotenv-flow the same way playwright.config.ts does.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as dotenvFlow from 'dotenv-flow';
import * as XLSX from 'xlsx';
import {
  TestRailClient,
  type TestRailLabel,
  type TestRailNamedRef,
  type TestRailNewCase,
  type TestRailSection,
  type TestRailStep,
} from '../src/utils/testrail-client';

const ROOT = path.resolve(__dirname, '..');
const TESTCASES_DIR = path.join(ROOT, 'testcases');
const TESTRAIL_IMPORT_DIR = path.join(ROOT, 'testcases-testrail-import');
const CASE_MAP_PATH = path.join(ROOT, 'config', 'testrail', 'case-map.json');
const REPORT_PATH = path.join(ROOT, 'reports', 'testrail-import-report.json');

// Workbooks that are indexes/trackers, not per-module test-case sources —
// mirrors convert-testcases-to-testrail.py's SKIP_BASENAMES.
const SKIP_BASENAMES = new Set(['encore_test_cases', 'encore-qa-tracker']);

dotenvFlow.config({
  path: ROOT,
  node_env: process.env.CI_ENV || process.env.NODE_ENV || 'local',
  silent: true,
});

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const EXECUTE = flag('--execute');
const ONLY = opt('--only') || '';
const SKIP_CONVERT = flag('--skip-convert');
const SKIP_CHECKS = flag('--skip-checks');

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ------------------------------------------------------- step 1: regenerate CSVs
function findPython(): string {
  for (const cmd of [process.env.PYTHON, 'python', 'python3']) {
    if (!cmd) continue;
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' });
      return cmd;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    'No python/python3 found on PATH — required to run scripts/convert-testcases-to-testrail.py',
  );
}

function regenerateCsvs(): void {
  section('Step 1/5 — regenerate TestRail CSVs from testcases/*.xlsx');
  if (SKIP_CONVERT) {
    console.log('  skipped (--skip-convert)');
    return;
  }
  const python = findPython();
  const args = ['scripts/convert-testcases-to-testrail.py'];
  if (ONLY) args.push('--only', ONLY);
  execFileSync(python, args, { cwd: ROOT, stdio: 'inherit' });
}

// ------------------------------------------------------- step 2: alignment gates
function runAlignmentGates(): void {
  section('Step 2/5 — cross-validate testcases <-> testrail CSVs <-> specs (sequence + title)');
  if (SKIP_CHECKS) {
    console.log('  skipped (--skip-checks)');
    return;
  }
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-tc-id-sequence.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-testcase-alignment.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

// ------------------------------------------------------- reading the source of truth
const TC_ID_RE = /^(TC-[A-Z0-9]+(?:-[A-Z0-9]+)*)-(\d+)$/;

function walk(dir: string, ext: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext) && !e.name.startsWith('~$')) out.push(p);
  }
  return out;
}

interface WorkbookCase {
  tcId: string;
  num: number;
  title: string;
}

function readWorkbookCases(xlsxPath: string): WorkbookCase[] {
  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const header = (rows[0] ?? []).map((h) => String(h ?? ''));
  const iId = header.indexOf('TC ID');
  const iTitle = header.indexOf('Title');
  if (iId === -1) return [];

  const cases: WorkbookCase[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const id = String(row[iId] ?? '').trim();
    const m = TC_ID_RE.exec(id);
    if (!m || !m[2]) continue;
    cases.push({
      tcId: id,
      num: parseInt(m[2], 10),
      title: String(row[iTitle] ?? '').trim(),
    });
  }
  cases.sort((a, b) => a.num - b.num);
  return cases;
}

// RFC 4180 CSV parser — mirrors scripts/check-testcase-alignment.js's parseCsv so the
// two tools never disagree about what a "row" is.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') continue;
    else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim());
}

interface CsvRow {
  title: string;
  preconditions: string;
  priority: string;
  sectionHierarchy: string;
  steps: string;
  stepsExpected: string;
  labels: string;
  type: string;
}

function readCsvRows(csvPath: string): CsvRow[] {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const header = rows[0] ?? [];
  const idx: Record<string, number> = {};
  // "Steps" genuinely appears twice; the converter puts real content in the
  // FIRST occurrence only — keep that one.
  header.forEach((h, i) => {
    if (!(h in idx)) idx[h] = i;
  });
  const get = (r: string[], name: string): string => {
    const i = idx[name];
    return i === undefined ? '' : r[i] ?? '';
  };
  return rows.slice(1).map((r) => ({
    title: get(r, 'Title'),
    preconditions: get(r, 'Preconditions'),
    priority: get(r, 'Priority') || 'Medium',
    sectionHierarchy: get(r, 'Section Hierarchy'),
    steps: get(r, 'Steps'),
    stepsExpected: get(r, 'Steps (Expected Result)'),
    labels: get(r, 'Labels'),
    type: get(r, 'Type') || 'Regression',
  }));
}

function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function parseStepsHtml(html: string): string[] {
  if (!html) return [];
  return [...html.matchAll(/<li>(?:\d+\.\s*)?([\s\S]*?)<\/li>/g)].map((m) =>
    unescapeHtml(m[1] ?? '').trim(),
  );
}

function parseExpectedLines(text: string): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean);
}

/** One TestRail-ready case: TC id + title (for the diff/report) plus everything
 *  add_case needs, built straight from the generated CSV row. */
export interface CaseDescriptor {
  tcId: string;
  title: string;
  preconditions: string;
  priority: string;
  type: string;
  labels: string[];
  sectionHierarchy: string;
  customSteps: TestRailStep[];
  sourceFile: string;
}

function buildCaseDescriptor(
  tcId: string,
  xlsxTitle: string,
  csvRow: CsvRow,
  relXlsxPath: string,
): CaseDescriptor {
  const steps = parseStepsHtml(csvRow.steps);
  const expecteds = parseExpectedLines(csvRow.stepsExpected);
  const n = Math.max(steps.length, expecteds.length, 1);
  const customSteps: TestRailStep[] = [];
  for (let i = 0; i < n; i++) {
    customSteps.push({ content: steps[i] || '(no step text)', expected: expecteds[i] || '' });
  }
  return {
    tcId,
    title: csvRow.title || xlsxTitle,
    preconditions: csvRow.preconditions,
    priority: csvRow.priority,
    type: csvRow.type,
    labels: csvRow.labels
      ? csvRow.labels.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    sectionHierarchy: csvRow.sectionHierarchy,
    customSteps,
    sourceFile: relXlsxPath,
  };
}

/** Walks testcases/**\/*.xlsx, zips each workbook's rows (ascending TC-id order —
 *  guaranteed by the Step 2 gate) with its paired CSV's rows in the same order,
 *  and returns every case plus which ones are missing from case-map.json. */
export function collectCases(caseMap: Map<string, number>): { all: CaseDescriptor[]; newCases: CaseDescriptor[] } {
  const all: CaseDescriptor[] = [];
  for (const xlsxPath of walk(TESTCASES_DIR, '.xlsx').sort()) {
    const base = path.parse(xlsxPath).name;
    if (SKIP_BASENAMES.has(base)) continue;
    if (ONLY && !base.includes(ONLY)) continue;

    const relXlsx = path.relative(TESTCASES_DIR, xlsxPath);
    const csvPath = path.join(TESTRAIL_IMPORT_DIR, relXlsx.replace(/\.xlsx$/, '.csv'));
    if (!fs.existsSync(csvPath)) {
      throw new Error(
        `No TestRail CSV for ${relXlsx} — Step 1/2 should have produced/caught this; aborting.`,
      );
    }

    const xlsxCases = readWorkbookCases(xlsxPath);
    const csvRows = readCsvRows(csvPath);
    if (xlsxCases.length !== csvRows.length) {
      throw new Error(
        `${relXlsx}: ${xlsxCases.length} workbook case(s) but ${csvRows.length} CSV row(s) — ` +
          'the alignment gate should have caught this; aborting rather than guessing the pairing.',
      );
    }

    for (let i = 0; i < xlsxCases.length; i++) {
      const wCase = xlsxCases[i];
      const csvRow = csvRows[i];
      if (!wCase || !csvRow) continue;
      all.push(buildCaseDescriptor(wCase.tcId, wCase.title, csvRow, relXlsx));
    }
  }
  const newCases = all.filter((c) => !caseMap.has(c.tcId));
  return { all, newCases };
}

// ------------------------------------------------------- config/testrail/case-map.json
export function loadCaseMap(): Map<string, number> {
  try {
    const raw = JSON.parse(fs.readFileSync(CASE_MAP_PATH, 'utf8')) as Record<string, unknown>;
    return new Map(Object.entries(raw).filter((entry): entry is [string, number] => Number.isInteger(entry[1])));
  } catch {
    return new Map();
  }
}

function writeCaseMap(caseMap: Map<string, number>, created: Map<string, number>): void {
  const merged = new Map(caseMap);
  for (const [tcId, caseId] of created) merged.set(tcId, caseId);
  const sorted = Object.fromEntries([...merged.entries()].sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(CASE_MAP_PATH), { recursive: true });
  fs.writeFileSync(CASE_MAP_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export function buildClientFromEnv(): { client: TestRailClient; projectId: number; suiteId?: number } {
  const required = ['TESTRAIL_HOST', 'TESTRAIL_USERNAME', 'TESTRAIL_API_KEY', 'TESTRAIL_PROJECT_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing TestRail env var(s): ${missing.join(', ')} — copy .env.testrail.example into .env.local ` +
        'and fill them in (see README.md "TestRail integration").',
    );
  }
  const client = new TestRailClient(process.env.TESTRAIL_HOST!, process.env.TESTRAIL_USERNAME!, process.env.TESTRAIL_API_KEY!);
  const projectId = Number(process.env.TESTRAIL_PROJECT_ID);
  const suiteId = process.env.TESTRAIL_SUITE_ID ? Number(process.env.TESTRAIL_SUITE_ID) : undefined;
  return { client, projectId, suiteId };
}

async function pingTestRail(client: TestRailClient, projectId: number): Promise<void> {
  const project = await client.getProject(projectId);
  console.log(`  connected to ${(client as unknown as { base: string }).base} — project ${projectId}: "${project.name}"`);
}

// ------------------------------------------------------- import (execute mode only)
interface SectionCache {
  sections: Map<string, number>;
  allSections?: TestRailSection[];
}

async function resolveSectionId(
  client: TestRailClient,
  projectId: number,
  suiteId: number | undefined,
  hierarchy: string,
  cache: SectionCache,
): Promise<number> {
  const key = hierarchy || '(none)';
  const cached = cache.sections.get(key);
  if (cached !== undefined) return cached;

  if (!cache.allSections) cache.allSections = await client.getSections(projectId, suiteId);
  const parts = (hierarchy || 'Uncategorized').split('>').map((s) => s.trim()).filter(Boolean);

  let parentId: number | null = null;
  for (const name of parts) {
    let found = cache.allSections.find(
      (s) => (s.parent_id ?? null) === parentId && s.name.toLowerCase() === name.toLowerCase(),
    );
    if (!found) {
      found = await client.addSection(projectId, { name, suite_id: suiteId, parent_id: parentId });
      cache.allSections.push(found);
    }
    parentId = found.id;
  }
  cache.sections.set(key, parentId!);
  return parentId!;
}

export interface LabelCache {
  labels?: TestRailLabel[];
  labelsUnsupported?: boolean;
}

export async function resolveLabelIds(
  client: TestRailClient,
  projectId: number,
  titles: string[],
  cache: LabelCache,
): Promise<number[] | undefined> {
  if (!titles.length) return undefined;
  if (cache.labelsUnsupported) return undefined;
  if (!cache.labels) {
    const labels = await client.getLabels(projectId);
    if (labels === null) {
      cache.labelsUnsupported = true;
      console.warn('  [labels] not supported on this TestRail instance/version — cases will import without labels.');
      return undefined;
    }
    cache.labels = labels;
  }

  const ids: number[] = [];
  for (const title of titles) {
    let found = cache.labels.find((l) => l.name.toLowerCase() === title.toLowerCase());
    if (!found) {
      try {
        found = await client.addLabel(projectId, title);
        cache.labels.push(found);
      } catch (e) {
        console.warn(`  [labels] could not create label "${title}": ${(e as Error).message}`);
        continue;
      }
    }
    ids.push(found.id);
  }
  return ids.length ? ids : undefined;
}

interface ImportOutcome {
  created: Map<string, number>;
  failed: { tcId: string; title: string; error: string }[];
}

async function importCases(
  client: TestRailClient,
  projectId: number,
  suiteId: number | undefined,
  newCases: CaseDescriptor[],
): Promise<ImportOutcome> {
  const sectionCache: SectionCache = { sections: new Map() };
  const labelCache: LabelCache = {};

  const [priorities, caseTypes, templates] = await Promise.all([
    client.getPriorities().catch((): TestRailNamedRef[] => []),
    client.getCaseTypes().catch((): TestRailNamedRef[] => []),
    client.getTemplates(projectId).catch((): TestRailNamedRef[] => []),
  ]);
  const findByName = (list: TestRailNamedRef[], name: string): TestRailNamedRef | undefined =>
    list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const stepsTemplate = findByName(templates, 'Test Case (Steps)');
  if (!stepsTemplate) {
    console.warn('  [template] "Test Case (Steps)" template not found — cases will use the project default template.');
  }

  const created = new Map<string, number>();
  const failed: ImportOutcome['failed'] = [];
  for (const c of newCases) {
    try {
      const sectionId = await resolveSectionId(client, projectId, suiteId, c.sectionHierarchy, sectionCache);
      const priority = findByName(priorities, c.priority);
      const type = findByName(caseTypes, c.type);
      const labelIds = await resolveLabelIds(client, projectId, c.labels, labelCache);

      const payload: TestRailNewCase = { title: c.title, custom_steps_separated: c.customSteps };
      if (stepsTemplate) payload.template_id = stepsTemplate.id;
      if (priority) payload.priority_id = priority.id;
      if (type) payload.type_id = type.id;
      if (c.preconditions) payload.custom_preconds = c.preconditions;
      if (labelIds) payload.labels = labelIds;

      const result = await client.addCase(sectionId, payload);
      created.set(c.tcId, result.id);
      console.log(`  + ${c.tcId} -> C${result.id}  ${c.title}`);
    } catch (e) {
      failed.push({ tcId: c.tcId, title: c.title, error: (e as Error).message });
      console.warn(`  ! ${c.tcId} FAILED: ${(e as Error).message}`);
    }
  }
  return { created, failed };
}

// ------------------------------------------------------- spec cross-reference report
export interface SpecLocation {
  file: string;
  line: number;
}

interface PlaywrightListSpec {
  title: string;
  file: string;
  line: number;
}

interface PlaywrightListSuite {
  specs?: PlaywrightListSpec[];
  suites?: PlaywrightListSuite[];
}

export function loadSpecLocations(): Map<string, SpecLocation> {
  try {
    const raw = execFileSync(
      process.execPath,
      [require.resolve('@playwright/test/cli'), 'test', '--config=playwright.config.ts', '--list', '--reporter=json'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const json = JSON.parse(raw.slice(raw.indexOf('{'))) as { suites?: PlaywrightListSuite[] };
    const byId = new Map<string, SpecLocation>();
    (function visit(suites?: PlaywrightListSuite[]) {
      for (const suite of suites ?? []) {
        for (const spec of suite.specs ?? []) {
          const m = /^(TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+):/.exec(spec.title);
          if (m?.[1] && !byId.has(m[1])) {
            byId.set(m[1], { file: path.relative(ROOT, spec.file).replace(/\\/g, '/'), line: spec.line });
          }
        }
        visit(suite.suites);
      }
    })(json.suites);
    return byId;
  } catch {
    return new Map(); // best-effort — never block the import over this
  }
}

function writeImportReport(
  created: Map<string, number>,
  failed: ImportOutcome['failed'],
  specLocations: Map<string, SpecLocation>,
): void {
  const entries = [...created.entries()].map(([tcId, caseId]) => ({
    tcId,
    caseId,
    spec: specLocations.get(tcId) ?? null,
  }));
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    `${JSON.stringify({ importedAt: new Date().toISOString(), imported: entries, failed }, null, 2)}\n`,
    'utf8',
  );
  console.log(`  report -> ${path.relative(ROOT, REPORT_PATH).replace(/\\/g, '/')}`);
}

/** Tags each newly created case's test() call with `{ tag: '@C<id>' }` — the
 *  same convention tests/corporate-pricing/*.spec.ts already uses (README.md
 *  "How tests map to TestRail cases", strategy 1: explicit id). Runs once per
 *  case, right when its TestRail id first becomes known; a case already in
 *  case-map.json before this run is never re-touched. Best-effort per line —
 *  a spec line that doesn't look exactly as expected is skipped and reported,
 *  never guessed at. */
export function tagSpecFiles(
  created: Map<string, number>,
  specLocations: Map<string, SpecLocation>,
): { tagged: string[]; skipped: { tcId: string; reason: string }[] } {
  const tagged: string[] = [];
  const skipped: { tcId: string; reason: string }[] = [];

  const byFile = new Map<string, { tcId: string; caseId: number; line: number }[]>();
  for (const [tcId, caseId] of created) {
    const loc = specLocations.get(tcId);
    if (!loc) {
      skipped.push({ tcId, reason: 'spec location not found (playwright --list did not report it)' });
      continue;
    }
    if (!byFile.has(loc.file)) byFile.set(loc.file, []);
    byFile.get(loc.file)!.push({ tcId, caseId, line: loc.line });
  }

  const JOIN = "', async (";
  for (const [relFile, entries] of byFile) {
    const absFile = path.join(ROOT, relFile);
    const lines = fs.readFileSync(absFile, 'utf8').split('\n');
    let changed = false;
    for (const { tcId, caseId, line } of entries) {
      const idx = line - 1;
      const text = lines[idx];
      if (text === undefined || !text.includes(`'${tcId}:`)) {
        skipped.push({ tcId, reason: `${relFile}:${line} does not contain the expected test title` });
        continue;
      }
      if (text.includes('{ tag:')) {
        skipped.push({ tcId, reason: `${relFile}:${line} already has a tag option — left untouched` });
        continue;
      }
      const joinIdx = text.lastIndexOf(JOIN);
      if (joinIdx === -1) {
        skipped.push({ tcId, reason: `${relFile}:${line} doesn't match the expected "', async (" test() shape` });
        continue;
      }
      lines[idx] = `${text.slice(0, joinIdx)}', { tag: '@C${caseId}' }, async (${text.slice(joinIdx + JOIN.length)}`;
      changed = true;
      tagged.push(tcId);
    }
    if (changed) fs.writeFileSync(absFile, lines.join('\n'), 'utf8');
  }
  return { tagged, skipped };
}

// ------------------------------------------------------------------------- main
function printPlan(newCases: CaseDescriptor[], totalCases: number, alreadyMapped: number): void {
  console.log(`  ${totalCases} test case(s) across the CSVs, ${alreadyMapped} already mapped in case-map.json`);
  if (newCases.length === 0) {
    console.log('  0 new case(s) to import — everything is already synced.');
    return;
  }
  console.log(`  ${newCases.length} new case(s) that would be imported:`);
  const byFile = new Map<string, CaseDescriptor[]>();
  for (const c of newCases) {
    if (!byFile.has(c.sourceFile)) byFile.set(c.sourceFile, []);
    byFile.get(c.sourceFile)!.push(c);
  }
  for (const [file, cases] of byFile) {
    console.log(`    ${file} (${cases.length})`);
    for (const c of cases) console.log(`      ${c.tcId}: ${c.title}`);
  }
}

async function main(): Promise<void> {
  regenerateCsvs();
  runAlignmentGates();

  section('Step 3/5 — diff testcases-testrail-import against config/testrail/case-map.json');
  const caseMap = loadCaseMap();
  const { all, newCases } = collectCases(caseMap);
  printPlan(newCases, all.length, caseMap.size);

  section(EXECUTE ? 'Connecting to TestRail' : 'Step 5/5 — dry run: TestRail connectivity check only');
  const { client, projectId, suiteId } = buildClientFromEnv();
  await pingTestRail(client, projectId);

  if (!EXECUTE) {
    console.log('\nDry run complete — no TestRail cases were created and case-map.json was not modified.');
    console.log('Re-run with --execute to import the case(s) listed above.');
    return;
  }

  if (newCases.length === 0) {
    console.log('\nNothing to import — every TC id already has a TestRail case in config/testrail/case-map.json.');
    return;
  }

  section('Step 3/5 — importing new cases into TestRail');
  const { created, failed } = await importCases(client, projectId, suiteId, newCases);

  if (created.size > 0) {
    section('Step 4/5 — writing case ids back into config/testrail/case-map.json and spec files');
    writeCaseMap(caseMap, created);
    const specLocations = loadSpecLocations();
    writeImportReport(created, failed, specLocations);

    const { tagged, skipped } = tagSpecFiles(created, specLocations);
    if (tagged.length) console.log(`  tagged ${tagged.length} test(s) with { tag: '@C<id>' } in their spec file`);
    if (skipped.length) {
      console.warn(`  ${skipped.length} case(s) not tagged in their spec (case-map.json still has them):`);
      for (const s of skipped) console.warn(`    ${s.tcId}: ${s.reason}`);
    }
  }

  console.log(
    `\nDone: ${created.size} case(s) imported, ${failed.length} failed` +
      (failed.length ? ' (see warnings above — re-run to retry just those, already-created ones are skipped).' : '.'),
  );
  if (failed.length) process.exitCode = 1;
}

// Guarded so other scripts (e.g. scripts/testrail-backfill-labels.ts) can import
// this module's helpers without triggering the sync pipeline as a side effect.
if (require.main === module) {
  main().catch((e: Error) => {
    console.error(`\n[testrail-sync] FAILED: ${e.message}`);
    process.exit(1);
  });
}
