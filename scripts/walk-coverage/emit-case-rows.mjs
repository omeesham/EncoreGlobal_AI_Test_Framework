// scripts/walk-coverage/emit-case-rows.mjs
// Phase 2.3/2.5 — per-case row emitter.
//
// Crosses the machine-derived control types (Completion_Record.derived_types from
// enumerate-page.mjs) against the field-case taxonomy (field-case-generation.md) and
// emits one row per case per control. disposed_by is always null at emit — the gate
// (coverage-manifest.mjs) fills and validates it. This script never asserts coverage.
//
// Usage (--flag=value only — space-separated args break dispatch):
//   node scripts/walk-coverage/emit-case-rows.mjs \
//     --completion-record=<path>  \
//     --inventory=<path>          \
//     [--taxonomy=<path>]         \
//     [--json]                    \
//     [--out=<path>]
//
// Fail-closed:
//   taxonomy parse error          → stderr + exit 1, no partial output
//   controls > 0 AND rows === 0   → stderr + exit 1 (silent-pass guard)
//   missing required args         → stderr + exit 1
//
// No empty catch. No swallowed errors (LR-003).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFieldCaseTaxonomy, parseFieldCaseTaxonomy } from './lib/field-case-parser.mjs';
// Structural key-identity helpers only (which keys are grid rows, and which grid each belongs to).
// The two denominator paths must not share their CASE COUNTING — that would make the parity check a
// tautology — but they MUST share this DEFINITION, exactly as they already share the widened-set
// definition. Otherwise the check reports an arithmetic difference between two authors instead of a
// real disagreement, burying the signal it exists to raise.
import { partitionControls, gridUnits } from './lib/case-parity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI arg parsing (--flag=value only) ─────────────────────────────────────

function parseArgs(argv) {
  const o = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return o;
}

const args = parseArgs(process.argv);
const sourceArtifact = args['completion-record']
  ? basename(resolve(args['completion-record'])).replace(/\.json$/i, '')
  : null;

if (args.help) {
  process.stdout.write(
    'emit-case-rows.mjs — per-case row emitter (Phase 2.3/2.5)\n' +
    '\n' +
    'Usage:\n' +
    '  node scripts/walk-coverage/emit-case-rows.mjs \\\n' +
    '    --completion-record=<path>   path to enumerate-page.mjs JSON output\n' +
    '    --inventory=<path>           path to field-inventory markdown artifact\n' +
    '    [--taxonomy=<path>]          override path to field-case-generation.md\n' +
    '    [--json]                     compatibility no-op; output is JSON\n' +
    '    [--out=<path>]               write output to file instead of stdout\n' +
    '    [--merge]                    when used with --out, merge new rows into an existing\n' +
    '                                 file by replacing rows with the same source_artifact\n' +
    '                                 and keeping all others. Without --merge, --out overwrites.\n' +
    '                                 On merge-read failure: exits 1, target file untouched.\n' +
    '\n' +
    'Exit codes:\n' +
    '  0   success\n' +
    '  1   error (taxonomy failure, missing args, silent-pass guard, merge-read failure)\n'
  );
  process.exit(0);
}

if (!args['completion-record'] || !args['inventory']) {
  process.stderr.write(
    'emit-case-rows: --completion-record and --inventory are required\n' +
    'Run with --help for usage.\n'
  );
  process.exit(1);
}

// ── Load taxonomy (fail-closed) ──────────────────────────────────────────────

let taxonomy;
try {
  if (args.taxonomy) {
    const text = readFileSync(resolve(args.taxonomy), 'utf-8');
    taxonomy = parseFieldCaseTaxonomy(text);
  } else {
    taxonomy = loadFieldCaseTaxonomy();
  }
} catch (err) {
  process.stderr.write(`emit-case-rows: taxonomy load failed — ${err.message}\n`);
  process.exit(1);
}

// ── Load completion record ───────────────────────────────────────────────────

let completionRecord;
try {
  const raw = readFileSync(resolve(args['completion-record']), 'utf-8');
  completionRecord = JSON.parse(raw);
} catch (err) {
  process.stderr.write(`emit-case-rows: completion-record load failed — ${err.message}\n`);
  process.exit(1);
}

const derivedTypes = completionRecord?.derived_types ?? {};
// Grid rows are NOT standalone controls. Owner directive, verbatim: "our goal is to test all unique
// cases possible in all unique ways… if a grid has 100 rows, we dont repeat 1 test on each!" On the
// real 4107 Override manifest, 414 of 504 entries are `struct:tr|…` rows belonging to ONE grid;
// billing each row its own field-case set inflated the denominator by 53,372 rows and made a single
// table look like the bulk of the test surface. Grid rows earn §3 surface-behaviour cases ONCE per
// grid (emitted below), never §2 field cases per row.
const { gridRowKeys, controlKeys } = partitionControls(derivedTypes);

// ── Load inventory and build testid → label map ──────────────────────────────

function parseInventoryLabels(mdText) {
  // Scans every ## Field Inventory table in the artifact (there may be sub-section tables).
  // Table header must contain 'Field' and 'data-testid' columns (§3 frozen 8-col contract).
  // Returns Map<testidValue, fieldLabel>.
  const lines = mdText.split('\n');
  const labelMap = new Map();

  let inInventorySection = false;
  let inTable = false;
  let pastSeparator = false;
  let fieldColIdx = -1;
  let testidColIdx = -1;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^##\s+Field Inventory/.test(trimmed)) {
      inInventorySection = true;
      inTable = false;
      pastSeparator = false;
      continue;
    }

    // A new top-level ## heading (not Field Inventory) ends the section
    if (inInventorySection && /^##\s/.test(trimmed) && !/^##\s+Field Inventory/.test(trimmed)) {
      inInventorySection = false;
      continue;
    }

    if (!inInventorySection) continue;

    if (!trimmed.startsWith('|')) {
      // Sub-heading (###) resets table state so we pick up the next table header
      if (trimmed.startsWith('#')) {
        inTable = false;
        pastSeparator = false;
      }
      continue;
    }

    const cols = trimmed.split('|').slice(1, -1).map(c => c.trim());

    if (!inTable) {
      // Header row — find our two target columns
      fieldColIdx  = cols.findIndex(c => c === 'Field');
      testidColIdx = cols.findIndex(c => c === 'data-testid');
      inTable = true;
      pastSeparator = false;
      continue;
    }

    if (!pastSeparator) {
      pastSeparator = true;
      continue;
    }

    if (fieldColIdx === -1 || testidColIdx === -1) continue;

    const fieldLabel = (cols[fieldColIdx] ?? '').trim();
    const testidRaw  = (cols[testidColIdx] ?? '').trim();

    // Strip "(none) — use ..." fallback markers; only real testid values are indexable
    if (testidRaw.startsWith('(none)')) continue;
    if (!testidRaw || !fieldLabel) continue;

    labelMap.set(testidRaw, fieldLabel);
  }

  return labelMap;
}

let inventoryLabels;
try {
  const invText = readFileSync(resolve(args.inventory), 'utf-8');
  inventoryLabels = parseInventoryLabels(invText);
} catch (err) {
  process.stderr.write(`emit-case-rows: inventory load failed — ${err.message}\n`);
  process.exit(1);
}

// ── Type lookup helpers ──────────────────────────────────────────────────────

// Map: fieldType.type (name string) → cases[]
const typeMap = new Map(taxonomy.fieldTypes.map(ft => [ft.type, ft.cases]));

// Widened set = union of all field types' cases (every type, every case)
const widenedCases = taxonomy.fieldTypes.flatMap(ft => ft.cases);

// Extract the raw testid from a controlKey (e.g. "id:foo-bar" → "foo-bar").
// For "struct:<key>" the whole suffix is used as-is for lookup.
function testidFromControlKey(ck) {
  const colon = ck.indexOf(':');
  return colon === -1 ? ck : ck.slice(colon + 1);
}

// ── Cross derived_types × taxonomy → rows ────────────────────────────────────

const rows = [];
const parityGaps = [];
const inventoryKeysHit = new Set();

for (const controlKey of controlKeys) {
  const entry = derivedTypes[controlKey];

  // Resolved only when the entry explicitly says so and has a non-empty type name
  const isResolved =
    entry != null &&
    entry.resolved === true &&
    entry.type != null &&
    entry.type !== '';

  // Inventory lookup — used for field_label
  const testid = testidFromControlKey(controlKey);
  const fieldLabel = inventoryLabels.get(testid) ?? null;

  if (fieldLabel === null) {
    parityGaps.push({ gap: 'in-derived-types-not-in-inventory', controlKey });
  } else {
    inventoryKeysHit.add(testid);
  }

  // Determine cases to emit, and whether widening was applied
  let casesToEmit;
  let widened = false;

  if (!isResolved) {
    // Unresolved / null type / missing entry — widest possible set
    casesToEmit = widenedCases;
    widened = true;
  } else {
    const typeCases = typeMap.get(entry.type);
    if (typeCases === undefined) {
      // Type name present in derived_types but not in taxonomy — widen
      casesToEmit = widenedCases;
      widened = true;
    } else {
      casesToEmit = typeCases;
    }
  }

  for (const c of casesToEmit) {
    // case_id is an INTERNAL key: <controlKey>::<verbatim taxonomy case label>
    // It maps back to a shipped TC id through field_key — we do NOT mint a third id scheme.
    const row = {
      case_id:         `${controlKey}::${c.input}`,
      field_key:       controlKey,
      field_label:     fieldLabel ?? 'UNRESOLVED',
      field_type:      isResolved ? entry.type : 'UNRESOLVED',
      category:        c.category,
      requires_oracle: c.requiresOracle,
      disposed_by:     null,
    };
    if (sourceArtifact) row.source_artifact = sourceArtifact;
    if (widened) row.widened = true;
    rows.push(row);
  }
}

// ── §3 surface axis — each distinct grid earns its behaviour cases ONCE ──────
//
// LR-065: a grid's behaviours (pagination, sorting, result-fidelity, render-state, empty/volume,
// combination, persistence) live BETWEEN elements, so a field-only census can mark every cell
// covered while the grid has zero pagination or sort tests. The 7 taxonomy families collectively
// constitute that axis — there is no family literally named "grid" — so a grid earns the sum of all
// of them, one time, keyed on the table's DOM path rather than on any row's content.
const surfaceFamilies = taxonomy.surfaceFamilies ?? [];
const grids = gridUnits(gridRowKeys);

for (const [unit, memberRows] of grids) {
  for (const family of surfaceFamilies) {
    for (const c of family.cases ?? []) {
      const gridRow = {
        case_id:         `grid:${unit}::${family.family}::${c.caseId ?? c.input}`,
        field_key:       `grid:${unit}`,
        field_label:     `GRID (${memberRows.length} row(s), counted once)`,
        field_type:      'GRID',
        category:        c.depth ?? c.category ?? 'surface',
        surface_family:  family.family,
        requires_oracle: c.requiresOracle ?? false,
        disposed_by:     null,
      };
      if (sourceArtifact) gridRow.source_artifact = sourceArtifact;
      rows.push(gridRow);
    }
  }
}

// Detect inventory testids that have no corresponding controlKey in derived_types
for (const [testid] of inventoryLabels) {
  if (!inventoryKeysHit.has(testid)) {
    parityGaps.push({ gap: 'in-inventory-not-in-derived-types', testid });
  }
}

// ── Phase 2.5 — Case_Coverage_Ratio ─────────────────────────────────────────
// disposed_by is null everywhere at emit time; ratio is 0 — correct and honest.
// The gate (coverage-manifest.mjs) is what compares it against 100%.

const totalCases    = rows.length;
const disposedCases = rows.filter(r => r.disposed_by !== null).length;
const widenedCount  = rows.filter(r => r.widened === true).length;
const coverageRatio = totalCases === 0 ? 0 : disposedCases / totalCases;

const summary = {
  Case_Coverage_Ratio: {
    ratio:          coverageRatio,
    disposed_cases: disposedCases,
    total_cases:    totalCases,
  },
  controls:    controlKeys.length,
  rows:        totalCases,
  widened:     widenedCount,
  parity_gaps: parityGaps.length,
};

// ── Silent-pass guard (mandatory) ────────────────────────────────────────────
// Always print the machine-readable summary line first on stderr so callers can parse it
// even when we subsequently exit non-zero, while stdout/outfile remain valid JSON.

const summaryLine =
  `CASE-ROWS: controls=${controlKeys.length} rows=${totalCases} ` +
  `widened=${widenedCount} parity_gaps=${parityGaps.length}`;

process.stderr.write(summaryLine + '\n');

if (controlKeys.length > 0 && totalCases === 0) {
  process.stderr.write(
    'emit-case-rows: FATAL — controls > 0 but rows === 0 (silent-pass guard)\n'
  );
  process.exit(1);
}

// ── Assemble output ──────────────────────────────────────────────────────────

const outputText = JSON.stringify({ summary, rows, parity_gaps: parityGaps }, null, 2) + '\n';

if (args.out) {
  const outPath = resolve(args.out);

  // --merge: read existing file, remove rows with the same source_artifact, keep all others,
  // append this run's rows. Allows multiple pages to coexist in one case-rows.json.
  if (args.merge && existsSync(outPath) && sourceArtifact) {
    try {
      const existing = JSON.parse(readFileSync(outPath, 'utf-8'));
      const existingRows = Array.isArray(existing) ? existing : (existing.rows || []);
      const kept = existingRows.filter(r => r.source_artifact !== sourceArtifact);
      const merged = [...kept, ...rows];

      // Recompute summary for the merged set
      const mergedTotal = merged.length;
      const mergedDisposed = merged.filter(r => r.disposed_by !== null).length;
      const mergedWidened = merged.filter(r => r.widened === true).length;
      const mergedSummary = {
        Case_Coverage_Ratio: {
          ratio: mergedTotal === 0 ? 0 : mergedDisposed / mergedTotal,
          disposed_cases: mergedDisposed,
          total_cases: mergedTotal,
        },
        controls: '(merged — per-artifact counts in individual runs)',
        rows: mergedTotal,
        widened: mergedWidened,
        parity_gaps: '(merged)',
      };
      const mergedOutput = JSON.stringify({ summary: mergedSummary, rows: merged }, null, 2) + '\n';
      writeFileSync(outPath, mergedOutput, 'utf-8');
      process.stderr.write(
        `MERGED: kept ${kept.length} existing rows + ${rows.length} new (source_artifact=${sourceArtifact}) → ${merged.length} total\n`
      );
    } catch (err) {
      process.stderr.write(
        `emit-case-rows: FATAL — merge read failed (${err.message}). ` +
        `Target file is left untouched; no rows written. ` +
        `Fix or remove the target file before retrying.\n`
      );
      process.exit(1);
    }
  } else {
    writeFileSync(outPath, outputText, 'utf-8');
  }
} else {
  process.stdout.write(outputText);
}
