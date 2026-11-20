/**
 * Duplicate Test Detector — the same test written twice, in specs and in the test-case workbooks.
 *
 * Specs (tests/**\/*.spec.ts):
 *   duplicate-tc-id          High    one TC id declared by two test() calls (a loop over offices is ONE declaration)
 *   duplicate-title          Medium  two tests in one module with the same scenario title under different ids
 *   duplicate-script         Medium  two tests with the same body, token for token
 *   parameterizable-script   Low     same body shape, only literals differ — one data-driven test would do
 *   similar-title            Low     titles ≥ 80 % alike within one module
 * Workbooks (testcases/**\/*.xlsx, the standard "TC ID | Title | … | Steps (Step) | Steps (Expected Result)" sheet):
 *   duplicate-tc-id          High    one TC id on two rows
 *   duplicate-steps          Medium  two cases with identical steps and expected results
 *   duplicate-title          Medium  two cases with the same title in one workbook
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as XLSX from 'xlsx';
import { collectFiles, isSpec, rel } from '../core/files';
import { findTests, lineOf } from '../core/ts-ast';
import type { Finding, Severity, ToolkitOptions, Utility, UtilityResult } from '../core/types';

const UTILITY = 'duplicates';
const DEFAULT_PATHS = ['tests', 'testcases'];
const MIN_TOKENS = 30;
const SIMILAR_TITLE = 0.8;

const RECOMMEND: Record<string, string> = {
  'duplicate-tc-id': 'Give each case its own TC id (the next free number); TestRail mapping and the reports resolve results by id.',
  'duplicate-title': 'Merge the two cases, or rename one so the titles say how the scenarios differ.',
  'duplicate-script': 'Delete one test, or make them differ in what they verify; identical scripts double the run time for no extra coverage.',
  'parameterizable-script': 'Turn the tests into one data-driven loop (for (const c of CASES) test(`${c.id}: …`)) with the differing values in a table.',
  'similar-title': 'Check whether both cases are needed; if they are, make the difference explicit in the titles.',
  'duplicate-steps': 'Merge the cases, or change the steps / expected results so each case tests something distinct.',
};

const TC_ID = /\b([A-Z]{2,}(?:-[A-Z0-9]+)*-\d{3,})\b/;

export interface SpecTest { id?: string; title: string; scenario: string; file: string; line: number; exact: string; shape: string; tokens: number; module: string }
export interface WorkbookCase { id: string; title: string; file: string; row: number; steps: string }

/** Scenario part of a title: without its TC id, lower-case, punctuation folded. */
export function scenarioOf(title: string): string {
  return title.replace(/^\s*[A-Z]{2,}(?:-[A-Z0-9]+)*-\d{3,}\s*[:\-–]?\s*/, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

/** Token streams of a function body: exact (comments/whitespace dropped) and shape (literals → §). */
export function bodyKeys(fn: ts.Node, sf: ts.SourceFile): { exact: string; shape: string; tokens: number } {
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, sf.text.slice(fn.getStart(sf), fn.getEnd()));
  const exact: string[] = [];
  const shape: string[] = [];
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    const text = scanner.getTokenText();
    exact.push(text);
    const literal = k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NumericLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral
      || k === ts.SyntaxKind.TemplateHead || k === ts.SyntaxKind.TemplateMiddle || k === ts.SyntaxKind.TemplateTail;
    shape.push(literal ? '§' : text);
  }
  return { exact: exact.join(' '), shape: shape.join(' '), tokens: exact.length };
}

function words(s: string): Set<string> {
  return new Set(s.split(' ').filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

export function readSpecTests(root: string, files: string[]): SpecTest[] {
  const out: SpecTest[] = [];
  for (const abs of files) {
    const sf = ts.createSourceFile(abs, fs.readFileSync(abs, 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const file = rel(root, abs);
    for (const t of findTests(sf)) {
      const id = /\$\{/.test(t.title.split(':')[0] ?? '') ? undefined : t.title.match(TC_ID)?.[1];
      out.push({ ...(id ? { id } : {}), title: t.title, scenario: scenarioOf(t.title), file, line: lineOf(sf, t.call),
        // The page under test: the TC id prefix (TC-TAX-IST), or the file when the title has no id.
        module: id ? id.replace(/-\d+$/, '') : file, ...bodyKeys(t.body.body, sf) });
    }
  }
  return out;
}

/** Cases of the standard test-case sheet; a case's steps continue on the rows below its TC id. */
export function readWorkbookCases(root: string, files: string[]): { cases: WorkbookCase[]; skipped: string[] } {
  const cases: WorkbookCase[] = [];
  const skipped: string[] = [];
  for (const abs of files) {
    const wb = XLSX.readFile(abs);
    let used = false;
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, blankrows: false });
      const h = rows.findIndex((r) => r.some((c) => /^TC ?ID$/i.test(String(c ?? '').trim())));
      if (h < 0) continue;
      used = true;
      const header = rows[h]!.map((c) => String(c ?? '').trim());
      const col = (re: RegExp): number => header.findIndex((c) => re.test(c));
      const [cId, cTitle, cStep, cExp] = [col(/^TC ?ID$/i), col(/^Title$/i), col(/^Steps? ?\(Step\)$|^Steps?$/i), col(/Expected/i)];
      let current: WorkbookCase | undefined;
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i]!;
        const raw = String(r[cId] ?? '').trim();
        if (raw && !TC_ID.test(raw)) { current = undefined; continue; } // SUMMARY / totals rows end the case list
        const id = raw;
        const step = [cStep, cExp].map((c) => (c >= 0 ? String(r[c] ?? '').trim() : '')).filter(Boolean).join(' => ');
        if (id) {
          current = { id, title: String(r[cTitle] ?? '').trim(), file: rel(root, abs), row: i + 1, steps: step };
          cases.push(current);
        } else if (current && step) {
          current.steps += ` | ${step}`;
        }
      }
    }
    if (!used) skipped.push(rel(root, abs));
  }
  return { cases, skipped };
}

/**
 * Roll-up workbooks — generated compilations of many module workbooks. Found in rounds: the workbook whose repeated
 * TC ids come from the most other workbooks (≥ 3, covering ≥ 80 % of its cases) is set aside, then the rest is
 * recounted. A module workbook copied into a roll-up repeats ids from that ONE roll-up only, so it is never taken.
 * Roll-ups repeat by design: they are left out of the duplicate checks and named in the notes.
 */
export function splitRollups(cases: WorkbookCase[]): { kept: WorkbookCase[]; rollups: string[] } {
  let kept = cases;
  const rollups: string[] = [];
  for (;;) {
    const filesOf = new Map<string, Set<string>>();
    for (const c of kept) filesOf.set(c.id, (filesOf.get(c.id) ?? new Set()).add(c.file));
    const byFile = new Map<string, WorkbookCase[]>();
    for (const c of kept) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);
    let best: { file: string; sources: number } | undefined;
    for (const [file, list] of byFile) {
      const shared = list.filter((c) => (filesOf.get(c.id)?.size ?? 0) > 1);
      const sources = new Set(shared.flatMap((c) => [...filesOf.get(c.id)!].filter((f) => f !== file))).size;
      if (list.length >= 10 && shared.length / list.length >= 0.8 && sources >= 3 && (!best || sources > best.sources)) best = { file, sources };
    }
    if (!best) break;
    rollups.push(best.file);
    kept = kept.filter((c) => c.file !== best!.file);
  }
  return { kept, rollups };
}

function groupBy<T>(items: T[], key: (t: T) => string | undefined): T[][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

const where = (x: { file: string; line?: number; row?: number }): string => `${x.file}:${x.line ?? x.row}`;

export function detectDuplicates(specs: SpecTest[], cases: WorkbookCase[]): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, severity: Severity, at: { file: string; line?: number; row?: number }, test: string | undefined, message: string): void => {
    findings.push({ utility: UTILITY, rule, severity, file: at.file, line: at.line ?? at.row ?? 0, message,
      recommendation: RECOMMEND[rule] ?? '', ...(test ? { test } : {}) });
  };
  const others = <T extends { file: string; line?: number; row?: number }>(g: T[]): string => g.slice(1).map(where).join(', ');

  // Specs
  for (const g of groupBy(specs, (s) => s.id)) {
    add('duplicate-tc-id', 'High', g[0]!, g[0]!.title, `${g[0]!.id} is declared by ${g.length} tests; also at ${others(g)}.`);
  }
  // Within one page (TC id prefix) only: generic scenarios ("without a session the page sends the user to sign in")
  // recur across pages on purpose.
  for (const g of groupBy(specs, (s) => (s.scenario.length > 10 ? `${s.module}|${s.scenario}` : undefined))) {
    if (new Set(g.map((s) => s.id ?? s.title)).size < 2) continue;
    add('duplicate-title', 'Medium', g[0]!, g[0]!.title, `"${g[0]!.scenario}" is the scenario of ${g.length} tests: ${g.map((s) => s.id ?? where(s)).join(', ')}.`);
  }
  const big = specs.filter((s) => s.tokens >= MIN_TOKENS);
  const exactGroups = groupBy(big, (s) => s.exact);
  const inExact = new Set(exactGroups.flat());
  for (const g of exactGroups) {
    add('duplicate-script', 'Medium', g[0]!, g[0]!.title, `Same test body (${g[0]!.tokens} tokens) as ${others(g)}.`);
  }
  for (const g of groupBy(big.filter((s) => !inExact.has(s)), (s) => s.shape)) {
    add('parameterizable-script', 'Low', g[0]!, g[0]!.title, `${g.length} tests share one body and differ only in literal values: ${g.map((s) => s.id ?? where(s)).join(', ')}.`);
  }
  // Similar titles are compared within one page (TC id prefix) — across pages, generic wording recurs on purpose.
  for (const group of groupBy(specs, (s) => s.module)) {
    const w = group.map((s) => words(s.scenario));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!, b = group[j]!;
        if (a.scenario === b.scenario || w[i]!.size < 4 || w[j]!.size < 4) continue;
        const sim = jaccard(w[i]!, w[j]!);
        if (sim >= SIMILAR_TITLE) {
          add('similar-title', 'Low', a, a.title, `${Math.round(sim * 100)} % alike: "${a.title}" and "${b.title}" (${where(b)}).`);
        }
      }
    }
  }

  // Workbooks
  for (const g of groupBy(cases, (c) => c.id)) {
    add('duplicate-tc-id', 'High', g[0]!, g[0]!.title, `${g[0]!.id} appears on ${g.length} rows; also at ${others(g)}.`);
  }
  for (const g of groupBy(cases, (c) => (c.steps.split('|').length >= 2 ? c.steps.toLowerCase().replace(/\s+/g, ' ') : undefined))) {
    if (new Set(g.map((c) => c.id)).size < 2) continue;
    add('duplicate-steps', 'Medium', g[0]!, g[0]!.title, `Identical steps and expected results in ${g.map((c) => c.id).join(', ')}.`);
  }
  for (const g of groupBy(cases, (c) => `${c.file}|${scenarioOf(c.title)}`)) {
    if (new Set(g.map((c) => c.id)).size < 2) continue;
    add('duplicate-title', 'Medium', g[0]!, g[0]!.title, `Same title in ${g.map((c) => c.id).join(', ')}.`);
  }
  return findings;
}

export const duplicateDetector: Utility = {
  name: 'duplicates',
  title: 'Duplicate Test Detector',
  summary: 'Duplicate TC ids, titles, scripts and workbook steps; tests that differ only in data.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    const paths = options.paths.length ? options.paths : DEFAULT_PATHS;
    const specFiles = collectFiles(options.root, paths, isSpec);
    const books = collectFiles(options.root, paths, (f) => f.endsWith('.xlsx') && !path.basename(f).startsWith('~$'));
    const missing = [...new Set([...specFiles.missing, ...books.missing])];
    const notes = [`Scope: ${paths.join(', ')}`, ...missing.map((m) => `Path not found, skipped: ${m}`)];
    if (options.dryRun) {
      notes.push(`Dry run: would compare ${specFiles.files.length} spec(s) and ${books.files.length} workbook(s).`);
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true,
        scanned: { specs: specFiles.files.length, workbooks: books.files.length }, findings: [], notes };
    }
    const specs = readSpecTests(options.root, specFiles.files);
    const { cases, skipped } = readWorkbookCases(options.root, books.files);
    const { kept, rollups } = splitRollups(cases);
    if (skipped.length) notes.push(`Workbooks without a "TC ID" sheet, skipped: ${skipped.join(', ')}`);
    if (rollups.length) notes.push(`Roll-up workbook(s) compiled from other workbooks, not checked for duplicates: ${rollups.join(', ')}`);
    return {
      utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: false,
      scanned: { specs: specFiles.files.length, tests: specs.length, workbooks: books.files.length, 'workbook cases': kept.length },
      findings: detectDuplicates(specs, kept), notes,
    };
  },
};

export default duplicateDetector;
