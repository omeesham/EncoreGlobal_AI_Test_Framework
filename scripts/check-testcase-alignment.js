#!/usr/bin/env node
// Three-way alignment guard: Playwright specs -> testcases/*.xlsx -> testcases-testrail-import/*.csv.
// Specs are the source of truth; a workbook Title must equal the spec title minus its "TC-ID: " prefix.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const TESTCASES = path.join(ROOT, 'testcases');
const TESTRAIL = path.join(ROOT, 'testcases-testrail-import');
const ID_TITLE_RE = /^(TC-[A-Z]+-[A-Z0-9]+-(\d+)):\s*([\s\S]*)$/;

// Aggregate workbooks mirror the per-module ones and have no paired CSV.
const AGGREGATE = new Set(['encore_test_cases.xlsx']);
// Not a test-case workbook.
const IGNORED = new Set(['encore-qa-tracker.xlsx']);

const problems = [];
const warnings = [];
const notes = [];
function problem(kind, file, message) {
  problems.push({ kind, file, message });
}

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
// Titles are authored in two places; ignore only whitespace shape, never wording.
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- specs (via Playwright's own resolution)
// Data-driven titles are built from template literals, so only Playwright reports the real ones.
function loadSpecs() {
  // Run the CLI through node: on Windows, spawning playwright.cmd directly fails with EINVAL.
  const raw = execFileSync(
    process.execPath,
    [require.resolve('@playwright/test/cli'), 'test', '--config=playwright.config.ts', '--list', '--reporter=json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const json = JSON.parse(raw.slice(raw.indexOf('{')));

  const byFile = new Map();
  const seenId = new Map();
  (function visit(suites) {
    for (const suite of suites || []) {
      for (const spec of suite.specs || []) {
        const m = ID_TITLE_RE.exec(spec.title);
        if (!m) continue;
        const file = spec.file;
        if (!byFile.has(file)) byFile.set(file, []);
        // Playwright emits one spec per project; dedupe so multi-project specs count once.
        const key = file + '::' + m[1];
        if (seenId.has(key)) continue;
        seenId.set(key, true);
        byFile.get(file).push({ id: m[1], num: parseInt(m[2], 10), title: m[3], line: spec.line, file });
      }
      visit(suite.suites);
    }
  })(json.suites);

  // Kept in Playwright's registration order, not sorted by line: a test registered
  // from a shared helper reports the helper's line, not its call site.
  return byFile;
}

// ---------------------------------------------------------------- workbooks
function loadWorkbook(file) {
  const wb = XLSX.readFile(file);
  const sheets = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const header = rows[0] || [];
    const idCol = header.indexOf('TC ID');
    if (idCol === -1) continue;
    const titleCol = header.indexOf('Title');
    const covCol = header.indexOf('Coverage Status');
    const cases = [];
    for (let r = 1; r < rows.length; r++) {
      const id = String(rows[r][idCol] || '').trim();
      if (!/^TC-[A-Z]+-[A-Z0-9]+-\d+$/.test(id)) continue;
      cases.push({
        id,
        num: parseInt(id.slice(id.lastIndexOf('-') + 1), 10),
        title: String(rows[r][titleCol] ?? ''),
        coverage: String(rows[r][covCol] ?? '').trim(),
        row: r + 1,
      });
    }
    if (cases.length) sheets.push({ name, cases });
  }
  return sheets;
}

// ---------------------------------------------------------------- CSV (RFC 4180)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') continue;
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || norm(r[0]));
}

function loadCsv(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const header = rows[0] || [];
  const titleCol = header.indexOf('Title');
  const autoCol = header.indexOf('Automation Type');
  if (titleCol === -1) return null;
  return rows.slice(1).map((r, i) => ({
    title: r[titleCol] ?? '',
    automation: (r[autoCol] ?? '').trim(),
    row: i + 2,
  }));
}

// ================================================================ run the checks
const specsByFile = loadSpecs();
const workbookFiles = walk(TESTCASES, '.xlsx').filter((f) => !IGNORED.has(path.basename(f)));

/** TC id -> {title, coverage, file, sheet, row} from the per-module workbooks */
const caseById = new Map();

for (const file of workbookFiles) {
  const isAggregate = AGGREGATE.has(path.basename(file));
  for (const sheet of loadWorkbook(file)) {
    // 1. Workbook rows must be in ascending TC-id order.
    for (let i = 1; i < sheet.cases.length; i++) {
      const prev = sheet.cases[i - 1];
      const cur = sheet.cases[i];
      if (cur.num <= prev.num) {
        problem('order', `${rel(file)} [${sheet.name}]`,
          `row ${cur.row} ${cur.id} follows ${prev.id} (row ${prev.row}) — rows must ascend by TC id`);
      }
    }
    if (isAggregate) continue;
    for (const c of sheet.cases) {
      const existing = caseById.get(c.id);
      if (existing) {
        problem('duplicate', rel(file),
          `${c.id} also defined in ${existing.file} — a TC id must live in exactly one workbook`);
        continue;
      }
      caseById.set(c.id, { ...c, file: rel(file), sheet: sheet.name });
    }
  }
}

// 2. Aggregate workbook must mirror the per-module titles exactly.
for (const file of workbookFiles.filter((f) => AGGREGATE.has(path.basename(f)))) {
  const inAggregate = new Set();
  for (const sheet of loadWorkbook(file)) {
    for (const c of sheet.cases) {
      inAggregate.add(c.id);
      const master = caseById.get(c.id);
      if (!master) {
        problem('aggregate-orphan', `${rel(file)} [${sheet.name}]`,
          `row ${c.row} ${c.id} has no matching row in any per-module workbook`);
      } else if (norm(master.title) !== norm(c.title)) {
        problem('aggregate-title', `${rel(file)} [${sheet.name}]`,
          `row ${c.row} ${c.id} title differs from ${master.file}\n      aggregate: ${norm(c.title)}\n      module:    ${norm(master.title)}`);
      }
    }
  }
  // The aggregate is a convenience roll-up, not the chain of truth — an
  // incomplete one is worth reporting but does not fail the check.
  const absent = [...caseById.keys()].filter((id) => !inAggregate.has(id));
  if (absent.length) {
    const families = [...new Set(absent.map((id) => id.slice(0, id.lastIndexOf('-'))))];
    warnings.push(`${rel(file)} is missing ${absent.length} cases (${families.join(', ')}) — regenerate it to include every module`);
  }
}

// 3. Specs: ascending order, and titles matching their workbook row.
const specIds = new Set();
for (const [file, tests] of [...specsByFile].sort()) {
  for (let i = 1; i < tests.length; i++) {
    if (tests[i].num <= tests[i - 1].num) {
      problem('order', file,
        `${tests[i].id} (line ${tests[i].line}) is registered after ${tests[i - 1].id} — tests must ascend by TC id`);
    }
  }
  for (const t of tests) {
    specIds.add(t.id);
    const c = caseById.get(t.id);
    if (!c) {
      problem('missing-case', file, `line ${t.line} ${t.id} has no row in any testcases workbook`);
      continue;
    }
    if (norm(c.title) !== norm(t.title)) {
      problem('title', file,
        `line ${t.line} ${t.id} title differs from ${c.file} row ${c.row}\n      spec:     ${norm(t.title)}\n      workbook: ${norm(c.title)}`);
    }
  }
}

// 4. Workbook rows marked Automated must have a spec; the rest are manual by design.
let manualCount = 0;
for (const [id, c] of caseById) {
  if (specIds.has(id)) continue;
  if (/^automated$/i.test(c.coverage)) {
    problem('missing-spec', c.file, `row ${c.row} ${id} is marked Automated but no spec implements it`);
  } else {
    manualCount++;
  }
}

// 5. Each workbook pairs with one TestRail CSV of the same relative path: same
//    row count, same titles, same order.
const pairedCsv = new Set();
for (const file of workbookFiles) {
  if (AGGREGATE.has(path.basename(file))) continue;
  const csvPath = path.join(TESTRAIL, path.relative(TESTCASES, file).replace(/\.xlsx$/, '.csv'));
  const cases = loadWorkbook(file).flatMap((s) => s.cases);
  if (!fs.existsSync(csvPath)) {
    problem('missing-csv', rel(file), `no TestRail CSV at ${rel(csvPath)} — run scripts/convert-testcases-to-testrail.py`);
    continue;
  }
  pairedCsv.add(path.resolve(csvPath));
  const csv = loadCsv(csvPath);
  if (!csv) {
    problem('csv-format', rel(csvPath), 'no "Title" column in the header row');
    continue;
  }
  if (csv.length !== cases.length) {
    problem('csv-count', rel(csvPath),
      `${csv.length} rows but ${rel(file)} has ${cases.length} test cases — regenerate the CSVs`);
  }
  for (let i = 0; i < Math.min(csv.length, cases.length); i++) {
    if (norm(csv[i].title) !== norm(cases[i].title)) {
      problem('csv-title', rel(csvPath),
        `row ${csv[i].row} does not match ${cases[i].id} (${rel(file)} row ${cases[i].row})\n      csv:      ${norm(csv[i].title)}\n      workbook: ${norm(cases[i].title)}`);
      break; // one report per file; a single insertion shifts every later row
    }
    const expected = /^automated$/i.test(cases[i].coverage) ? 'Automated' : 'Manual';
    if (csv[i].automation && csv[i].automation !== expected) {
      problem('csv-automation', rel(csvPath),
        `row ${csv[i].row} ${cases[i].id} is "${csv[i].automation}" but the workbook says ${cases[i].coverage || '(blank)'}`);
    }
  }
}

// 6. CSVs with no source workbook are stale output.
for (const csv of walk(TESTRAIL, '.csv')) {
  if (!pairedCsv.has(path.resolve(csv))) {
    problem('orphan-csv', rel(csv), 'no source workbook in testcases/ — stale generated output');
  }
}

// ================================================================ report
const specTotal = [...specsByFile.values()].reduce((n, l) => n + l.length, 0);
notes.push(`${caseById.size} test cases in ${workbookFiles.length - 1} module workbooks`);
notes.push(`${specTotal} automated specs, ${manualCount} manual-only cases`);
notes.push(`${pairedCsv.size} TestRail CSVs paired`);

if (!problems.length) {
  console.log('[check:alignment] OK — specs, workbooks and TestRail CSVs are aligned.');
  for (const n of notes) console.log('  ' + n);
  for (const w of warnings) console.log('  warning: ' + w);
  process.exit(0);
}

console.error(`[check:alignment] ${problems.length} MISMATCH(ES)\n`);
const byKind = new Map();
for (const p of problems) {
  if (!byKind.has(p.kind)) byKind.set(p.kind, []);
  byKind.get(p.kind).push(p);
}
const LABEL = {
  order: 'Out of TC-id order',
  title: 'Spec title does not match its workbook row',
  duplicate: 'TC id defined in more than one workbook',
  'missing-case': 'Spec references a TC id with no workbook row',
  'missing-spec': 'Workbook row marked Automated with no spec',
  'aggregate-title': 'Aggregate workbook title out of sync with its module workbook',
  'aggregate-orphan': 'Aggregate workbook row with no module workbook row',
  'missing-csv': 'Workbook has no TestRail CSV',
  'csv-count': 'TestRail CSV row count differs from its workbook',
  'csv-title': 'TestRail CSV title/order differs from its workbook',
  'csv-automation': 'TestRail CSV Automation Type contradicts the workbook',
  'csv-format': 'TestRail CSV is malformed',
  'orphan-csv': 'TestRail CSV with no source workbook',
};
for (const [kind, list] of byKind) {
  console.error(`  ${LABEL[kind] ?? kind}  (${list.length})`);
  for (const p of list) console.error(`    ${p.file}\n      ${p.message}`);
  console.error('');
}
for (const n of notes) console.error('  ' + n);
for (const w of warnings) console.error('  warning: ' + w);
process.exit(1);
