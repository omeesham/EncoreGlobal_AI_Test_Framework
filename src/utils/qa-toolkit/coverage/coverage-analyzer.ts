/**
 * Test Coverage Analyzer — acceptance criteria against the test cases that cover them.
 *
 * Criteria source per workbook (testcases/<module>/<name>.xlsx), first found wins:
 *   1. <name>.acceptance.md — criteria pasted from Jira, one per line: "- AC-01: text", "| AC-01 | text |" or "- text"
 *   2. <name>-test-plan.md  — requirement ids the plan names (TC-TF-01…35 ranges, TC-XX-NN, feature NM tickets);
 *                             no wording, so only traceability and scenario mix are checked
 * A case covers a criterion when its title / steps / expected results / notes cite the criterion id, or — acceptance
 * files only — when it shares most of the criterion's wording (reported so the id can be added).
 *
 * Rules (severity):
 *   uncovered-criterion    High    no case covers it (Medium for a feature ticket; Low when the plan documents why)
 *   missing-positive       Medium  only negative / boundary cases cover it
 *   missing-negative       Medium  the wording restricts input (must, only, invalid, limit…) but no case tries bad input
 *   missing-boundary       Medium  the wording names a number, limit or range but no case tests its edges
 *   positive-only          Low     plan mode: every case for the requirement is a happy path
 *   text-match-only        Low     covered by wording only — cite the id in the case so the trace is explicit
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { collectFiles, rel } from '../core/files';
import type { Finding, Severity, ToolkitOptions, Utility, UtilityResult } from '../core/types';

const UTILITY = 'coverage';

const RECOMMEND: Record<string, string> = {
  'uncovered-criterion': 'Add a test case for the criterion, or record in the plan why it is not automated.',
  'missing-positive': 'Add the happy path: valid input / normal use that the criterion promises works.',
  'missing-negative': 'Add negative cases: the invalid, missing or forbidden input the criterion restricts, and the message or refusal expected.',
  'missing-boundary': 'Add boundary cases: exactly at, just inside and just outside each limit the criterion names.',
  'positive-only': 'Check the requirement for rules it implies (required fields, limits, permissions) and add negative or boundary cases.',
  'text-match-only': 'Cite the criterion id in the case (title or notes) so coverage is traceable and survives rewording.',
};

export type Scenario = 'positive' | 'negative' | 'boundary';
export interface Criterion { id: string; text?: string; documented?: string; feature?: boolean }
export interface CoverageCase { id: string; title: string; text: string }

/** Scenario words, read from the case TITLE only — field names in steps and data ("Tier Boundary") would mislead. */
const NEGATIVE = /\b(refus\w*|reject\w*|invalid|error\w*|not allowed|cannot|can't|fail\w*|denied|blocked|missing|empty|blank|wrong|forbidden|turned away|unauthori[sz]ed|duplicate|negative|letters|symbols|exceed\w*|too (long|many|large|small)|non-?\w+ files?)\b/i;
/** A limit word, a range (0 to 100), a comparison with a number (above 100) or a length (500 characters). */
const BOUNDARY = /(\b(limit\w*|max|maximum|min|minimum|at most|at least|up to|exactly|edge|longest|overflow|day before|day after)\b|\b\d[\d,.]*\s*(to|–|and)\s*\d[\d,.]*\b|\b(above|below|over|under|more than|less than|beyond|exceed\w*)\s+[\d,.]+|\b\d+\s*(characters|chars|digits)\b)/i;
const NEEDS_NEGATIVE = /\b(must|only|required|mandatory|cannot|can't|should not|must not|not allowed|invalid|error|reject\w*|prevent\w*|restrict\w*|validat\w*|between|limit\w*|max\w*|min\w*|allowed|accept\w*|warn\w*|permission\w*)\b/i;
const NEEDS_BOUNDARY = /(\d|\b(max\w*|min\w*|limit\w*|between|at most|at least|up to|range|length|characters|exceed\w*|greater|less|before|after)\b)/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'are', 'is', 'be', 'to', 'of', 'in', 'on', 'a', 'an', 'it', 'its', 'or',
  'when', 'should', 'must', 'can', 'user', 'page', 'from', 'into', 'will', 'shall', 'has', 'have', 'all', 'any', 'each', 'not', 'is']);

/** Requirement ids in a text; "TC-TF-07/10" expands to TC-TF-07 and TC-TF-10. */
export function requirementIds(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(/\b(TC-[A-Z]{1,5})-(\d{1,2}(?:\/\d{1,2})*)(?![\d-])/g)) {
    for (const n of m[2]!.split('/')) ids.push(`${m[1]}-${n.padStart(2, '0')}`);
  }
  for (const m of text.matchAll(/\bNM-\d{3,5}\b/g)) ids.push(m[0]);
  return [...new Set(ids)];
}

export function scenariosOf(c: CoverageCase): Set<Scenario> {
  const s = new Set<Scenario>();
  const title = c.title.replace(/^[A-Z]{2,}(-[A-Z0-9]+)*-\d{3,}:\s*/, '');
  if (NEGATIVE.test(title)) s.add('negative');
  if (BOUNDARY.test(title)) s.add('boundary');
  if (!s.has('negative') || /\b(accept\w*|saves?|shows?|lists?|opens?|succeeds?|valid|loads?|downloads?|returns?|keeps?)\b/i.test(title)) s.add('positive');
  return s;
}

const words = (s: string): Set<string> =>
  new Set(s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, '')));

/** Criteria from an acceptance file: "- AC-01: text", "| AC-01 | text |", "1. text", "- text". */
export function parseAcceptance(md: string): Criterion[] {
  const out: Criterion[] = [];
  let n = 0;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^\|?\s*-{3,}/.test(line) || /^\|\s*id\s*\|/i.test(line)) continue;
    const table = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    const item = line.match(/^(?:[-*]|\d+[.)])\s+(.*)$/);
    const body = table ? `${table[1]}: ${table[2]}` : item?.[1];
    if (!body) continue;
    const m = body.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+)\s*[:—–-]\s*(.+)$/);
    n += 1;
    out.push(m ? { id: m[1]!, text: m[2]!.trim() } : { id: `AC-${String(n).padStart(2, '0')}`, text: body.trim() });
  }
  return out;
}

/** A plan table row that explains why an id has no test. */
const DOCUMENTED = /\b(by design|not applicable|n\/a|out of scope|not in scope|descoped|dropped|not automated|manual only|won't fix)\b/i;

/** Ids on one plan line: ranges ("TC-TF-01…35", "TC-ST-31..33") expanded, plus single ids. */
function lineIds(line: string): string[] {
  const ids: string[] = [];
  for (const m of line.matchAll(/\b(TC-[A-Z]{1,5})-(\d{1,2})\s*(?:…|\.\.\.?)\s*(\d{1,2})\b/g)) {
    for (let k = Number(m[2]); k <= Number(m[3]); k++) ids.push(`${m[1]}-${String(k).padStart(2, '0')}`);
  }
  return [...new Set([...ids, ...requirementIds(line.replace(/\b(parent|epic)\s+NM-\d+/gi, ''))])];
}

/** Requirement ids a test plan names, with the ones the plan explains (not automated, by design, not applicable…). */
export function parsePlan(md: string): Criterion[] {
  const lines = md.split(/\r?\n/);
  const documented = new Map<string, string>();
  let inNotAutomated = false;
  const found = new Map<string, Criterion>();
  // The title names the plan's own ticket — it is the subject, not a requirement, wherever it appears.
  const own = new Set(requirementIds(lines[0] ?? ''));
  for (const [i, line] of lines.entries()) {
    if (/^##\s/.test(line)) inNotAutomated = /not automated/i.test(line);
    if (i === 0) continue;
    const cells = line.startsWith('|') ? line.split('|').map((c) => c.trim()).filter((c) => c && !/^[—–-]+$/.test(c)) : [];
    const reason = cells.length > 1 && (inNotAutomated || DOCUMENTED.test(line)) ? cells.slice(1).join(' — ') : undefined;
    for (const id of lineIds(line)) {
      if (own.has(id)) continue;
      if (!found.has(id)) found.set(id, { id, ...(id.startsWith('NM-') && /features?/i.test(line) ? { feature: true } : {}) });
      if (reason && !documented.has(id)) documented.set(id, reason);
    }
  }
  return [...found.values()].map((c) => (documented.has(c.id) ? { ...c, documented: documented.get(c.id)! } : c));
}

/** Cases of the standard sheet with all their text (title, steps, expected, notes). */
export function readCoverageCases(abs: string): CoverageCase[] {
  const wb = XLSX.readFile(abs);
  const cases: CoverageCase[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, blankrows: false });
    const h = rows.findIndex((r) => r.some((c) => /^TC ?ID$/i.test(String(c ?? '').trim())));
    if (h < 0) continue;
    const header = rows[h]!.map((c) => String(c ?? '').trim());
    const cId = header.findIndex((c) => /^TC ?ID$/i.test(c));
    const cTitle = header.findIndex((c) => /^Title$/i.test(c));
    let current: CoverageCase | undefined;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i]!;
      const id = String(r[cId] ?? '').trim();
      const text = r.map((c) => String(c ?? '')).join(' ');
      if (id && /^[A-Z]{2,}(-[A-Z0-9]+)*-\d{3,}$/.test(id)) {
        current = { id, title: String(r[cTitle] ?? '').trim(), text };
        cases.push(current);
      } else if (id) current = undefined;
      else if (current) current.text += ` ${text}`;
    }
  }
  return cases;
}

export function analyzeCoverage(criteria: Criterion[], cases: CoverageCase[], file: string, mode: 'acceptance' | 'plan'): { findings: Finding[]; covered: number } {
  const findings: Finding[] = [];
  let covered = 0;
  /** Plan mode only: hints without the wording, merged into one line each. */
  const negativeOnly: string[] = [];
  const happyOnly: string[] = [];
  const caseIds = cases.map((c) => new Set(requirementIds(`${c.title} ${c.text}`)));
  const caseWords = cases.map((c) => words(`${c.title} ${c.text}`));
  const add = (rule: string, severity: Severity, c: Criterion, message: string): void => {
    findings.push({ utility: UTILITY, rule, severity, file, line: 0, test: c.id, message, recommendation: RECOMMEND[rule] ?? '' });
  };

  for (const crit of criteria) {
    // Cited by id — a recognised requirement id, or the criterion's own id written anywhere in the case (AC-01, R-7…).
    const own = new RegExp(`(^|[^A-Za-z0-9-])${crit.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d-])`);
    let linked = cases.filter((c, i) => caseIds[i]!.has(crit.id) || own.test(`${c.title} ${c.text}`));
    let byText = false;
    if (!linked.length && crit.text) {
      const cw = words(crit.text);
      linked = cases.filter((_, i) => {
        const shared = [...cw].filter((w) => caseWords[i]!.has(w)).length;
        return shared >= 3 && shared / Math.max(cw.size, 1) >= 0.5;
      });
      byText = linked.length > 0;
    }
    const label = crit.text ? `${crit.id}: ${crit.text}` : crit.id;
    if (!linked.length) {
      if (crit.documented) add('uncovered-criterion', 'Low', crit, `${label} — no case; the plan documents why: ${crit.documented}`);
      else if (crit.feature) add('uncovered-criterion', 'Medium', crit, `${label} — feature ticket with no case citing it directly.`);
      else add('uncovered-criterion', 'High', crit, `${label} — no test case covers it.`);
      continue;
    }
    covered += 1;
    const ids = linked.map((c) => c.id).join(', ');
    if (byText) add('text-match-only', 'Low', crit, `${label} — matched by wording only: ${ids}.`);
    const kinds = new Set(linked.flatMap((c) => [...scenariosOf(c)]));
    if (mode === 'acceptance' && crit.text) {
      if (!kinds.has('positive')) add('missing-positive', 'Medium', crit, `${label} — only negative cases (${ids}).`);
      if (NEEDS_NEGATIVE.test(crit.text) && !kinds.has('negative')) add('missing-negative', 'Medium', crit, `${label} — the rule restricts input, but no case tries invalid input (${ids}).`);
      if (NEEDS_BOUNDARY.test(crit.text) && !kinds.has('boundary')) add('missing-boundary', 'Medium', crit, `${label} — names a limit or value, but no case tests its edges (${ids}).`);
    } else if (!crit.feature) {
      // Without the wording the requirement may itself be a refusal rule, or need no negative case — hints only.
      if (!kinds.has('positive')) negativeOnly.push(crit.id);
      else if (kinds.size === 1) happyOnly.push(crit.id);
    }
  }
  const summary = { id: 'plan', text: '' } as Criterion;
  if (negativeOnly.length) {
    findings.push({ utility: UTILITY, rule: 'missing-positive', severity: 'Low', file, line: 0, test: summary.id,
      message: `${negativeOnly.length} requirement(s) are covered only by refusal/negative cases: ${negativeOnly.join(', ')}. Check whether each also promises a working path.`,
      recommendation: RECOMMEND['missing-positive']! });
  }
  if (happyOnly.length) {
    findings.push({ utility: UTILITY, rule: 'positive-only', severity: 'Low', file, line: 0, test: summary.id,
      message: `${happyOnly.length} requirement(s) are covered only by happy-path cases: ${happyOnly.join(', ')}. Check those that restrict input for missing negative or boundary cases.`,
      recommendation: RECOMMEND['positive-only']! });
  }
  return { findings, covered };
}

export const coverageAnalyzer: Utility = {
  name: 'coverage',
  title: 'Test Coverage Analyzer',
  summary: 'Acceptance criteria (Jira, pasted into <name>.acceptance.md) or plan requirements vs the test cases; missing positive, negative and boundary cases.',
  async run(options: ToolkitOptions): Promise<UtilityResult> {
    const startedAt = new Date().toISOString();
    const paths = options.paths.length ? options.paths : ['testcases'];
    const { files, missing } = collectFiles(options.root, paths, (f) => f.endsWith('.xlsx') && !path.basename(f).startsWith('~$'));
    const notes = [`Scope: ${paths.join(', ')}`, ...missing.map((m) => `Path not found, skipped: ${m}`)];
    const plans = files.map((abs) => {
      const base = abs.replace(/\.xlsx$/, '');
      const acceptance = `${base}.acceptance.md`;
      const plan = `${base}-test-plan.md`;
      return { abs, source: fs.existsSync(acceptance) ? { mode: 'acceptance' as const, file: acceptance }
        : fs.existsSync(plan) ? { mode: 'plan' as const, file: plan } : undefined };
    });
    const withSource = plans.filter((p) => p.source);
    const without = plans.filter((p) => !p.source).map((p) => rel(options.root, p.abs));
    if (without.length) notes.push(`No acceptance file or test plan, not analysed (${without.length}): ${without.slice(0, 12).join(', ')}${without.length > 12 ? ', …' : ''}`);

    if (options.dryRun) {
      for (const p of withSource) notes.push(`Dry run: would compare ${rel(options.root, p.abs)} against ${rel(options.root, p.source!.file)} (${p.source!.mode}).`);
      return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: true,
        scanned: { workbooks: withSource.length }, findings: [], notes };
    }
    const findings: Finding[] = [];
    let criteriaCount = 0, coveredCount = 0, caseCount = 0;
    for (const p of withSource) {
      const md = fs.readFileSync(p.source!.file, 'utf8');
      const criteria = p.source!.mode === 'acceptance' ? parseAcceptance(md) : parsePlan(md);
      const cases = readCoverageCases(p.abs);
      const { findings: f, covered } = analyzeCoverage(criteria, cases, rel(options.root, p.abs), p.source!.mode);
      findings.push(...f);
      criteriaCount += criteria.length; coveredCount += covered; caseCount += cases.length;
      notes.push(`${rel(options.root, p.abs)}: ${covered} of ${criteria.length} criteria covered by ${cases.length} cases (source: ${rel(options.root, p.source!.file)}, ${p.source!.mode} mode).`);
      if (p.source!.mode === 'plan') notes.push(`${rel(options.root, p.abs)}: plan mode checks ids only — paste the Jira acceptance criteria into ${rel(options.root, p.abs.replace(/\.xlsx$/, '.acceptance.md'))} to check positive/negative/boundary needs against the wording.`);
    }
    return { utility: UTILITY, title: this.title, startedAt, finishedAt: new Date().toISOString(), dryRun: false,
      scanned: { workbooks: withSource.length, criteria: criteriaCount, covered: coveredCount, cases: caseCount }, findings, notes };
  },
};

export default coverageAnalyzer;
