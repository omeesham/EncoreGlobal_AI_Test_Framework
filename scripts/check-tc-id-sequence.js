#!/usr/bin/env node
// Guards the TC-id contract: every id family runs 1..N with no gaps, and every
// id a spec references exists as a row in the testcases workbooks.
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const ID_RE = /TC-[A-Z]+-[A-Z0-9]+-\d+/g;
const SPLIT_RE = /^(TC-[A-Z]+-[A-Z0-9]+)-(\d+)$/;

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const errors = [];
/** prefix -> Set<number> across every workbook (aggregate workbooks repeat ids by design) */
const workbookIds = new Map();

for (const file of walk(path.join(ROOT, 'testcases'), '.xlsx')) {
  const rel = path.relative(ROOT, file);
  const wb = XLSX.readFile(file);
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const idCol = (rows[0] || []).indexOf('TC ID');
    if (idCol === -1) continue;

    const seenInSheet = new Map();
    for (let r = 1; r < rows.length; r++) {
      const id = String(rows[r][idCol] || '').trim();
      const m = SPLIT_RE.exec(id);
      if (!m) continue;
      if (seenInSheet.has(id)) {
        errors.push(`${rel} [${sheetName}]: duplicate ${id} (rows ${seenInSheet.get(id)} and ${r + 1})`);
      }
      seenInSheet.set(id, r + 1);
      if (!workbookIds.has(m[1])) workbookIds.set(m[1], new Set());
      workbookIds.get(m[1]).add(parseInt(m[2], 10));
    }
  }
}

/** prefix -> Map<number, first spec file that used it> */
const specIds = new Map();
for (const file of walk(path.join(ROOT, 'tests'), '.ts')) {
  const rel = path.relative(ROOT, file);
  for (const id of fs.readFileSync(file, 'utf8').match(ID_RE) || []) {
    const m = SPLIT_RE.exec(id);
    if (!m) continue;
    if (!specIds.has(m[1])) specIds.set(m[1], new Map());
    if (!specIds.get(m[1]).has(parseInt(m[2], 10))) specIds.get(m[1]).set(parseInt(m[2], 10), rel);
  }
}

for (const prefix of [...workbookIds.keys()].sort()) {
  const nums = [...workbookIds.get(prefix)].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i <= nums[nums.length - 1]; i++) if (!workbookIds.get(prefix).has(i)) gaps.push(i);
  if (gaps.length) {
    errors.push(
      `${prefix}: ids are not sequential — ${nums.length} cases but highest is ` +
        `${nums[nums.length - 1]}; missing ${gaps.map((n) => String(n).padStart(3, '0')).join(', ')}`
    );
  }
}

// A spec id with no workbook row means the workbook was not re-synced.
for (const [prefix, used] of specIds) {
  for (const [num, rel] of used) {
    if (!workbookIds.get(prefix)?.has(num)) {
      errors.push(`${rel}: ${prefix}-${String(num).padStart(3, '0')} has no row in testcases/**/*.xlsx`);
    }
  }
}

if (errors.length) {
  console.error('[check:tc-ids] FAILED\n');
  for (const e of errors) console.error('  ' + e);
  console.error(`\n${errors.length} problem(s). TC ids must be contiguous from 001 within each family.`);
  process.exit(1);
}

const total = [...workbookIds.values()].reduce((n, s) => n + s.size, 0);
console.log(`[check:tc-ids] OK — ${total} test cases across ${workbookIds.size} id families, all sequential.`);
