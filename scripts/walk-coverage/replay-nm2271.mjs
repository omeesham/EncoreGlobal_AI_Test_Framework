#!/usr/bin/env node
// scripts/walk-coverage/replay-nm2271.mjs
// PLAN_WALK_DEPTH_GATE — Phase 4 falsifiability spine.
//
// Runs each replay input through the REAL production verdict path
// (coverageVerdict + check-reject-oracle CLI) and compares observed vs expected.
// Exit non-zero if ANY mismatch or if zero inputs were evaluated.
//
// CLI:
//   --json              Machine-readable JSON to stdout
//   --force-mandate     Capability-test mode: bypass date-based grandfather exemptions
//   --only=<id>         Run a single input by ID
//   --fixtures-dir=<d>  Override fixtures base dir (probes only)

import { coverageVerdict } from './lib/coverage-manifest.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ── CLI ──────────────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2);
const jsonMode = cliArgs.includes('--json');
const forceMandate = cliArgs.includes('--force-mandate');
const onlyFlag = cliArgs.find(a => a.startsWith('--only='));
const onlyId = onlyFlag ? onlyFlag.slice('--only='.length) : null;
const fixturesFlag = cliArgs.find(a => a.startsWith('--fixtures-dir='));
const FIXTURES_BASE = fixturesFlag
  ? resolve(fixturesFlag.slice('--fixtures-dir='.length))
  : resolve(__dirname, 'fixtures');

const FROZEN_JSON = join(FIXTURES_BASE, 'nm2271-frozen-inputs.json');
const MUTANTS_JSON = join(FIXTURES_BASE, 'replay', 'mutants', 'MUTANTS.json');
const REPORT_DIR = join(REPO_ROOT, 'reports', 'walk-coverage');
const REPORT_PATH = join(REPORT_DIR, 'replay-nm2271.json');
const TMP_DIR = join(REPO_ROOT, '.tmp-replay-nm2271');

// ── Utilities ────────────────────────────────────────────────────────────────

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function contentSha256(obj) {
  const copy = { ...obj };
  delete copy.content_sha256;
  return sha256(Buffer.from(JSON.stringify(copy, null, 2), 'utf-8'));
}

function readJsonOrNull(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function readTextOrNull(p) {
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

// Discover the walk file in a fixture directory — checks walk.md then walk-artifact.md.
function findWalkFile(dir) {
  for (const name of ['walk.md', 'walk-artifact.md']) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function gitShowText(commitColonPath) {
  const r = spawnSync('git', ['show', commitColonPath], {
    cwd: REPO_ROOT, encoding: 'utf-8', timeout: 10000,
  });
  if (r.status !== 0 || r.error) {
    throw new Error(`git show ${commitColonPath}: ${(r.stderr || r.error?.message || '').trim()}`);
  }
  return r.stdout;
}

// ── Frozen-input verification ────────────────────────────────────────────────

function verifyFrozenInputs() {
  const verifier = join(FIXTURES_BASE, 'freeze-nm2271-inputs.mjs');
  if (!existsSync(verifier)) {
    throw new Error('ABORT: freeze-nm2271-inputs.mjs not found');
  }
  if (!existsSync(FROZEN_JSON)) {
    throw new Error('ABORT: nm2271-frozen-inputs.json not found');
  }
  const r = spawnSync(process.execPath, [verifier, '--verify'], {
    cwd: REPO_ROOT, encoding: 'utf-8', timeout: 30000,
  });
  if (r.status !== 0) {
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    throw new Error(`ABORT: frozen inputs drift (exit ${r.status}):\n${out}`);
  }
}

// ── Production verdict: coverageVerdict ──────────────────────────────────────

function verdictFromText(walkText, opts = {}) {
  const verdictOpts = { ...opts, depthGateMode: 'deny' };
  // --force-mandate: bypass all date-based grandfather exemptions so the coverage
  // checks actually execute. This is a capability test, not a production override.
  const landingDate = forceMandate ? '1970-01-01' : undefined;
  if (forceMandate) {
    verdictOpts.manifestMandatoryDate = '1970-01-01';
    verdictOpts.provenanceLandingDate = '1970-01-01';
  }
  const v = coverageVerdict(walkText, landingDate, verdictOpts);
  return {
    pass: v.complete,
    reasons: [...(v.reasons || [])],
    applicable: v.applicable,
  };
}

// ── Production verdict: check-reject-oracle CLI ──────────────────────────────

function oracleFromDirs(dirs) {
  const script = join(REPO_ROOT, 'scripts', 'check-reject-oracle.mjs');
  const a = [script, '--json'];
  if (dirs.specsDir) a.push('--specs-dir', dirs.specsDir);
  if (dirs.receiptsDir) a.push('--receipts-dir', dirs.receiptsDir);
  if (dirs.inventoryDir) a.push('--inventory-dir', dirs.inventoryDir);

  const r = spawnSync(process.execPath, a, {
    cwd: REPO_ROOT, encoding: 'utf-8', timeout: 30000,
  });
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    return { pass: false, reasons: [`oracle parse error: ${e.message} (stderr: ${(r.stderr || '').trim()})`] };
  }
  const findings = parsed.findings || [];
  return { pass: findings.length === 0, reasons: findings };
}

// ── Build depth-gate opts from fixture dir files ─────────────────────────────

function depthOptsFromDir(dir) {
  const opts = {};

  const completion = readJsonOrNull(join(dir, 'completion.json'))
    ?? readJsonOrNull(join(dir, 'completion-record.json'));
  if (completion?.entries) {
    opts.manifestControls = completion.entries.map(e => ({ machineKey: e.key }));
  }

  const caseRowsRaw = readJsonOrNull(join(dir, 'case-rows.json'));
  const caseRows = Array.isArray(caseRowsRaw) ? caseRowsRaw
    : Array.isArray(caseRowsRaw?.rows) ? caseRowsRaw.rows : null;

  // Pass caseRows through — undefined ("never provided") vs [] ("checked, found none")
  // is load-bearing; three downstream checks were running blind without this.
  if (caseRowsRaw !== null) {
    opts.caseRows = caseRows ?? [];
  }

  if (caseRows && opts.manifestControls) {
    opts.inventoryRows = caseRows.map(r => ({
      machineKey: r.field_key,
      controlType: r.field_type,
    }));
  }

  // Derive dispositions from case-rows disposed_by when no explicit dispositions.json
  if (!opts.dispositions && caseRows) {
    const derived = caseRows
      .filter(r => r.case_id && r.disposed_by)
      .map(r => ({ caseId: r.case_id, tcId: r.disposed_by, tcTitle: '' }));
    if (derived.length > 0) opts.dispositions = derived;
  }

  const dispositions = readJsonOrNull(join(dir, 'dispositions.json'));
  if (dispositions) {
    opts.dispositions = dispositions;
  }

  const exempted = readJsonOrNull(join(dir, 'exempted-case-rows.json'));
  if (exempted) {
    opts.exemptedCaseRows = exempted;
    opts.totalNegBvaCaseRows = exempted.length;
  }

  return opts;
}

// Harness-boundary guard: log case-row counts per input and fail-closed on
// declared-but-empty case rows — prevents silent blindness where a check fed
// zero rows is indistinguishable from a check that passed.
function loadDepthOptsWithGuard(dir, inputId) {
  const opts = depthOptsFromDir(dir);
  if (opts.caseRows !== undefined) {
    console.log(`CASEROWS: ${inputId} rows=${opts.caseRows.length}`);
    if (opts.caseRows.length === 0) {
      throw new Error(
        `LOADER ERROR: ${inputId} — case-rows.json in ${dir} declared but produced 0 rows`,
      );
    }
  } else {
    console.log(`CASEROWS: ${inputId} rows=absent`);
  }
  return opts;
}

// ── Oracle dirs from a fixture directory ─────────────────────────────────────
// Always provides explicit dirs so the oracle never falls back to default repo paths.

function oracleDirsFromFixtureDir(dir) {
  const specsDir = join(dir, 'specs');
  if (!existsSync(specsDir)) return null;

  const emptyReceipts = join(TMP_DIR, 'empty-receipts');
  const emptyInventory = join(TMP_DIR, 'empty-inventory');

  return {
    specsDir,
    receiptsDir: existsSync(join(dir, 'receipts'))
      ? join(dir, 'receipts')
      : emptyReceipts,
    inventoryDir: existsSync(join(dir, 'inventory'))
      ? join(dir, 'inventory')
      : emptyInventory,
  };
}

// ── Evaluate a single input ──────────────────────────────────────────────────

function evaluateInput(id, cls, expected, walkTextFn, opts) {
  const result = {
    id, class: cls, expected,
    observed: null, matched: false,
    mandate: forceMandate ? 'FORCED' : 'production',
    reasons: [],
  };

  try {
    const walkText = walkTextFn();

    // Production path 1: coverageVerdict
    const cv = verdictFromText(walkText, opts.verdictOpts || {});
    let pass = cv.pass;
    result.reasons.push(...cv.reasons);

    // Production path 2: check-reject-oracle CLI
    if (opts.oracleDirs) {
      const oc = oracleFromDirs(opts.oracleDirs);
      if (!oc.pass) pass = false;
      result.reasons.push(...oc.reasons.map(f => `[oracle] ${f}`));
    }

    result.observed = pass ? 'PASS' : 'FAIL';
    result.matched = result.observed === expected;
  } catch (err) {
    result.observed = 'ERROR';
    result.reasons = [`EXCEPTION: ${err.message}`];
    result.matched = false;
  }

  return result;
}

// ── Class 1: historical NM-2271 submission ───────────────────────────────────

function runClass1(frozen) {
  const inv = frozen.inputs.find(i => i.role === 'historical_field_inventory');
  const spec = frozen.inputs.find(i => i.role === 'historical_spec');
  if (!inv) throw new Error('frozen inputs: no historical_field_inventory');
  const class1Dir = join(FIXTURES_BASE, 'replay', 'class1');

  const walkText = gitShowText(`${inv.commit}:${inv.path}`);
  const actualSha = sha256(Buffer.from(walkText, 'utf-8'));
  if (actualSha !== inv.sha256) {
    throw new Error(
      `Class 1 field-inventory sha256 mismatch: expected ${inv.sha256}, got ${actualSha}`,
    );
  }

  // Oracle: materialize historical spec + empty receipts to temp dirs
  let oracleDirs;
  if (spec) {
    const tmpSpecs = join(TMP_DIR, 'class1-specs');
    const tmpReceipts = join(TMP_DIR, 'class1-receipts');
    const tmpInv = join(TMP_DIR, 'class1-inventory');
    mkdirSync(tmpSpecs, { recursive: true });
    mkdirSync(tmpReceipts, { recursive: true });
    mkdirSync(tmpInv, { recursive: true });

    const specText = gitShowText(`${spec.commit}:${spec.path}`);
    writeFileSync(join(tmpSpecs, 'historical.spec.ts'), specText);

    // Try to extract historical field-case catalogs from git
    try {
      const catDir = 'specs_planning/_internal/field-case-catalogs';
      const ls = spawnSync('git', ['ls-tree', '--name-only', inv.commit, catDir + '/'], {
        cwd: REPO_ROOT, encoding: 'utf-8', timeout: 5000,
      });
      if (ls.status === 0 && ls.stdout.trim()) {
        for (const file of ls.stdout.trim().split('\n').filter(Boolean)) {
          try {
            const content = gitShowText(`${inv.commit}:${file}`);
            writeFileSync(join(tmpInv, file.split('/').pop()), content);
          } catch { /* individual file missing at that commit — skip */ }
        }
      }
    } catch { /* catalogs dir absent at pinned commit — oracle runs with empty inventory */ }

    oracleDirs = { specsDir: tmpSpecs, receiptsDir: tmpReceipts, inventoryDir: tmpInv };
  }

  return evaluateInput(
    'class1-historical-nm2271', 'class1', 'FAIL',
    () => walkText,
    { verdictOpts: { artifactPath: inv.path, ...loadDepthOptsWithGuard(class1Dir, 'class1-historical-nm2271') }, oracleDirs },
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // ── Force-mandate banner ─────────────────────────────────────────────
  if (forceMandate) {
    const banner = [
      '',
      '╔══════════════════════════════════════════════════════════════════╗',
      '║  CAPABILITY TEST MODE: --force-mandate active                  ║',
      '║  All date-based grandfather exemptions are bypassed.           ║',
      '║  Results tagged mandate=FORCED — NOT production verdicts.      ║',
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
    ];
    for (const line of banner) console.log(line);
  }

  // Create temp dirs for oracle isolation
  mkdirSync(join(TMP_DIR, 'empty-receipts'), { recursive: true });
  mkdirSync(join(TMP_DIR, 'empty-inventory'), { recursive: true });

  // Verify frozen inputs (skip for custom fixtures dir used by probes)
  if (!fixturesFlag) {
    verifyFrozenInputs();
  }

  const results = [];
  let evaluated = 0;
  let matched = 0;
  let mismatched = 0;
  let skippedMissing = 0;

  function record(r) {
    results.push(r);
    if (r.observed === 'SKIPPED-MISSING') {
      skippedMissing++;
    } else {
      evaluated++;
      if (r.matched) matched++;
      else mismatched++;
    }
  }

  function skip(id, cls, expected, role, path) {
    record({
      id, class: cls, expected,
      observed: 'SKIPPED-MISSING', matched: false,
      mandate: forceMandate ? 'FORCED' : 'production',
      reasons: [`SKIPPED-MISSING ${role} ${path}`],
    });
  }

  // ── Class 1 ──────────────────────────────────────────────────────────────
  if (!onlyId || onlyId === 'class1-historical-nm2271') {
    const frozen = readJsonOrNull(FROZEN_JSON);
    if (!frozen) {
      skip('class1-historical-nm2271', 'class1', 'FAIL', 'frozen-inputs', FROZEN_JSON);
    } else {
      record(runClass1(frozen));
    }
  }

  // ── Class 2 — genuinely complete (must PASS) ────────────────────────────
  if (!onlyId || onlyId === 'class2-complete') {
    const dir = join(FIXTURES_BASE, 'replay', 'class2');
    const walkFile = findWalkFile(dir);
    if (!walkFile) {
      skip('class2-complete', 'class2', 'PASS', 'class2-fixture', dir);
    } else {
      record(evaluateInput('class2-complete', 'class2', 'PASS',
        () => readFileSync(walkFile, 'utf-8'),
        {
          verdictOpts: { artifactPath: walkFile, ...loadDepthOptsWithGuard(dir, 'class2-complete') },
          oracleDirs: oracleDirsFromFixtureDir(dir),
        },
      ));
    }
  }

  // ── Class 3 — shallow-but-compliant (must FAIL) ────────────────────────
  if (!onlyId || onlyId === 'class3-shallow-compliant') {
    const dir = join(FIXTURES_BASE, 'replay', 'class3');
    const walkFile = findWalkFile(dir);
    if (!walkFile) {
      skip('class3-shallow-compliant', 'class3', 'FAIL', 'class3-fixture', dir);
    } else {
      record(evaluateInput('class3-shallow-compliant', 'class3', 'FAIL',
        () => readFileSync(walkFile, 'utf-8'),
        {
          verdictOpts: { artifactPath: walkFile, ...loadDepthOptsWithGuard(dir, 'class3-shallow-compliant') },
          oracleDirs: oracleDirsFromFixtureDir(dir),
        },
      ));
    }
  }

  // ── Mutants from MUTANTS.json ──────────────────────────────────────────
  const mutantsIndex = readJsonOrNull(MUTANTS_JSON);
  if (mutantsIndex?.mutants) {
    for (const m of mutantsIndex.mutants) {
      if (onlyId && onlyId !== m.id) continue;
      const dir = resolve(REPO_ROOT, m.dir);
      const walkFile = findWalkFile(dir);
      if (!walkFile) {
        skip(m.id, 'mutant', m.expected, 'mutant-fixture', dir);
      } else {
        record(evaluateInput(m.id, 'mutant', m.expected,
          () => readFileSync(walkFile, 'utf-8'),
          {
            verdictOpts: { artifactPath: walkFile, ...loadDepthOptsWithGuard(dir, m.id) },
            oracleDirs: oracleDirsFromFixtureDir(dir),
          },
        ));
      }
    }
  } else if (!onlyId) {
    skip('mutants-index', 'mutant-index', 'N/A', 'MUTANTS.json', MUTANTS_JSON);
  }

  // ── --only validation ──────────────────────────────────────────────────
  if (onlyId && results.length === 0) {
    console.error(`FATAL: --only=${onlyId} matched no inputs`);
    process.exit(1);
  }

  // ── Silent-pass guard ──────────────────────────────────────────────────
  if (evaluated === 0) {
    console.error(`replay: FATAL — 0 inputs evaluated (skipped=${skippedMissing})`);
    process.exit(1);
  }

  // ── Write report JSON ─────────────────────────────────────────────────
  const summary = { total: results.length, matched, mismatched, skipped_missing: skippedMissing, mandate: forceMandate ? 'FORCED' : 'production' };
  const report = { ...summary, inputs: results };
  report.content_sha256 = contentSha256(report);

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  // ── Stdout ─────────────────────────────────────────────────────────────
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `\nreplay-nm2271 (evaluated=${evaluated} matched=${matched} mismatched=${mismatched} skipped=${skippedMissing}):\n`,
    );
    for (const r of results) {
      const tag = r.observed === 'SKIPPED-MISSING' ? 'SKIPPED-MISSING'
        : r.matched ? 'OK' : 'MISMATCH';
      console.log(`  ${tag}  ${r.id}  expected=${r.expected} observed=${r.observed}`);
      if (!r.matched && r.reasons.length > 0) {
        const show = r.reasons.slice(0, 5);
        for (const reason of show) {
          console.log(`         -> ${reason}`);
        }
        if (r.reasons.length > 5) {
          console.log(`         ... and ${r.reasons.length - 5} more`);
        }
      }
    }
    console.log(`\nReport: ${REPORT_PATH}`);
  }

  // ── Cleanup temp dirs ──────────────────────────────────────────────────
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }

  // ── Exit code ──────────────────────────────────────────────────────────
  process.exit(mismatched > 0 ? 1 : 0);
}

main();
