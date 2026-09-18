#!/usr/bin/env node
// scripts/walk-coverage/drone-probes.mjs
// PLAN_FORCED_DISCOVERY_LOCATOR_EXHAUSTION Phase 1 — Drone probe definitions per element class.
//
// Each definition is a deterministic playwright-cli sequence template.
// Tier-0 drones (cheapest models, ≤15 locators/batch) execute these verbatim
// and emit strict JSON facts — no prose, no conclusions.
//
// Effect observables are class-specific (plan lines 56-59).
// R4: every probe MUST emit a record — silence is structurally forbidden.
// R3: context-selector probes MUST name a second independent source.
//
// ESM, Node >=18. Matches repo script style.

/**
 * @typedef {object} ProbeDefinition
 * @property {string} class - Element class name
 * @property {string[]} requiredActions - Deterministic actions to execute
 * @property {string} effectObservable - What effectObserved measures
 * @property {string} zeroEffectProtocol - What to do on zero-delta
 * @property {string} emissionContract - R4 emission requirement
 * @property {string} [secondSourceContract] - R3 requirement (context-selector only)
 */

/** @type {Record<string, ProbeDefinition>} */
export const PROBE_DEFINITIONS = {
  'filter': {
    class: 'filter',
    requiredActions: [
      'record-baseline: count rows visible (API/footer, not DOM)',
      'toggle-filter-on: activate the filter (check checkbox / select option)',
      'record-after-on: count rows visible',
      'toggle-filter-off: deactivate the filter (uncheck / reset)',
      'record-after-off: count rows visible',
      'assert: before == after-off (reversibility)',
    ],
    effectObservable: 'row-count delta between filter states',
    zeroEffectProtocol: 'Zero-delta auto-files as structured suspicion; disposition becomes DIFFERENTIAL-DATA-REQUIRED; fires data-doctrine ladder (self-produce other-side state → self-serve hunt → escalate)',
    emissionContract: 'PROBED with effectObserved:boolean and probes[] containing before/after row counts. Zero-delta is never terminal.',
  },

  'sort': {
    class: 'sort',
    requiredActions: [
      'record-baseline: read first visible cell content in the sort column',
      'click-sort-asc: activate ascending sort on the column',
      'record-after-asc: read first visible cell content',
      'click-sort-desc: activate descending sort',
      'record-after-desc: read first visible cell content',
      'assert: at least one of asc/desc differs from baseline (order changed)',
    ],
    effectObservable: 'first-cell content delta between sort directions',
    zeroEffectProtocol: 'If all identical — data may be single-row or all-same-value. File suspicion if row count > 1.',
    emissionContract: 'PROBED with effectObserved:boolean per column.',
  },

  'pagination': {
    class: 'pagination',
    requiredActions: [
      'record-baseline: read page indicator (e.g. "Page 1 of 5") + first row content',
      'click-next: go to next page',
      'record-after-next: read page indicator + first row content',
      'assert: page indicator changed AND first row differs',
      'if-rows-per-page-control: change rows-per-page value and verify row count updates',
    ],
    effectObservable: 'page-indicator delta + first-row content delta',
    zeroEffectProtocol: 'If page does not change, office may lack sufficient rows. Emit DATA-BLOCKED with unlock naming the required row count.',
    emissionContract: 'PROBED with effectObserved:boolean, or DATA-BLOCKED with reason + unlock.',
  },

  'editable-cell': {
    class: 'editable-cell',
    requiredActions: [
      'record-baseline: read current cell value',
      'click-cell: activate edit mode (cell becomes input)',
      'type-value: enter a new value',
      'commit: press Enter or Tab to commit',
      'assert: cell shows new value',
      'save: click Save button',
      'verify-persist: reload page and verify value persisted',
      'restore: revert to original value + save',
    ],
    effectObservable: 'dirty-flag + Save-enable delta; persisted value after reload',
    zeroEffectProtocol: 'N/A — edit always has observable effect (cell value change).',
    emissionContract: 'PROBED with effectObserved:boolean.',
  },

  'guard': {
    class: 'guard',
    requiredActions: [
      'make-dirty: edit any field to create unsaved changes',
      'navigate-away: attempt to leave the page (click a nav link)',
      'assert-prompt: dirty-state prompt/dialog appears',
      'click-stay: choose to stay on the page',
      'assert: still on the same page with changes intact',
      'navigate-away-again: attempt to leave again',
      'click-leave: choose to leave',
      'assert: navigated away, changes discarded',
    ],
    effectObservable: 'prompt appearance + both prompt actions (stay/leave) honored',
    zeroEffectProtocol: 'If no prompt appears after dirty edit + navigate-away → file as BUG-CONFIRMED (missing guard).',
    emissionContract: 'PROBED with effectObserved:boolean. Navigate-away is mandatory (not deferred to DEEP).',
  },

  'io': {
    class: 'io',
    requiredActions: [
      'export: trigger the export action (button click)',
      'assert-export: file downloaded or download dialog appeared',
      'record-export-content: read the exported file (CSV/XLSX columns, row count)',
      'import: open the import dialog',
      'upload-exported-file: use the exported file as import input',
      'assert-round-trip: import accepts the system\'s own output (I9 invariant)',
    ],
    effectObservable: 'download fired (export) + file accepted (import round-trip)',
    zeroEffectProtocol: 'If export produces no file → suspicion. If import rejects own export → BUG-CONFIRMED (NM-1940 class).',
    emissionContract: 'PROBED or DATA-BLOCKED. Round-trip is the primary assertion.',
  },

  'menu-disclosure': {
    class: 'menu-disclosure',
    requiredActions: [
      'open-menu: click the menu/disclosure trigger',
      'enumerate-items: list ALL visible menu items',
      'for-each-state-changing-item: exercise the action + verify effect + restore',
      'reset-restore-default: if a reset/restore-default item exists, it is a MANDATORY probe — exercise it and verify all settings revert to defaults',
      'close-menu: dismiss the menu',
    ],
    effectObservable: 'per-item: state change observed + restored. Reset item: all settings revert.',
    zeroEffectProtocol: 'Omitting a reset item while exercising other menu items is a partial-implementation gap.',
    emissionContract: 'PROBED per item. Each menu item individually emitted: PROBED, DATA-BLOCKED, or UNCLASSIFIED.',
  },

  'add-picker': {
    class: 'add-picker',
    requiredActions: [
      'open-add-flow: click the add/create button',
      'assert-dialog: add dialog/form appears',
      'fill-required-fields: populate required fields with valid data',
      'commit: submit/save the new record',
      'assert-created: new record appears in the list/grid',
      'or-emit-deferral: if user-authorized deferral, emit with authorization reference',
    ],
    effectObservable: 'new record visible in list after commit',
    zeroEffectProtocol: 'If flow cannot complete → DATA-BLOCKED or USER-AUTHORIZED-DEFERRAL.',
    emissionContract: 'PROBED or DATA-BLOCKED or USER-AUTHORIZED-DEFERRAL.',
  },

  'context-selector': {
    class: 'context-selector',
    requiredActions: [
      'record-baseline: note current scope (e.g. current office ID) + grid content summary',
      'open-selector: click the scope-changing control (e.g. Change Local Office)',
      'enumerate-options: list ALL options the selector offers',
      'cross-check-options: compare option set against a SECOND INDEPENDENT SOURCE (R3)',
      'select-different: choose a different scope option',
      'assert-scope-change: entire data context replaced (grid content changed)',
      'record-after: note new scope + grid content summary',
    ],
    effectObservable: 'entire data context replaced — grid content delta across scope switch',
    zeroEffectProtocol: 'If scope switch produces no content change → suspicion (may be same data across scopes, or selector is non-functional).',
    emissionContract: 'PROBED with effectObserved:boolean + secondSource:{type, ref}. Missing secondSource = R3 schema rejection.',
    secondSourceContract: 'The selector\'s own option set MUST be cross-checked against a second, independent source. The selector is not permitted to be its own oracle. The second source must be named (API list, sibling screen, export, DB count). A context-selector record whose option set cites no second source is rejected by the schema.',
  },

  // ---------------------------------------------------------------------------
  // Oracle 2 — UI-vs-persisted parity
  // Cross-Check Kernel oracle 2: after every io/save/import probe outcome (success OR error),
  // reload and re-read persisted state. UI claim ≠ server state = suspicion (NM-2186 class).
  // Both directions are mandatory — a commit-only implementation is vacuous.
  // Schema field populated: persistedStateReRead { agrees: boolean, ... }
  // ---------------------------------------------------------------------------
  'ui-vs-persisted-parity': {
    class: 'ui-vs-persisted-parity',
    requiredActions: [
      // COMMIT direction — verify state landed
      'commit-record-ui-claim: after the save/import action completes (success OR error toast), record the UI\'s claimed state (field values, record counts, visible confirmations)',
      'commit-reload: perform a hard reload of the page (do not rely on in-memory state)',
      'commit-read-persisted: re-read the same fields/counts from the freshly loaded page',
      'commit-assert-parity: compare UI claim vs persisted read — if they disagree, emit UI-VS-PERSISTED VIOLATION; agreement is persistedStateReRead:{agrees:true}',
      // DISCARD direction — verify nothing persisted
      'discard-record-ui-state: after a deliberate no-save walk (form abandoned, dialog dismissed, guard-leave taken), record what the UI showed before navigation',
      'discard-reload: perform a hard reload',
      'discard-read-persisted: re-read the same fields/counts',
      'discard-assert-inverse: verify the discarded change is absent from persisted state — if the change persisted, emit UI-VS-PERSISTED VIOLATION (discard direction); absence confirmed is persistedStateReRead:{agrees:true, direction:"discard"}',
    ],
    effectObservable: 'persistedStateReRead.agrees — true means UI claim and server state agree; false triggers automatic suspicion filing. Both commit (state landed) and discard (nothing persisted) directions must be reported.',
    zeroEffectProtocol: 'Not applicable — a disagreement is never a zero-effect; it is a violation. An absent persistedStateReRead is UNCHECKABLE, not PASS.',
    emissionContract: 'PROBED with persistedStateReRead:{agrees:boolean} for each direction exercised. Missing persistedStateReRead after any io/save/import outcome = oracle 2 UNCHECKABLE (schema treats absent as neither pass nor fail). A commit-direction record without a corresponding discard-direction record on the same surface is a partial-oracle gap.',
  },

  // ---------------------------------------------------------------------------
  // Oracle 5 — Claim-vs-data census
  // Cross-Check Kernel oracle 5: any external claim consumed by a walk (client statement,
  // Jira status, prior artifact) MUST be verified against machine-readable data before it
  // steers a disposition (1117 + NM-2011 class).
  // The census runs BEFORE the claim influences a disposition — not as a post-hoc audit.
  // Schema field populated: basis — must be census:<artifact>, not claim:<source>, after
  // census evidence is gathered.
  // ---------------------------------------------------------------------------
  'claim-census': {
    class: 'claim-census',
    requiredActions: [
      'identify-claim: record the external claim verbatim (client statement, Jira ticket text, prior artifact assertion, spec statement)',
      'identify-claim-source: note the origin (Jira-ID, Confluence URL, email, prior artifact path)',
      'collect-machine-data: BEFORE the claim steers any disposition, gather machine-readable counter-evidence (tenant export, live API response, second UI surface, DB count, network log)',
      'cross-check: compare claim against machine data — agreement, partial match, or disagreement',
      'record-census-artifact: save the raw machine-readable evidence as a named artifact (the census:<artifact> basis value)',
      'disposition-gate: only after census evidence is in hand may the disposition be set — a claim-driven disposition with no census artifact is a CLAIM-CENSUS VIOLATION',
    ],
    effectObservable: 'census evidence artifact exists and is cited in basis:census:<artifact>; claim-vs-data agreement is documented before disposition is set',
    zeroEffectProtocol: 'If no machine-readable data source is available to cross-check the claim, emit DATA-BLOCKED with dataBlockedReason naming the claim and dataBlockedUnlock naming what data source would enable the census. A disposition driven by an unchecked claim is never acceptable.',
    emissionContract: 'PROBED with basis:census:<artifact-path> referencing a real, named artifact that contains the machine data used to verify the claim. basis:claim:<source> alone (without a corresponding census artifact) means the census has not run — the checker treats it as a CLAIM-CENSUS VIOLATION. The census step is mandatory; it fires before the disposition, not after.',
  },

  // ---------------------------------------------------------------------------
  // Oracle 4 — Count source (I7)
  // Cross-Check Kernel oracle 4: row counts must come from the API response body
  // or grid/table footer — never from enumerating rendered DOM rows. The grid
  // virtualizes: the DOM holds a window, not the full set.
  // The HTTP status of the request that produced the count is load-bearing:
  //   absent status  → UNCHECKABLE (the request may have silently failed)
  //   non-2xx status → REQUEST-FAILED (office-1604 class: HTTP 500 renders as
  //                    "0 items found", visually identical to a genuinely empty
  //                    result)
  // Only a 2xx-sourced count is a real measurement.
  // Schema field populated: countObservation { value, source, httpStatus }
  // ---------------------------------------------------------------------------
  'count-source': {
    class: 'count-source',
    requiredActions: [
      'identify-count-surface: locate the count display — API response body field OR grid/table footer text; DOM row enumeration is forbidden (virtualization means DOM holds a window, not the full set)',
      'record-source-request: identify the HTTP request whose response body or footer value produced the count; record its URL and the observed HTTP status code',
      'gate-on-absent-status: if the HTTP status is absent (not observable), emit UNCHECKABLE with reason naming the missing status; do not proceed to record a count value',
      'gate-on-non-2xx-status: if the HTTP status is non-2xx, emit REQUEST-FAILED with the status code and URL; do not treat the count value as a measurement',
      'record-count: only on 2xx — read the count value from the API response field or footer text; never by enumerating rendered DOM nodes',
      'assert-source-discipline: confirm the count source is "api-response" or "footer", never "dom"; a DOM-sourced count is a schema violation regardless of status',
    ],
    effectObservable: 'count value paired with its source HTTP status; absent status routes to UNCHECKABLE; non-2xx routes to REQUEST-FAILED; only a 2xx-sourced count is a real measurement',
    zeroEffectProtocol: 'A zero count whose source status is absent is UNCHECKABLE — the request may have silently failed. A zero count whose source status is non-2xx is REQUEST-FAILED (office-1604 class: HTTP 500 renders as "0 items found", visually identical to a genuinely empty result). A zero count with a confirmed 2xx status is a valid (empty) measurement.',
    emissionContract: 'PROBED with countObservation:{value:number, source:"api-response"|"footer", httpStatus:number}. Absent httpStatus → UNCHECKABLE. Non-2xx httpStatus → REQUEST-FAILED. source:"dom" → schema rejection. A count record missing httpStatus is treated as UNCHECKABLE, not PASS.',
  },
};

/**
 * Get the probe definition for an element class.
 * @param {string} elementClass
 * @returns {ProbeDefinition | null}
 */
export function getProbeDefinition(elementClass) {
  return PROBE_DEFINITIONS[elementClass] || null;
}

/**
 * List all supported element classes.
 * @returns {string[]}
 */
export function listClasses() {
  return Object.keys(PROBE_DEFINITIONS);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const scriptName = 'drone-probes.mjs';
const isMain = process.argv[1]?.endsWith(scriptName) || process.argv[1]?.endsWith('drone-probes');

if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--list') {
    console.log('Supported element classes:');
    for (const [cls, def] of Object.entries(PROBE_DEFINITIONS)) {
      console.log(`  ${cls}: ${def.requiredActions.length} actions, effect=${def.effectObservable.slice(0, 60)}...`);
    }
    process.exit(0);
  } else if (args[0] === '--class' && args[1]) {
    const def = getProbeDefinition(args[1]);
    if (!def) {
      console.error(`Unknown class "${args[1]}". Use --list to see supported classes.`);
      process.exit(1);
    }
    console.log(JSON.stringify(def, null, 2));
    process.exit(0);
  } else {
    console.log(`Usage:\n  node ${scriptName} --list\n  node ${scriptName} --class <element-class>`);
    process.exit(1);
  }
}
