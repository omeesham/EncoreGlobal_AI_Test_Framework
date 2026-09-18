#!/usr/bin/env node
// scripts/walk-coverage/generate-invariants.mjs
// PLAN_FORCED_DISCOVERY_LOCATOR_EXHAUSTION Phase 1 — Generative CRUD-Invariant Oracle.
//
// Input:  --metamodel <path.json>  Surface metamodel describing its CRUD shape
//         --domain   <path.json>   Optional domain-specific invariants (alongside CRUD set)
// Output: REQUIRED-INVARIANT SET to stdout (JSON).
//
// Each generated invariant row carries which metamodel feature triggered it,
// so the mapping is auditable — not asserted.
//
// The generator's denominator (I1–I11) is the Tier-2 judge's coverage floor.
// A surface is covered when every invariant its own shape implies has a disposition.
//
// ESM, Node >=18. Matches repo script style.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Default corpus — auto-loaded when no --domain flag is given.
const DEFAULT_DOMAIN_INVARIANTS_PATH = resolve(__dirname, 'domain-invariants.json');

export const GENERATOR_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// I1–I11 invariant catalog (plan lines 211-223)
// ---------------------------------------------------------------------------

export const INVARIANT_CATALOG = {
  I1:  { id: 'I1',  name: 'filter-partition',          description: 'Both filter directions asserted; zero-delta → differential-data ladder' },
  I2:  { id: 'I2',  name: 'sort-reorder',              description: 'Order actually changes, per sortable column' },
  I3:  { id: 'I3',  name: 'read-totality',             description: 'GET-detail over enumerated id set from list/export; no 404/500 on listed ids' },
  I4:  { id: 'I4',  name: 'create-readback',           description: 'Created record readable immediately via GET (read-your-writes)' },
  I5:  { id: 'I5',  name: 'update-persist',            description: 'Updated value persists across reload + re-read' },
  I6:  { id: 'I6',  name: 'delete-removal',            description: 'Deleted record removed + referential integrity across dependent lists' },
  I7:  { id: 'I7',  name: 'count-source',              description: 'Row counts from API/footer, never DOM nodes (virtualization-safe); source request must have returned 2xx — absent status is not evidence of success, non-2xx count is not a measurement' },
  I8:  { id: 'I8',  name: 'status-flag-reachability',  description: 'Both flag states present in data; flag partitions every honoring list' },
  I9:  { id: 'I9',  name: 'io-round-trip',             description: "System's own output accepted by its own input" },
  I10: { id: 'I10', name: 'field-domain',              description: 'FCC axis: equivalence partitioning + BVA per typed field' },
  I11: { id: 'I11', name: 'claim-census',              description: 'External claim cross-checked against machine-enumerable data' },
};

// ---------------------------------------------------------------------------
// Domain-invariant surface filter
// ---------------------------------------------------------------------------
// Rule: a domain invariant from the corpus applies to a metamodel surface when
//   (a) the invariant's `surface` field exactly matches the metamodel's `surface` field, OR
//   (b) the metamodel's `domainScopes` array explicitly includes the invariant's `surface`.
//
// Invariants with no `surface` field are never matched (no surface = unknown scope).
// Rows flagged `harvestLevel: "summary-only"` or `verificationStatus: "SEARCHED-NOT-FOUND"`
// are carried through intact — callers must NOT treat them as verified without resolving
// the flag. They are emitted under `domainInvariants` with those flags visible so a
// downstream consumer can see them and make an informed disposition.
//
// @param {object} corpus - Parsed domain-invariants.json (must have `.invariants` array)
// @param {object} metamodel - Surface metamodel
// @returns {Array} Filtered, surface-matched domain invariant rows tagged invariantKind:'domain'
export function filterDomainInvariants(corpus, metamodel) {
  if (!corpus || !Array.isArray(corpus.invariants)) return [];
  const scopes = new Set(
    [metamodel.surface, ...(Array.isArray(metamodel.domainScopes) ? metamodel.domainScopes : [])].filter(Boolean)
  );
  if (scopes.size === 0) return [];
  return corpus.invariants
    .filter(inv => inv.surface && scopes.has(inv.surface))
    .map(inv => ({ ...inv, invariantKind: 'domain' }));
}

// ---------------------------------------------------------------------------
// Generator: metamodel → required invariant set
// ---------------------------------------------------------------------------

/**
 * @param {object} metamodel - Surface metamodel (see sample-metamodel.json)
 * @param {Array}  domainInvariants - Optional domain-specific invariants
 * @returns {object} { surface, crudInvariants[], domainInvariants[], invariantCount }
 */
export function generateInvariants(metamodel, domainInvariants = []) {
  const m = metamodel;
  const invariants = [];

  // I1 — any filter/toggle present
  if (Array.isArray(m.filters) && m.filters.length > 0) {
    for (const f of m.filters) {
      invariants.push({
        ...INVARIANT_CATALOG.I1,
        triggerFeature: `filter:${f.id || f.name}`,
        triggerDetail: f,
      });
    }
  }

  // I2 — any sortable column
  if (Array.isArray(m.sortableColumns) && m.sortableColumns.length > 0) {
    for (const col of m.sortableColumns) {
      invariants.push({
        ...INVARIANT_CATALOG.I2,
        triggerFeature: `sortable-column:${typeof col === 'string' ? col : col.id || col.name}`,
        triggerDetail: col,
      });
    }
  }

  // I3 — Read verb + id source
  if (m.verbs?.read && Array.isArray(m.idSources) && m.idSources.length > 0) {
    invariants.push({
      ...INVARIANT_CATALOG.I3,
      triggerFeature: `read-verb+id-sources:[${m.idSources.join(',')}]`,
      triggerDetail: { verb: m.verbs.read, idSources: m.idSources },
    });
  }

  // I4 — Create verb
  if (m.verbs?.create) {
    invariants.push({
      ...INVARIANT_CATALOG.I4,
      triggerFeature: `create-verb:${typeof m.verbs.create === 'string' ? m.verbs.create : 'present'}`,
      triggerDetail: m.verbs.create,
    });
  }

  // I5 — Update verb
  if (m.verbs?.update) {
    invariants.push({
      ...INVARIANT_CATALOG.I5,
      triggerFeature: `update-verb:${typeof m.verbs.update === 'string' ? m.verbs.update : 'present'}`,
      triggerDetail: m.verbs.update,
    });
  }

  // I6 — Delete verb
  if (m.verbs?.delete) {
    invariants.push({
      ...INVARIANT_CATALOG.I6,
      triggerFeature: `delete-verb:${typeof m.verbs.delete === 'string' ? m.verbs.delete : 'present'}`,
      triggerDetail: m.verbs.delete,
    });
  }

  // I7 — any list/grid
  if (Array.isArray(m.grids) && m.grids.length > 0) {
    for (const g of m.grids) {
      invariants.push({
        ...INVARIANT_CATALOG.I7,
        triggerFeature: `grid:${g.id || g.name}`,
        triggerDetail: g,
      });
    }
  }

  // I8 — any status flag
  if (Array.isArray(m.statusFlags) && m.statusFlags.length > 0) {
    for (const flag of m.statusFlags) {
      invariants.push({
        ...INVARIANT_CATALOG.I8,
        triggerFeature: `status-flag:${flag.id || flag.name}`,
        triggerDetail: flag,
      });
    }
  }

  // I9 — any import+export pair
  if (Array.isArray(m.ioPairs) && m.ioPairs.length > 0) {
    for (const pair of m.ioPairs) {
      invariants.push({
        ...INVARIANT_CATALOG.I9,
        triggerFeature: `io-pair:${pair.export}->${pair.import}`,
        triggerDetail: pair,
      });
    }
  }

  // I10 — any typed field
  if (Array.isArray(m.typedFields) && m.typedFields.length > 0) {
    for (const field of m.typedFields) {
      invariants.push({
        ...INVARIANT_CATALOG.I10,
        triggerFeature: `typed-field:${field.id || field.name}(${field.type})`,
        triggerDetail: field,
      });
    }
  }

  // I11 — any consumed claim
  if (Array.isArray(m.consumedClaims) && m.consumedClaims.length > 0) {
    for (const claim of m.consumedClaims) {
      invariants.push({
        ...INVARIANT_CATALOG.I11,
        triggerFeature: `claim:${claim.source || claim.id}`,
        triggerDetail: claim,
      });
    }
  }

  // Fail-closed: if metamodel has features we couldn't classify, emit UNCLASSIFIED
  if (Array.isArray(m.unclassifiedFeatures) && m.unclassifiedFeatures.length > 0) {
    for (const uf of m.unclassifiedFeatures) {
      invariants.push({
        id: 'UNCLASSIFIED',
        name: 'loud-unknown',
        description: 'Feature could not be classified into any I1-I11 invariant — blocks closure',
        triggerFeature: `unclassified:${uf.id || uf.description}`,
        triggerDetail: uf,
      });
    }
  }

  return {
    generatorVersion: GENERATOR_VERSION,
    surface: m.surface || '(unnamed)',
    metamodelVersion: m.version || '(unversioned)',
    invariantCount: invariants.length + domainInvariants.length,
    crudInvariantCount: invariants.length,
    domainInvariantCount: domainInvariants.length,
    crudInvariants: invariants.map(inv => ({ ...inv, invariantKind: 'crud' })),
    domainInvariants: domainInvariants.map(inv => ({ ...inv, invariantKind: inv.invariantKind ?? 'domain' })),
  };
}

// ---------------------------------------------------------------------------
// Superset proof: 5 kernel oracles ⊆ generated invariant set
// ---------------------------------------------------------------------------
// The 5 kernel oracles are defined in check-interaction-coverage.mjs (off-limits,
// CEO-verified 67/67). Each entry here captures the oracle's semantic domain and a
// triggerFeature prefix pattern. The INVARIANT ID covering each oracle is discovered
// from the generator's actual output — never hardcoded.

const KERNEL_ORACLES = [
  {
    id: 'kernel-1',
    name: 'zero-effect-disposition',
    bugClass: '1222',
    subsumption: 'Filter-partition both-directions check catches dead-filter zero-delta class',
    triggerPattern: /^filter:/,
  },
  {
    id: 'kernel-2',
    name: 'ui-vs-persisted-parity',
    bugClass: 'NM-2186',
    subsumption: 'Update-persist reload+re-read catches UI-vs-persisted disagreement',
    triggerPattern: /^update-verb:/,
  },
  {
    id: 'kernel-3',
    name: 'round-trip-invariant',
    bugClass: 'NM-1940',
    subsumption: 'IO round-trip own-output-accepted catches rejected-export class',
    triggerPattern: /^io-pair:/,
  },
  {
    id: 'kernel-4',
    name: 'count-source',
    bugClass: 'NM-2172',
    subsumption: 'Count-source API/footer-not-DOM catches virtualization false-read',
    triggerPattern: /^grid:/,
  },
  {
    id: 'kernel-5',
    name: 'claim-census-1117',
    bugClass: '1117',
    subsumption: 'Claim-census external-vs-machine catches unchecked-claim class (1117: "has data" = empty)',
    triggerPattern: /^claim:/,
  },
  {
    id: 'kernel-6',
    name: 'claim-census-nm2011',
    bugClass: 'NM-2011',
    subsumption: 'Claim-census external-vs-machine catches unchecked-claim class (NM-2011: Jira status vs live behavior)',
    triggerPattern: /^claim:/,
  },
  {
    id: 'kernel-7',
    name: 'read-totality-1604',
    bugClass: 'office-1604',
    subsumption: 'Read-totality census over enumerated id-set catches 500/404 on listed records — I3 subsumes office-1604 as a read-totality obligation',
    triggerPattern: /^read-verb\+id-sources:/,
  },
];

function runSupersetProof() {
  console.log('=== SUPERSET PROOF: kernel oracles ⊆ generated invariant set ===\n');

  // Step 1: Rich metamodel exercising every shape from the plan's I1-I11 table
  console.log('[step 1] Constructing rich metamodel M (filter, CRUD verbs, grid, io pair, status flag, claims, typed fields)...');
  const richM = {
    surface: 'superset-proof-rich',
    version: '1.0.0',
    filters: [{ id: 'status-filter', name: 'Active toggle', type: 'boolean' }],
    sortableColumns: [{ id: 'name-col', name: 'Name' }],
    verbs: {
      create: 'POST /api/records',
      read: 'GET /api/records/:id',
      update: 'PUT /api/records/:id',
      delete: 'DELETE /api/records/:id',
    },
    idSources: ['list', 'export'],
    grids: [{ id: 'main-grid', name: 'Records List' }],
    statusFlags: [{ id: 'active-flag', name: 'isActive' }],
    ioPairs: [{ export: 'csv-export', import: 'csv-import' }],
    typedFields: [
      { id: 'name-field', name: 'Name', type: 'string' },
      { id: 'date-field', name: 'CreatedDate', type: 'date' },
    ],
    consumedClaims: [{ id: 'external-count', source: 'third-party-api' }],
  };

  // Step 2: Generate from rich M
  console.log('[step 2] Generating invariant set from rich M...');
  let richResult;
  try {
    richResult = generateInvariants(richM);
  } catch (err) {
    console.error(`FAIL: Generator threw on rich M: ${err.message}`);
    process.exit(1);
  }
  if (!richResult || richResult.crudInvariantCount === 0) {
    console.error('FAIL: Generator produced 0 invariants for rich M — fail-closed.');
    process.exit(1);
  }
  const richIds = [...new Set(richResult.crudInvariants.map(i => i.id))].sort();
  console.log(`  Generated ${richResult.crudInvariantCount} CRUD invariants (unique IDs: ${richIds.join(', ')})`);

  // Step 3: Check containment — each kernel oracle must have a covering generated invariant
  console.log('\n[step 3] Checking containment: kernel oracle → generated invariant...\n');
  const mapping = [];
  const uncovered = [];

  for (const oracle of KERNEL_ORACLES) {
    const hits = richResult.crudInvariants.filter(inv => oracle.triggerPattern.test(inv.triggerFeature));
    if (hits.length > 0) {
      const hitIds = [...new Set(hits.map(h => h.id))];
      mapping.push({ oracle: oracle.id, oracleName: oracle.name, coveredBy: hitIds.join(', '), count: hits.length });
      console.log(`  OK ${oracle.id} (${oracle.name}) -> ${hitIds.join(', ')} [${hits.length} instance(s)]`);
      console.log(`     subsumption: ${oracle.subsumption}`);
    } else {
      uncovered.push(oracle);
      console.log(`  XX ${oracle.id} (${oracle.name}) -> NOT COVERED`);
    }
  }

  // Step 4: Minimal metamodel — read-only, no filter, no grid, no io, no claims
  console.log('\n[step 4] Constructing minimal metamodel (read-only, no filter/grid/io/claims)...');
  const minimalM = {
    surface: 'superset-proof-minimal',
    version: '1.0.0',
    filters: [],
    sortableColumns: [],
    verbs: { read: 'GET /api/item/:id' },
    idSources: ['direct-link'],
    grids: [],
    statusFlags: [],
    ioPairs: [],
    typedFields: [{ id: 'title', name: 'Title', type: 'string' }],
    consumedClaims: [],
  };

  let minResult;
  try {
    minResult = generateInvariants(minimalM);
  } catch (err) {
    console.error(`FAIL: Generator threw on minimal M: ${err.message}`);
    process.exit(1);
  }
  const minIds = [...new Set(minResult.crudInvariants.map(i => i.id))].sort();
  console.log(`  Generated ${minResult.crudInvariantCount} CRUD invariants (unique IDs: ${minIds.join(', ')})`);

  const richCount = richResult.crudInvariantCount;
  const minCount = minResult.crudInvariantCount;
  const countDiffers = richCount > minCount;

  // Step 5: Print final results
  console.log('\n' + '='.repeat(70));
  console.log('CONTAINMENT_TABLE:');
  for (const row of mapping) {
    console.log(`  ${row.oracle} (${row.oracleName}) -> ${row.coveredBy}`);
  }
  for (const u of uncovered) {
    console.log(`  ${u.id} (${u.name}) -> UNCOVERED`);
  }

  console.log(`UNCOVERED_ORACLES: ${uncovered.length === 0 ? 'none' : uncovered.map(u => u.id + ' (' + u.name + ')').join(', ')}`);
  console.log(`RICH_M_INVARIANT_COUNT: ${richCount}`);
  console.log(`MINIMAL_M_INVARIANT_COUNT: ${minCount}`);
  console.log(`ANTI_HARDCODE: ${countDiffers ? 'PASS (rich ' + richCount + ' > minimal ' + minCount + ' — generation is shape-driven)' : 'FAIL (counts equal — generation may be a hardcoded list)'}`);

  const allCovered = uncovered.length === 0;
  const pass = allCovered && countDiffers;

  if (pass) {
    console.log('SUPERSET_PROOF: PASS');
  } else {
    const reasons = [];
    if (!allCovered) reasons.push(uncovered.length + ' oracle(s) uncovered');
    if (!countDiffers) reasons.push('anti-hardcode test failed');
    console.log('SUPERSET_PROOF: FAIL (' + reasons.join('; ') + ')');
  }

  process.exit(pass ? 0 : 1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const scriptName = 'generate-invariants.mjs';
const isMain = process.argv[1]?.endsWith(scriptName) || process.argv[1]?.endsWith('generate-invariants');

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--superset-proof')) {
    runSupersetProof();
  }

  let metamodelPath = null;
  let domainPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--metamodel' && args[i + 1]) metamodelPath = args[++i];
    if (args[i] === '--domain' && args[i + 1]) domainPath = args[++i];
  }

  if (!metamodelPath) {
    console.error(`Usage: node ${scriptName} --metamodel <path.json> [--domain <domain.json>] [--superset-proof]`);
    process.exit(1);
  }

  try {
    const metamodel = JSON.parse(readFileSync(metamodelPath, 'utf-8'));
    let domainRows = [];
    if (domainPath) {
      const raw = JSON.parse(readFileSync(domainPath, 'utf-8'));
      domainRows = filterDomainInvariants(raw, metamodel);
    } else if (existsSync(DEFAULT_DOMAIN_INVARIANTS_PATH)) {
      const raw = JSON.parse(readFileSync(DEFAULT_DOMAIN_INVARIANTS_PATH, 'utf-8'));
      domainRows = filterDomainInvariants(raw, metamodel);
    }
    const result = generateInvariants(metamodel, domainRows);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(`Generator failed: ${err.message}`);
    process.exit(2);
  }
}
