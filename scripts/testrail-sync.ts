/**
 * Imports test cases from testcases-testrail-import/**\/*.csv into TestRail and records their ids in
 * config/testrail/case-map.json — the file the reporter resolves results against.
 *
 * Dry run by default: prints, per CSV, which TC ids are already mapped, which match an existing case IN THE
 * MODULE'S OWN SECTION by title (mapped, never duplicated) and which would be created. Matching is never
 * suite-wide: generic titles ("Without a session the page sends the user to sign in") recur across modules. Pass --execute to create the missing cases
 * and write case-map.json. CSV row order is the TC id order (see testcases-testrail-import/README.md), and the
 * TC id prefix is read from the spec whose titles the CSV mirrors.
 *
 * Usage (repo root):
 *   npx ts-node scripts/testrail-sync.ts --only taxes/sales-tax --only taxes/state-tax
 *   npx ts-node scripts/testrail-sync.ts --only taxes/state-tax --execute
 *
 * Env: TESTRAIL_HOST, TESTRAIL_USERNAME, TESTRAIL_API_KEY, TESTRAIL_PROJECT_ID, TESTRAIL_SUITE_ID (dotenv-flow).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenvFlow from 'dotenv-flow';
import { TestRailClient, TestRailNewCase } from '../src/utils/testrail-client';

const ROOT = path.resolve(__dirname, '..');
dotenvFlow.config({ path: ROOT, node_env: process.env.CI_ENV || process.env.NODE_ENV || 'local', silent: true });

const CASE_MAP = path.join(ROOT, 'config/testrail/case-map.json');
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const ONLY = args.flatMap((a, i) => (a === '--only' ? [args[i + 1]!] : []));

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The TC ids of a spec's tests in file order, keyed by title (minus the TC prefix). */
function specIds(specPath: string, titles: string[]): Map<string, string> {
  const src = fs.readFileSync(specPath, 'utf-8');
  const prefix = src.match(/TC-[A-Z]+-[A-Z]+-\d{3}/)![0].slice(0, -3);
  // Titles built in loops are not literal in the source, so ids are assigned by CSV order: row n ↔ TC n.
  return new Map(titles.map((t, i) => [t, `${prefix}${String(i + 1).padStart(3, '0')}`]));
}

async function main(): Promise<void> {
  const missing = ['TESTRAIL_HOST', 'TESTRAIL_USERNAME', 'TESTRAIL_API_KEY', 'TESTRAIL_PROJECT_ID', 'TESTRAIL_SUITE_ID'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);
  if (!ONLY.length) throw new Error('pass at least one --only <dir/name> (e.g. taxes/state-tax)');
  const projectId = Number(process.env.TESTRAIL_PROJECT_ID);
  const suiteId = Number(process.env.TESTRAIL_SUITE_ID);
  const tr = new TestRailClient(process.env.TESTRAIL_HOST!, process.env.TESTRAIL_USERNAME!, process.env.TESTRAIL_API_KEY!);

  const project = await tr.getProject(projectId);
  console.log(`[testrail] connected: project ${project.id} "${project.name}", suite S${suiteId}${EXECUTE ? '' : ' — DRY RUN'}`);
  const existing = await tr.getCases(projectId, suiteId);
  const sections = await tr.getSections(projectId, suiteId);
  const [priorities, types, templates] = EXECUTE ? await Promise.all([tr.getPriorities(), tr.getCaseTypes(), tr.getTemplates(projectId)]) : [[], [], []];
  const idOf = (list: { id: number; name: string }[], name: string): number | undefined => list.find((x) => norm(x.name) === norm(name))?.id;

  const caseMap: Record<string, number> = JSON.parse(fs.readFileSync(CASE_MAP, 'utf-8'));
  for (const only of ONLY) {
    const rows = parseCsv(fs.readFileSync(path.join(ROOT, 'testcases-testrail-import', `${only}.csv`), 'utf-8'));
    const head = rows[0]!;
    const col = (name: string, nth = 0): number => head.reduce<number[]>((acc, h, i) => (h === name ? [...acc, i] : acc), [])[nth]!;
    const data = rows.slice(1).filter((r) => r[col('Title')]);
    const ids = specIds(path.join(ROOT, 'tests', `${only}.spec.ts`), data.map((r) => r[col('Title')]!));
    const sectionName = data[0]![col('Section')]!;
    const section = sections.find((s) => s.name === sectionName && !s.parent_id);
    const byTitle = new Map<string, number[]>();
    for (const c of existing.filter((x) => section && x.section_id === section.id)) byTitle.set(norm(c.title), [...(byTitle.get(norm(c.title)) ?? []), c.id]);
    const plan = { mapped: [] as string[], matched: [] as string[], ambiguous: [] as string[], create: [] as string[][] };
    for (const r of data) {
      const tc = ids.get(r[col('Title')]!)!;
      const hits = byTitle.get(norm(r[col('Title')]!)) ?? [];
      if (caseMap[tc]) plan.mapped.push(tc);
      else if (hits.length === 1) { caseMap[tc] = hits[0]!; plan.matched.push(`${tc} → C${hits[0]}`); }
      else if (hits.length > 1) plan.ambiguous.push(`${tc} → ${hits.map((h) => `C${h}`).join(', ')}`);
      else plan.create.push(r);
    }
    console.log(`\n== ${only} (${data.length} cases, section "${sectionName}" ${section ? `S${section.id} exists` : 'will be created'})`);
    console.log(`   already in case-map: ${plan.mapped.length}`);
    console.log(`   matched existing TestRail case by title: ${plan.matched.length}${plan.matched.length ? `\n     ${plan.matched.join('\n     ')}` : ''}`);
    console.log(`   ambiguous (several cases share the title — skipped): ${plan.ambiguous.length}${plan.ambiguous.length ? `\n     ${plan.ambiguous.join('\n     ')}` : ''}`);
    console.log(`   to create: ${plan.create.length}`);
    if (!EXECUTE || !plan.create.length) continue;

    const sectionId = section?.id ?? (await tr.addSection(projectId, { name: sectionName, suite_id: suiteId })).id;
    for (const r of plan.create) {
      const tc = ids.get(r[col('Title')]!)!;
      const steps = [...(r[col('Steps')] ?? '').matchAll(/<li>(?:\d+\.\s*)?(.*?)<\/li>/g)].map((m) => ({ content: m[1]! }));
      if (steps.length) steps[steps.length - 1] = { ...steps[steps.length - 1]!, expected: r[col('Expected Result')] } as typeof steps[number];
      const payload: TestRailNewCase = {
        title: r[col('Title')]!,
        template_id: idOf(templates, r[col('Template')]!),
        type_id: idOf(types, r[col('Type')]!),
        // This instance has no Critical priority (Low / Medium / High / None) — Critical maps to High.
        priority_id: idOf(priorities, r[col('Priority')]!) ?? idOf(priorities, 'High'),
        custom_preconds: r[col('Preconditions')],
        custom_steps_separated: steps,
      };
      try {
        const created = await tr.addCase(sectionId, payload);
        caseMap[tc] = created.id;
        console.log(`   created ${tc} → C${created.id}`);
      } catch (e) {
        console.error(`   FAILED ${tc}: ${(e as Error).message}`);
      }
    }
  }
  if (EXECUTE) {
    fs.writeFileSync(CASE_MAP, `${JSON.stringify(caseMap, null, 2)}\n`);
    console.log(`\n[testrail] wrote ${CASE_MAP}`);
  }
}

main().catch((e) => {
  console.error(`[testrail] ${(e as Error).message}`);
  process.exit(1);
});
