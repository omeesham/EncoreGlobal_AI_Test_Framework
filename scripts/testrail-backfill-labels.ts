/**
 * One-off maintenance utility: pushes each case's CSV-derived Labels onto its
 * already-imported TestRail case via update_case.
 *
 * Why this exists: TestRailClient.addLabel had a bug (fixed — see
 * src/utils/testrail-client.ts) where every label creation silently failed
 * (non-fatal by design), so every case imported by scripts/testrail-sync.ts
 * before that fix landed was created with zero labels despite
 * testcases-testrail-import/**\/*.csv specifying them. This script re-derives
 * the intended labels for every TC id already in config/testrail/case-map.json
 * and syncs them onto the live case — safe to re-run (idempotent; TestRail
 * dedupes label ids on a case).
 *
 * Usage (run from the repo root):
 *   npm run testrail:backfill-labels                       # every mapped case with labels
 *   npm run testrail:backfill-labels -- --only local-office  # scope to one module
 */

import { collectCases, loadCaseMap, buildClientFromEnv, resolveLabelIds, type LabelCache } from './testrail-sync';

async function main(): Promise<void> {
  const caseMap = loadCaseMap();
  const { all } = collectCases(caseMap);
  const targets = all.filter((c) => c.labels.length > 0 && caseMap.has(c.tcId));

  if (targets.length === 0) {
    console.log('Nothing to backfill — no mapped case has a non-empty Labels column.');
    return;
  }

  console.log(`Backfilling labels on ${targets.length} case(s):`);
  const { client, projectId } = buildClientFromEnv();
  const labelCache: LabelCache = {};

  let updated = 0;
  let skipped = 0;
  const failed: { tcId: string; error: string }[] = [];
  for (const c of targets) {
    const caseId = caseMap.get(c.tcId)!;
    try {
      const labelIds = await resolveLabelIds(client, projectId, c.labels, labelCache);
      if (!labelIds) {
        skipped++;
        continue; // labels unsupported on this instance, or every label failed to resolve
      }
      await client.updateCase(caseId, { labels: labelIds });
      updated++;
      console.log(`  C${caseId} (${c.tcId}) -> [${c.labels.join(', ')}]`);
    } catch (e) {
      failed.push({ tcId: c.tcId, error: (e as Error).message });
      console.warn(`  ! C${caseId} (${c.tcId}) FAILED: ${(e as Error).message}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (labels unsupported), ${failed.length} failed.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e: Error) => {
  console.error(`\n[testrail-backfill-labels] FAILED: ${e.message}`);
  process.exit(1);
});
