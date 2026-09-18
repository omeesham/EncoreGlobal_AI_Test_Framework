#!/usr/bin/env node

/**
 * freeze-nm2271-inputs.mjs — verify or regenerate the NM-2271 frozen-inputs JSON.
 *
 * Modes:
 *   --verify  (default)  Re-read every pinned blob via git, recompute sha256,
 *                         recompute content_sha256. Exit non-zero on ANY mismatch,
 *                         missing blob, or malformed JSON.
 *   --write              Regenerate the JSON from git history. Refuses to overwrite
 *                         unless --force is also passed.
 *
 * Flags:
 *   --file=<path>        Use an alternate JSON file (default: co-located nm2271-frozen-inputs.json).
 *   --force              Allow --write to overwrite an existing file.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_JSON_PATH = resolve(__dirname, 'nm2271-frozen-inputs.json');

// ── arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let mode = 'verify';
  let force = false;
  let filePath = DEFAULT_JSON_PATH;

  for (const arg of args) {
    if (arg === '--write') mode = 'write';
    else if (arg === '--verify') mode = 'verify';
    else if (arg === '--force') force = true;
    else if (arg.startsWith('--file=')) filePath = resolve(arg.slice('--file='.length));
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { mode, force, filePath };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function computeContentSha256(obj) {
  const copy = { ...obj };
  delete copy.content_sha256;
  const canonical = JSON.stringify(copy, null, 2);
  return sha256(Buffer.from(canonical, 'utf-8'));
}

function gitShowBlob(commitSha, repoPath) {
  const ref = `${commitSha}:${repoPath}`;
  try {
    return execSync(`git show "${ref}"`, {
      encoding: 'buffer',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '(no stderr)';
    throw new Error(`git show "${ref}" failed: ${stderr}`);
  }
}

function gitRevParseBlob(commitSha, repoPath) {
  const ref = `${commitSha}:${repoPath}`;
  try {
    return execSync(`git rev-parse "${ref}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '(no stderr)';
    throw new Error(`git rev-parse "${ref}" failed: ${stderr}`);
  }
}

function gitCatBlob(blobSha) {
  try {
    return execSync(`git cat-file blob "${blobSha}"`, {
      encoding: 'buffer',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '(no stderr)';
    throw new Error(`git cat-file blob "${blobSha}" failed: ${stderr}`);
  }
}

// ── verify mode ──────────────────────────────────────────────────────────────

function verify(filePath) {
  if (!existsSync(filePath)) {
    console.error(`FAIL: file not found: ${filePath}`);
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`FAIL: cannot read ${filePath}: ${err.message}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`FAIL: malformed JSON in ${filePath}: ${err.message}`);
    process.exit(1);
  }

  if (data.schema !== 'nm2271-frozen-inputs/v1') {
    console.error(`FAIL: unexpected schema "${data.schema}"`);
    process.exit(1);
  }

  if (!Array.isArray(data.inputs) || data.inputs.length === 0) {
    console.error('FAIL: inputs array is missing or empty');
    process.exit(1);
  }

  // Verify each input FIRST (so drift names the specific role)
  let failures = 0;

  for (const input of data.inputs) {
    const { role, path: repoPath, commit, blob: expectedBlob, sha256: expectedSha256, bytes: expectedBytes } = input;

    if (!role || !repoPath || !commit || !expectedBlob || !expectedSha256 || expectedBytes == null) {
      console.error(`FAIL ${role || '(unknown)'}: missing required field(s)`);
      failures++;
      continue;
    }

    // Verify by blob hash directly — content-addressed lookup is path-independent,
    // which correctly handles historical entries whose path was renamed after the
    // pinned commit (e.g. corporate-pricing-override.spec.ts → corporate-override/).
    let blobContent;
    try {
      blobContent = gitCatBlob(expectedBlob);
    } catch (err) {
      console.error(`FAIL ${role}: ${err.message}`);
      failures++;
      continue;
    }

    // Verify sha256
    const actualSha256 = sha256(blobContent);
    if (actualSha256 !== expectedSha256) {
      console.error(`DRIFT ${role} sha256 expected=${expectedSha256} actual=${actualSha256}`);
      failures++;
      continue;
    }

    // Verify byte size
    if (blobContent.length !== expectedBytes) {
      console.error(`DRIFT ${role} bytes expected=${expectedBytes} actual=${blobContent.length}`);
      failures++;
      continue;
    }

    console.log(`OK ${role} ${actualSha256}`);
  }

  // Verify content_sha256 AFTER inputs (catches envelope tampering)
  const expectedContentHash = data.content_sha256;
  if (!expectedContentHash) {
    console.error('FAIL: content_sha256 field is missing');
    process.exit(1);
  }

  const actualContentHash = computeContentSha256(data);
  if (actualContentHash !== expectedContentHash) {
    console.error(`DRIFT content_sha256 expected=${expectedContentHash} actual=${actualContentHash}`);
    failures++;
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed verification.`);
    process.exit(1);
  }

  console.log(`\nAll ${data.inputs.length} inputs verified. content_sha256 OK.`);
  process.exit(0);
}

// ── write mode ───────────────────────────────────────────────────────────────

function write(filePath, force) {
  if (existsSync(filePath) && !force) {
    console.error(`REFUSE: ${filePath} already exists. Pass --force to overwrite.`);
    process.exit(1);
  }

  // NM-2271 shipped submission commit that contains the 65-TC set.
  const COMMIT = '8665088cc6a1f9301c668e369c1977773fa5f586';
  const COMMIT_DATE = '2026-07-21T16:48:45+05:30';

  // Pre-restructure path for git resolution at the pinned commit (the spec was
  // renamed from corporate-pricing/ to corporate-override/ after commit 8665088).
  const HISTORICAL_SPEC_RESOLVE = [
    'tests',
    'corporate-pricing',
    'corporate-pricing-override.spec.ts',
  ].join('/');

  const inputDefs = [
    {
      role: 'historical_tc_set',
      path: 'specs_planning/test-cases/setup/corporate-pricing/corporate_pricing_override_test_cases.md',
      note: 'NM-2271 shipped TC set on origin/NM-2271 with 65 unique TC IDs (TC-CPR-OVR-001..065)',
    },
    {
      role: 'historical_test_plan',
      path: 'specs_planning/test-plans/setup/corporate-pricing/corporate_pricing_override_test_plan.md',
      note: 'Test plan counterpart pinned to the same NM-2271 shipped revision as the TC set',
    },
    {
      role: 'historical_field_inventory',
      path: 'specs_planning/_internal/field-inventories/corporate-pricing-override-2026-06-19.md',
      note: 'Field inventory blob present on NM-2271 and pinned at the same shipped revision',
    },
    {
      role: 'historical_spec',
      path: 'tests/corporate-override/corporate-override-labor-grid.spec.ts',
      resolvePath: HISTORICAL_SPEC_RESOLVE,
      note: 'NM-2271 shipped monolithic spec (pre-split path used for git resolution; current path for reference)',
    },
  ];

  const headSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

  const inputs = inputDefs.map((def) => {
    const resolveAt = def.resolvePath || def.path;
    const blobContent = gitShowBlob(COMMIT, resolveAt);
    const blobId = gitRevParseBlob(COMMIT, resolveAt);
    return {
      role: def.role,
      path: def.path,
      commit: COMMIT,
      commit_date: COMMIT_DATE,
      blob: blobId,
      sha256: sha256(blobContent),
      bytes: blobContent.length,
      note: def.note,
    };
  });

  const obj = {
    schema: 'nm2271-frozen-inputs/v1',
    frozen_at_head: headSha,
    superseded: [
      {
        role: 'historical_tc_set',
        commit: '3156c35226b4bcfba01af99d574e69fedd2ad0d3',
        tc_count: 38,
        reason: 'wrong branch — main, not origin/NM-2271; see dg-4e-01',
      },
    ],
    inputs,
    expected_failures: {
      labor_tab_fields: 28,
      max_discount_pct_bva_neg: 11,
      override_price_bva_neg: 8,
      rejection_oracle_omissions_cases: 10,
      source: 'plans/pending/PLAN_WALK_DEPTH_GATE.md:263-266',
    },
  };

  obj.content_sha256 = computeContentSha256(obj);

  const json = JSON.stringify(obj, null, 2) + '\n';

  if (existsSync(filePath)) {
    const old = readFileSync(filePath, 'utf-8');
    if (old === json) {
      console.log('No changes detected.');
      process.exit(0);
    }
    console.log('Overwriting (--force).');
  }

  writeFileSync(filePath, json, 'utf-8');
  console.log(`Written: ${filePath}`);
  console.log(`content_sha256: ${obj.content_sha256}`);
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────────

const { mode, force, filePath } = parseArgs();

if (mode === 'verify') {
  verify(filePath);
} else {
  write(filePath, force);
}
