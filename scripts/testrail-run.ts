/**
 * Session control for the ONE shared TestRail run.
 *
 * The reporter (src/reporter/testrail-reporter.ts) opens the run on its own the
 * first time results are pushed, so locally you normally never need this script
 * — run your module, run another module, they land in the same run. It exists
 * for the two cases where the session must be controlled explicitly:
 *
 *   - GitHub Actions, where each job has its own filesystem and therefore
 *     cannot see .testrail/current-run.json. A setup job runs `open`, publishes
 *     the id, and every test job receives it as TESTRAIL_RUN_ID.
 *   - Locally, when you want to start a new run before the 12h TTL lapses
 *     (`reset`), or to mark the session finished in TestRail (`close`).
 *
 * Usage (from the repo root):
 *   npm run testrail:run:open      # create/reuse the run, print its id and URL
 *   npm run testrail:run:status    # what the current session points at
 *   npm run testrail:run:close     # close the run in TestRail and clear the session
 *   npm run testrail:run:reset     # forget the session locally; next push opens a new run
 *
 * `open` also appends `run_id` / `run_url` / `run_name` to $GITHUB_OUTPUT when
 * that variable is set, so a workflow step can consume them with no extra glue.
 *
 * Env: the same TESTRAIL_* vars as the reporter — TESTRAIL_HOST,
 * TESTRAIL_USERNAME, TESTRAIL_API_KEY, TESTRAIL_PROJECT_ID, optionally
 * TESTRAIL_SUITE_ID / TESTRAIL_MILESTONE_ID — loaded via dotenv-flow exactly as
 * playwright.config.ts loads them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenvFlow from 'dotenv-flow';
import { TestRailClient } from '../src/utils/testrail-client';
import {
  RUN_STATE_PATH,
  clearRunState,
  formatRunName,
  openSharedRun,
  readRunState,
  resolveEnvLabel,
  resolveRunKey,
} from '../src/utils/testrail-run';

dotenvFlow.config({
  path: path.resolve(__dirname, '..'),
  node_env: process.env.CI_ENV || process.env.NODE_ENV || 'local',
  silent: true,
});

type Command = 'open' | 'status' | 'close' | 'reset';

const COMMANDS: Command[] = ['open', 'status', 'close', 'reset'];

function usage(): never {
  console.error(`Usage: ts-node scripts/testrail-run.ts <${COMMANDS.join('|')}>`);
  process.exit(2);
}

function requireEnv(): { projectId: number; suiteId?: number; milestoneId?: number } {
  const missing = ['TESTRAIL_HOST', 'TESTRAIL_USERNAME', 'TESTRAIL_API_KEY', 'TESTRAIL_PROJECT_ID'].filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0) {
    console.error(`[testrail] missing env: ${missing.join(', ')}`);
    process.exit(1);
  }
  return {
    projectId: Number(process.env.TESTRAIL_PROJECT_ID),
    suiteId: process.env.TESTRAIL_SUITE_ID ? Number(process.env.TESTRAIL_SUITE_ID) : undefined,
    milestoneId: process.env.TESTRAIL_MILESTONE_ID ? Number(process.env.TESTRAIL_MILESTONE_ID) : undefined,
  };
}

function client(): TestRailClient {
  return new TestRailClient(
    process.env.TESTRAIL_HOST!,
    process.env.TESTRAIL_USERNAME!,
    process.env.TESTRAIL_API_KEY!,
  );
}

/** Hand the ids to the next workflow step, when there is one. */
function emitGithubOutput(pairs: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  fs.appendFileSync(
    file,
    Object.entries(pairs)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(''),
    'utf-8',
  );
}

async function open(): Promise<void> {
  const { projectId, suiteId, milestoneId } = requireEnv();
  const api = client();
  const run = await openSharedRun(api, { projectId, suiteId, milestoneId });
  const url = api.runUrl(run.runId);
  console.log(
    `[testrail] ${run.created ? 'opened' : 'reusing'} run ${run.runId} — "${run.name}"\n` +
      `[testrail] covers ${run.totalCases} case(s) so far → ${url}`,
  );
  emitGithubOutput({ run_id: String(run.runId), run_url: url, run_name: run.name });
}

async function status(): Promise<void> {
  const pinned = process.env.TESTRAIL_RUN_ID;
  if (pinned) {
    console.log(`[testrail] pinned by TESTRAIL_RUN_ID=${pinned} — the session file is bypassed`);
  }
  const state = readRunState();
  if (!state) {
    console.log(
      `[testrail] no open session (${RUN_STATE_PATH} absent)\n` +
        `[testrail] the next push would open: "${formatRunName()}"`,
    );
    return;
  }
  const key = resolveRunKey();
  console.log(
    `[testrail] run ${state.runId} — "${state.name}"\n` +
      `[testrail] session key ${state.runKey}${state.runKey === key ? '' : ` (current is ${key} — next push starts a NEW run)`}\n` +
      `[testrail] opened ${state.createdAt}, last updated ${state.updatedAt}\n` +
      `[testrail] modules reported so far: ${state.contributors.join(', ') || '(none)'}`,
  );
  if (process.env.TESTRAIL_HOST) {
    const missing = ['TESTRAIL_USERNAME', 'TESTRAIL_API_KEY'].filter((k) => !process.env[k]);
    if (missing.length === 0) {
      const api = client();
      const covered = await api.getRunCaseIds(state.runId).catch(() => null);
      if (covered) console.log(`[testrail] covers ${covered.length} case(s) → ${api.runUrl(state.runId)}`);
    }
  }
}

async function close(): Promise<void> {
  const pinned = process.env.TESTRAIL_RUN_ID ? Number(process.env.TESTRAIL_RUN_ID) : undefined;
  const runId = pinned ?? readRunState()?.runId;
  if (!runId) {
    console.log('[testrail] nothing to close — no open session');
    return;
  }
  requireEnv();
  await client().closeRun(runId);
  clearRunState();
  console.log(`[testrail] closed run ${runId} and cleared the session`);
}

function reset(): void {
  const state = readRunState();
  const cleared = clearRunState();
  console.log(
    cleared
      ? `[testrail] session cleared (was run ${state?.runId}); the next push opens a new run`
      : '[testrail] no session to clear',
  );
  console.log(`[testrail] next run will be named: "${formatRunName()}" (env: ${resolveEnvLabel()})`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2] as Command | undefined;
  if (!cmd || !COMMANDS.includes(cmd)) usage();
  if (cmd === 'open') await open();
  else if (cmd === 'status') await status();
  else if (cmd === 'close') await close();
  else reset();
}

main().catch((e: unknown) => {
  console.error(`[testrail] ${(e as Error).message}`);
  process.exit(1);
});
