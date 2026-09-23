/**
 * ONE TestRail run per execution session — created once, then widened and
 * updated by every subsequent push.
 *
 * The problem this solves: the reporter used to call `add_run` at the end of
 * every Playwright invocation. Running the suite module by module therefore
 * scattered the results across a dozen runs, and no single run ever showed the
 * total case count. Here, the first invocation creates the run and records it;
 * every later invocation finds that record, widens the run's case list to
 * include its own cases, and pushes into the same run. The run's case count is
 * then the total across all modules that have executed in the session.
 *
 * Both supported execution shapes land in the same run:
 *
 *   1. Individual module / individual spec
 *        npx playwright test --project=encore-local-office
 *        npx playwright test tests/service-charge/service-charge.spec.ts
 *      Each invocation is a separate process, so the run is carried between
 *      them by the session file (see RUN_STATE_PATH).
 *
 *   2. Entire suite
 *        npm test
 *      One process, one run — it simply creates the run and fills it.
 *
 * Locally (1) and (2) both work with no extra ceremony. On GitHub Actions each
 * job gets a fresh filesystem, so the session file cannot travel between jobs:
 * a setup job runs `npm run testrail:run:open`, publishes the id, and the test
 * jobs receive it as TESTRAIL_RUN_ID. Same run, same accumulation.
 *
 * Session boundary — a new run is started when any of these is true:
 *   - no session file exists (fresh clone, or after `testrail:run:reset`);
 *   - the recorded run belongs to a different TESTRAIL_RUN_KEY (a different
 *     CI workflow run, say);
 *   - the recorded run is older than TESTRAIL_RUN_TTL_HOURS (default 12);
 *   - the recorded run was closed or deleted in TestRail.
 *
 * Env:
 *   TESTRAIL_RUN_ID         pin every push to this run (skips the session file)
 *   TESTRAIL_RUN_NAME       override the generated name
 *   TESTRAIL_RUN_KEY        session identity; defaults to the CI run id, else "local"
 *   TESTRAIL_RUN_ENV        the "(local)" suffix; defaults to the detected environment
 *   TESTRAIL_RUN_TTL_HOURS  how long a local session stays open (default 12)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import type { TestRailClient } from './testrail-client';

/** Fixed prefix of every run this framework creates — the client's convention. */
export const RUN_NAME_PREFIX = 'MFE-E2E-Regression-Testing';

export const RUN_STATE_DIR = path.resolve(process.cwd(), '.testrail');
export const RUN_STATE_PATH = path.join(RUN_STATE_DIR, 'current-run.json');
const LOCK_TARGET = path.join(RUN_STATE_DIR, 'current-run.lock-target');

const DEFAULT_TTL_HOURS = 12;

// Same shape as auth-storage's: a module run can take minutes, and a second
// invocation started meanwhile must wait rather than fork a second run.
const LOCK_OPTS: lockfile.LockOptions = {
  retries: { retries: 30, minTimeout: 500, maxTimeout: 2000, factor: 1 },
  stale: 60_000,
  realpath: false,
};

export interface RunState {
  /** Session identity — see resolveRunKey(). A mismatch starts a new run. */
  runKey: string;
  runId: number;
  name: string;
  /** ISO timestamps; createdAt drives the TTL, updatedAt is informational. */
  createdAt: string;
  updatedAt: string;
  /** Every `--project` / spec path this run has collected results from. */
  contributors: string[];
}

/** Local wall-clock `YYYY-MM-DD HH:mm` — the run name is read by people in
 *  their own timezone, so it is deliberately not UTC. */
function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}`
  );
}

/** Where the run came from, as the name's trailing "(...)" tag. */
export function resolveEnvLabel(): string {
  const explicit = process.env.TESTRAIL_RUN_ENV?.trim();
  if (explicit) return explicit;
  if (process.env.GITHUB_ACTIONS === 'true') return 'github-actions';
  if (process.env.CI) return process.env.CI_ENV || 'ci';
  return 'local';
}

/**
 * The run name, e.g.
 *   MFE-E2E-Regression-Testing — 2026-09-09 21:11 (local)
 *   MFE-E2E-Regression-Testing — 2026-09-09 21:11 (github-actions)
 *
 * TESTRAIL_RUN_NAME overrides it wholesale.
 */
export function formatRunName(date: Date = new Date(), envLabel: string = resolveEnvLabel()): string {
  return `${RUN_NAME_PREFIX} — ${stamp(date)} (${envLabel})`;
}

/** Identity of the execution session. On CI the workflow run id keeps parallel
 *  jobs of one workflow together and separate from the next workflow's. */
export function resolveRunKey(): string {
  const explicit = process.env.TESTRAIL_RUN_KEY?.trim();
  if (explicit) return explicit;
  const ghRun = process.env.GITHUB_RUN_ID;
  if (ghRun) return `gh-${ghRun}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`;
  return 'local';
}

function ttlMs(): number {
  const raw = process.env.TESTRAIL_RUN_TTL_HOURS;
  const hours = raw === undefined || raw === '' ? DEFAULT_TTL_HOURS : Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_TTL_HOURS * 3_600_000;
  return hours * 3_600_000;
}

function ensureStateDir(): void {
  if (!fs.existsSync(RUN_STATE_DIR)) fs.mkdirSync(RUN_STATE_DIR, { recursive: true });
  if (!fs.existsSync(LOCK_TARGET)) fs.writeFileSync(LOCK_TARGET, '', 'utf-8');
}

export function readRunState(): RunState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(RUN_STATE_PATH, 'utf-8')) as RunState;
    return Number.isInteger(raw?.runId) ? raw : null;
  } catch {
    return null;
  }
}

function writeRunState(state: RunState): void {
  ensureStateDir();
  const tmp = `${RUN_STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, RUN_STATE_PATH);
}

/** Forget the session without touching TestRail — the next push opens a new run. */
export function clearRunState(): boolean {
  try {
    fs.unlinkSync(RUN_STATE_PATH);
    return true;
  } catch {
    return false;
  }
}

function isFresh(state: RunState): boolean {
  const created = Date.parse(state.createdAt);
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < ttlMs();
}

export interface AcquireRunOptions {
  projectId: number;
  suiteId?: number;
  milestoneId?: number;
  /** Case ids this invocation is about to report on — the run is widened to cover them. */
  caseIds: number[];
  /** `--project` name or spec path, recorded on the session for the console line. */
  contributor?: string;
}

export interface AcquiredRun {
  runId: number;
  name: string;
  /** false when this invocation joined a run an earlier invocation opened. */
  created: boolean;
  /** Case ids added to the run by this invocation. */
  added: number[];
  /** Total case count the run now covers — the running total across every
   *  module that has reported into this session. */
  totalCases: number;
}

/**
 * Get the session's run, creating it only if there isn't one, and widen it to
 * cover `caseIds`.
 *
 * The union is computed against the run's CURRENT coverage as TestRail reports
 * it (get_tests), never against a locally cached list: `update_run` REPLACES
 * the case list, so a stale local list would silently drop another job's cases.
 */
export async function acquireSharedRun(
  client: TestRailClient,
  opts: AcquireRunOptions,
): Promise<AcquiredRun> {
  const caseIds = [...new Set(opts.caseIds)];

  // Pinned run — no session file involved, but still widened so a per-module
  // invocation can report cases the run was not opened with.
  const pinned = process.env.TESTRAIL_RUN_ID ? Number(process.env.TESTRAIL_RUN_ID) : undefined;
  if (pinned) {
    const run = await client.getRun(pinned);
    const added = await widen(client, run.id, run.include_all, caseIds);
    return {
      runId: run.id,
      name: run.name,
      created: false,
      added,
      totalCases: (await client.getRunCaseIds(run.id)).length,
    };
  }

  ensureStateDir();
  const release = await lockfile.lock(LOCK_TARGET, LOCK_OPTS);
  try {
    const runKey = resolveRunKey();
    const state = readRunState();
    const reusable = state && state.runKey === runKey && isFresh(state) ? state : null;

    if (reusable) {
      // The run can have been closed or deleted in TestRail since we recorded
      // it; either way, fall through and open a fresh one rather than fail.
      const run = await client.getRun(reusable.runId).catch(() => null);
      if (run && !run.is_completed) {
        const added = await widen(client, run.id, run.include_all, caseIds);
        const total = (await client.getRunCaseIds(run.id)).length;
        writeRunState({
          ...reusable,
          name: run.name,
          updatedAt: new Date().toISOString(),
          contributors: mergeContributors(reusable.contributors, opts.contributor),
        });
        return { runId: run.id, name: run.name, created: false, added, totalCases: total };
      }
    }

    const name = process.env.TESTRAIL_RUN_NAME || formatRunName();
    const run = await client.addRun(opts.projectId, {
      name,
      suite_id: opts.suiteId,
      milestone_id: opts.milestoneId,
      include_all: false,
      case_ids: caseIds,
      description: runDescription(),
    });
    const now = new Date().toISOString();
    writeRunState({
      runKey,
      runId: run.id,
      name,
      createdAt: now,
      updatedAt: now,
      contributors: mergeContributors([], opts.contributor),
    });
    return { runId: run.id, name, created: true, added: caseIds, totalCases: caseIds.length };
  } finally {
    await release();
  }
}

/** Add any missing case ids to the run. No-op when the run is include_all
 *  (TestRail already covers every case) or when nothing is new. */
async function widen(
  client: TestRailClient,
  runId: number,
  includeAll: boolean,
  caseIds: number[],
): Promise<number[]> {
  if (includeAll || caseIds.length === 0) return [];
  const existing = new Set(await client.getRunCaseIds(runId));
  const added = caseIds.filter((id) => !existing.has(id));
  if (added.length === 0) return [];
  await client.updateRun(runId, { case_ids: [...existing, ...added] });
  return added;
}

function mergeContributors(existing: string[] | undefined, contributor?: string): string[] {
  const out = new Set(existing ?? []);
  if (contributor) out.add(contributor);
  return [...out];
}

export function runDescription(): string {
  const parts = [
    'Automated results pushed by the Encore Playwright TestRail reporter.',
    'One run per execution session — every module / spec invocation widens and updates this same run.',
  ];
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
    parts.push(
      `Workflow: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}` +
        `/actions/runs/${process.env.GITHUB_RUN_ID}`,
    );
  }
  return parts.join('\n');
}

/**
 * Open the session's run up front, without any results — what CI calls before
 * fanning out, so every job can be handed one TESTRAIL_RUN_ID.
 */
export async function openSharedRun(
  client: TestRailClient,
  opts: { projectId: number; suiteId?: number; milestoneId?: number },
): Promise<AcquiredRun> {
  return acquireSharedRun(client, { ...opts, caseIds: [], contributor: 'open' });
}
