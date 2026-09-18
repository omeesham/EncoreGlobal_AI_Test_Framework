/**
 * Two-path denominator parity — PLAN_UNIQUE_CASE_COVERAGE_FLOOR Phase 3.
 *
 * Two seats computed the same denominator for Corporate Pricing Override and got 37 and 79. Neither
 * could say which was right, because neither number was produced by a machine that also reconciled
 * it. A denominator two paths disagree about is not a denominator; it is an opinion with a number
 * attached.
 *
 *   Path A — archetype expansion. Derived independently from `derived_types` + the §2/§3 taxonomy.
 *   Path B — case-row census. Counts the rows the emitter actually produced.
 *
 * The two MUST be computed independently or the check is a tautology. Path A deliberately does NOT
 * reuse the emitter's own type→cases map; it re-derives from the taxonomy, so that an emitter which
 * silently drops, duplicates, or over-widens rows shows up as a disagreement instead of agreeing
 * with itself.
 *
 * TOLERANCE IS ZERO. An earlier draft of the plan said "agree within a declared tolerance"; both
 * review providers convicted it, because it named no number and no one to declare it, so an executor
 * could set the tolerance to whatever made the run pass. A legitimate divergence is a NAMED, COUNTED
 * exemption with a reason — a taxonomy defect to fix, not slack to budget for. There is deliberately
 * no epsilon, no rounding, and no "close enough" branch in this file.
 *
 * THE GRID RULE (LR-065 / the 414-row correction). Owner directive, verbatim: "our goal is to test
 * all unique cases possible in all unique ways… if a grid has 100 rows, we dont repeat 1 test on
 * each!" A grid earns its behaviour cases ONCE. On the real 4107 Override manifest, 414 of 504
 * entries are `struct:tr|…` grid rows — counting them individually is precisely the inflation this
 * phase exists to remove.
 */

/** A grid-row entry key, e.g. `struct:tr|400Banners Design0.00|div/div/table/tbody`. */
const GRID_ROW_PREFIX = 'struct:tr';

/** Archetype-collapse suffix the enumerator appends, e.g. ` [archetype×14]`. */
const ARCHETYPE_SUFFIX_RE = /\s*\[archetype[×x](\d+)\]\s*$/u;

/**
 * Split entry keys into grid rows and standalone controls.
 * Grid rows are counted per-grid (see gridUnits), never per-row.
 */
export function partitionControls(derivedTypes) {
  const gridRowKeys = [];
  const controlKeys = [];
  for (const key of Object.keys(derivedTypes || {})) {
    (key.startsWith(GRID_ROW_PREFIX) ? gridRowKeys : controlKeys).push(key);
  }
  return { gridRowKeys, controlKeys };
}

/**
 * Collapse grid-row keys to the distinct grids they belong to.
 *
 * The DOM path (the segment after the last `|`) identifies the table; the row content between the
 * pipes is per-row data and is deliberately discarded — that discarding IS the 414→N correction.
 */
export function gridUnits(gridRowKeys) {
  const units = new Map();
  for (const key of gridRowKeys) {
    const bare = key.replace(ARCHETYPE_SUFFIX_RE, '');
    const domPath = bare.slice(bare.lastIndexOf('|') + 1).trim();
    const unit = domPath || bare;
    if (!units.has(unit)) units.set(unit, []);
    units.get(unit).push(key);
  }
  return units;
}

/** Index the taxonomy's §2 rows by their verbatim field-type label. */
function fieldTypeIndex(taxonomy) {
  const idx = new Map();
  for (const ft of taxonomy?.fieldTypes || []) {
    idx.set(ft.fieldType ?? ft.type ?? ft.name, ft);
  }
  return idx;
}

function caseCountFor(entry) {
  const cases = entry?.cases ?? entry?.caseList ?? null;
  if (Array.isArray(cases)) return cases.length;
  // Fall back to the four canonical §2 columns when the parser exposes them individually.
  return ['positive', 'boundary', 'negative', 'saveCycle']
    .reduce((n, col) => n + (entry?.[col] ? 1 : 0), 0);
}

/**
 * PATH A — expand every archetype on the surface to its case classes, per the §2/§3 taxonomy.
 *
 * A resolved control whose type has NO §2 template is a HARD FAILURE, never a silent zero and never
 * a quiet widening. Silent-zero is the entire disease this plan cures: it lets a surface look fully
 * covered precisely where the taxonomy has a hole.
 */
export function computePathA(derivedTypes, taxonomy, opts = {}) {
  const { gridRowKeys, controlKeys } = partitionControls(derivedTypes);
  const typeIdx = fieldTypeIndex(taxonomy);
  const widenedCaseCount = opts.widenedCaseCount ?? unionCaseCount(taxonomy);

  const byArchetype = new Map();
  const missingTemplates = [];
  let total = 0;

  const bump = (archetype, n) => {
    byArchetype.set(archetype, (byArchetype.get(archetype) || 0) + n);
    total += n;
  };

  for (const key of controlKeys) {
    const entry = derivedTypes[key];
    const declaredType = entry?.type ?? null;

    if (!entry?.resolved || declaredType === null) {
      // Unresolved: the widest possible set. Unknown must cost MORE work, never less.
      bump('UNRESOLVED', widenedCaseCount);
      continue;
    }

    const template = typeIdx.get(declaredType);
    if (!template) {
      // Resolved to a type the taxonomy does not template. This FAILS parity — it does not
      // contribute zero silently, and it does not get quietly widened into looking covered.
      missingTemplates.push({ key, declaredType });
      continue;
    }
    bump(declaredType, caseCountFor(template));
  }

  // §3 surface axis — each distinct grid earns its behaviour cases ONCE, not once per row.
  //
  // The taxonomy's 7 families (result-fidelity, pagination, sorting, combination, render-state,
  // empty-vol, persistence) COLLECTIVELY constitute the grid/list/table behaviour axis; there is no
  // single family literally named "grid". So a grid earns the sum of all of them, one time.
  const grids = gridUnits(gridRowKeys);
  const surfaceFamilies = taxonomy?.surfaceFamilies || [];
  const perGrid = surfaceFamilies.reduce((n, f) => n + caseCountFor(f), 0);
  for (const [unit, rows] of grids) {
    bump(`GRID:${unit}`, perGrid);
    byArchetype.set(`GRID:${unit}#rows`, rows.length);
  }

  return {
    total,
    byArchetype,
    missingTemplates,
    gridCount: grids.size,
    gridRowCount: gridRowKeys.length,
    perGridCases: perGrid,
    widenedCaseCount,
  };
}

/**
 * The "widest possible set" an unresolved control costs.
 *
 * This must match the emitter's definition (`taxonomy.fieldTypes.flatMap(ft => ft.cases)` —
 * emit-case-rows.mjs:188): the UNION of every case across every field type, not the largest single
 * type. The two paths are computed independently, but they must share this DEFINITION — otherwise
 * the check reports a disagreement that is only an arithmetic difference between the two authors,
 * which would bury the real signal under noise.
 */
function unionCaseCount(taxonomy) {
  return (taxonomy?.fieldTypes || []).reduce((n, ft) => n + caseCountFor(ft), 0);
}

/** PATH B — census of the rows the emitter actually produced. */
export function computePathB(caseRows) {
  const byArchetype = new Map();
  for (const row of caseRows || []) {
    const k = row.field_type ?? 'UNRESOLVED';
    byArchetype.set(k, (byArchetype.get(k) || 0) + 1);
  }
  return { total: (caseRows || []).length, byArchetype };
}

/**
 * Reconcile the two paths at ZERO tolerance.
 *
 * Both numbers are always reported, whether or not they agree — an unprinted number is one nobody
 * can audit, and the 37-vs-79 disagreement survived exactly because neither figure was shown beside
 * the other.
 */
export function reconcile(pathA, pathB, opts = {}) {
  const reasons = [];
  const exemptions = opts.exemptions || [];

  for (const { key, declaredType } of pathA.missingTemplates) {
    reasons.push(
      `PARITY missing §2 template for archetype "${declaredType}" (entry ${key}) — ` +
      `an archetype present on the surface with no template FAILS rather than contributing zero silently`
    );
  }

  if (pathA.total !== pathB.total) {
    const diffs = [];
    const archetypes = new Set([...pathA.byArchetype.keys(), ...pathB.byArchetype.keys()]);
    for (const a of archetypes) {
      if (a.endsWith('#rows')) continue;
      const av = pathA.byArchetype.get(a) || 0;
      const bv = pathB.byArchetype.get(a) || 0;
      if (av !== bv) diffs.push(`${a} (A=${av} B=${bv})`);
    }
    const named = exemptions.map(e => e.archetype);
    const unexempt = diffs.filter(d => !named.some(n => d.startsWith(n)));
    if (unexempt.length > 0 || exemptions.length === 0) {
      reasons.push(
        `PARITY Path A (${pathA.total}) != Path B (${pathB.total}) — tolerance is ZERO. ` +
        `Differing archetypes: ${diffs.length ? diffs.join('; ') : '(totals differ with no per-archetype split)'}`
      );
    }
  }

  return {
    pass: reasons.length === 0,
    reasons,
    pathATotal: pathA.total,
    pathBTotal: pathB.total,
    exemptions,
    report:
      `DENOMINATOR PARITY: PathA=${pathA.total} PathB=${pathB.total} ` +
      `grids=${pathA.gridCount} gridRows=${pathA.gridRowCount} (earned once each, not per row) ` +
      `missingTemplates=${pathA.missingTemplates.length} exemptions=${exemptions.length}`,
  };
}

/** Convenience: run both paths and reconcile. */
export function checkCaseParity(derivedTypes, caseRows, taxonomy, opts = {}) {
  const a = computePathA(derivedTypes, taxonomy, opts);
  const b = computePathB(caseRows);
  return { ...reconcile(a, b, opts), pathA: a, pathB: b };
}
