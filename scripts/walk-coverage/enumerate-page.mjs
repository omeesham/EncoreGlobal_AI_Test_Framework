#!/usr/bin/env node
// scripts/walk-coverage/enumerate-page.mjs
// PLAN_EXHAUSTIVE_WALK_GUARANTEE — Phase 1 enumerator.
//
// A standalone Playwright script (NOT `playwright-cli eval`) that produces the machine-enumerated
// walk DENOMINATOR for a live page: it shadow-pierces the DOM, tags every interactive element by
// Heuristic-A v2 + Heuristic-B (lib/deep-pierce.mjs), self-expands to a fixpoint (tabs/openers mount
// new DOM; the grid cascade-parent toggles enable children), runs a CDP `getEventListeners`
// G1-recovery pass to catch click-handler <div>/<span> that have no role/testid/tabindex, collapses
// homogeneous grid/virtualized rows to per-column archetypes, and emits both a JSON provenance file
// and a ready-to-paste `## Coverage Manifest` markdown block (M3).
//
// It is a Playwright SCRIPT precisely so it can open a CDPSession — page-context eval cannot reach
// `DOMDebugger.getEventListeners` (pilot F1). It reuses the canonical saved SSO session
// (.auth/encore-state.json); it does NOT reimplement login (avoids the raw-chromium
// anti-pattern, LR-054 Instance 3) and ABORTS on a login redirect rather than enumerating the login
// page as a bogus tiny denominator (adversarial-audit S1).
//
// Usage:
//   node scripts/walk-coverage/enumerate-page.mjs --office=1604 --module=pricing
//   node scripts/walk-coverage/enumerate-page.mjs --url=<full-url> --state=<label> [--no-cdp] [--headed]
//   npm run walk:enumerate -- --office=1604 --module=pricing
//
// Browser-tool: Playwright CLI/script family (LR-038 v2 / browser-tool.md). Unattended catalog walk.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inPageEnumerate, collapseArchetypes, setAlgebra, renderManifest, templateKey } from './lib/deep-pierce.mjs';
import { MODULE_CONFIG as MC_DATA } from './lib/module-config.mjs';
import { loadFieldCaseTaxonomy } from './lib/field-case-parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ---- CLI args -------------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return o;
}
const args = parseArgs(process.argv);

const DEFAULT_AUTH = join(REPO_ROOT, '.auth', 'encore-state.json');
const FALLBACK_AUTH = join(REPO_ROOT, '.auth', 'e2e-state.json');
const BASE = 'https://cloudapps-e2e.encoreglobal.com/navigator';

// Corporate Pricing live-verified pricebook fixtures (source: clients/encore .../data/corporate-pricing/common.ts
// CORPORATE_PRICING_FIXTURES). Override either with --pricebook=<guid> when a fixture rots. Used by the
// details-tab entries below to land on a real pricebook (the Details/Strategy/Detail screens require a guid).
const CPR_STRATEGY_GUID = '5f2a4088-9268-b033-4925-a48146afb1cb';  // 2022-NP Tier 1 (Active)  — Pricing Strategy fixture
const CPR_DETAIL_GUID   = '91acb5ca-20e2-ce8e-a9ab-8c370925fd65';  // 2021-PB6     (Inactive) — Pricing Detail fixture

// ---- guardrail-mode reader (LR-069 §3.3 ramp discipline) -----------------------------------
// Reads toothless_surface_mode from .claude/guardrail-config.json. Returns 'announce' on any
// read/parse failure (fail-safe: absent key → announce per §3.3 ramp discipline).
function readGuardrailMode() {
  const cfgPath = join(REPO_ROOT, '.claude', 'guardrail-config.json');
  try {
    const raw = readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.toothless_surface_mode || 'announce';
  } catch {
    return 'announce';
  }
}

// ---- per-module walk config (the M1 "per-module whitelist" for deterministic self-expand) ----
// Generic affordance-probe self-expand also runs (role=tab unselected, aria-expanded=false); the
// whitelist makes the validated pricing path deterministic + bounded.
export const MODULE_CONFIG = {
  pricing: {
    urlGroup: 'location-settings',
    path: (office) => `${BASE}/locations/${office}/settings/location`,
    // Activate the Radix sub-tab by TESTID, not role — the pilot proved getByRole did not flip the
    // sub-tab; the trusted testid click does (O2). After click, wait for a pricing-content marker to
    // mount (tab-switch O1 race) before enumerating.
    activateTabs: ['location-settings-sub-tab-pricing'],
    // Wait on the STRONG, last-to-render marker (the grid table) — NOT a cheap early match like
    // btn-effective-date, which returned before the 1117-element grid hydrated (live-found O1 race).
    contentMarker: '[data-testid="location-settings-table-secondary-pricing"]',
    openerTestidPatterns: [/toggle-settings-panel/i, /toggle-settings/i],
    cascadeParentTestidPatterns: [/is-alternate/i],
    excludeOptionRoles: true,                   // cmdk option lists are NOT denominator elements (M2)
    ...MC_DATA.pricing,
  },

  // ─── urlGroup example (for adding sibling sub-tabs that share pricing's URL) ───
  // To add another Location Settings sub-tab surface, declare:
  //   'location-<tab>': {
  //     urlGroup: 'location-settings',          // groups surfaces sharing a URL
  //     path: (office) => `${BASE}/locations/${office}/settings/location`,
  //     activateTabs: ['<real-data-testid>'],    // Radix sub-tab testid (MCP-verified)
  //     contentMarker: '[data-testid="<real>"]', // last-to-render marker (MCP-verified)
  //     openerTestidPatterns: [],
  //     excludeOptionRoles: true,
  //     requiredStates: [{ label: 'resting' }],
  //   },
  // When two+ entries share a urlGroup, --url alone exits 2 requiring --module.

  // ===========================================================================================
  // Corporate Pricing — 5 surfaces (RCA M2: applies the existing LR-062 enumerator to the module
  // whose Wave-1/1.5 walks were author-judgment, not machine-enumerated). Content markers are
  // text/role anchors because these screens ship near-zero data-testids (live audit 2026-06-05/08/09);
  // contentMarker is best-effort (the enumerator try/catches an absent marker and proceeds). The
  // `openerTestidPatterns` lists are EMPTY: these screens have no testid openers, so generic opener
  // clicking stays conservatively off (the resting + self-expand passes still enumerate the surface).
  // ===========================================================================================
  'corporate-pricing-search': {
    path: (office) => `${BASE}/locations/${office}/settings/corporate-pricing`,
    // The "N items found" footer paints BEFORE data (S1 race) — wait on a real results row, not the footer.
    contentMarker: 'tbody tr',
    openerTestidPatterns: [],
    // Role/text openers: Import ▾ and Export ▾ use Radix ids (no data-testid); matched by role+text.
    openerRoleTextPatterns: [
      { role: 'button', text: 'Import' },
      { role: 'button', text: 'Export' },
    ],
    excludeOptionRoles: true,
    ...MC_DATA['corporate-pricing-search'],
  },
  'corporate-pricing-strategy': {
    path: (office) => `${BASE}/locations/${office}/settings/corporate-pricing/details/${args.pricebook || CPR_STRATEGY_GUID}`,
    // Details tabs are TEXT buttons (no testid, aria-selected not exposed) → the enumerator's testid
    // tab-activation cannot flip tabs; this entry enumerates the DEFAULT Pricing Strategy tab. Use the
    // 'corporate-pricing-detail' entry for the Pricing Detail grid.
    contentMarker: 'text=Pricing Strategy',
    openerTestidPatterns: [],
    excludeOptionRoles: true,
    ...MC_DATA['corporate-pricing-strategy'],
  },
  'corporate-pricing-detail': {
    path: (office) => `${BASE}/locations/${office}/settings/corporate-pricing/details/${args.pricebook || CPR_DETAIL_GUID}`,
    // Same TEXT-tab caveat as strategy: the URL lands on the default Strategy tab. The "Pricing
    // Detail" tab is a text button with no data-testid and aria-selected is not exposed, so neither
    // activateTabs nor openerRoleTextPatterns is configured to click it. This entry therefore
    // enumerates only the elements visible on the default (Strategy) tab load — the Pricing Detail
    // GRID is NOT enumerated. GAP: to enumerate the Pricing Detail grid a role+text opener entry
    // ({ role: 'tab', text: 'Pricing Detail' }) must be added to openerRoleTextPatterns and
    // verified against the live page before enabling.
    contentMarker: 'text=Pricing Detail',
    openerTestidPatterns: [],
    excludeOptionRoles: true,
    ...MC_DATA['corporate-pricing-detail'],
  },
  'corporate-pricing-new-pricebook': {
    path: (office) => `${BASE}/locations/${office}/settings/corporate-pricing/add?type=${args.type || 'equipment'}`,
    // Light-DOM React create form (--type route param fixes the disabled Type combobox). Pass
    // --type=labor to enumerate the Labor catalog variant.
    contentMarker: 'h1:has-text("New Pricebook")',
    openerTestidPatterns: [],
    excludeOptionRoles: true,
    ...MC_DATA['corporate-pricing-new-pricebook'],
  },
  // Service Charge — History tab. The tab has no data-testid (Radix-generated id only, not stable).
  // Reached via role=tab, name="Service Charge History" (confirmed live DOM 2026-08-11).
  // contentMarker anchors on "Modified By" column header — unique to the History panel, last-to-render.
  'service-charge': {
    path: (office) => `${BASE}/locations/${office}/settings/service-charge`,
    contentMarker: 'text=Modified By',
    openerTestidPatterns: [],
    openerRoleTextPatterns: [
      // contentGate: true � History is a data grid with no data-testid attributes.
      // waitReady's testid threshold (calibrated for forms) can never be satisfied here.
      // Instead, waitReadyContent waits for the Modified By column header (last-to-render)
      // and at least one data row, throwing loudly if neither appears within the timeout.
      { role: 'tab', text: 'Service Charge History', branch: 'tab:history', contentGate: true },
    ],
    excludeOptionRoles: true,
    ...MC_DATA['service-charge'],
  },

  // Discount Matrix — three surfaces sharing one URL. Company Matrix is the default tab, so the
  // resting pass enumerates it; Region Weekly Peaks and Location Activation are branch openers.
  // CMX elements land in the resting denominator by construction and are dispositioned
  // out-of-scope (NM-3343 owns that tab) — they are never silently dropped.
  //
  // contentGate is deliberately NOT set on these branches. waitReadyContent is hardcoded to the
  // Service Charge History markers ("Modified By" + a tbody row); on these tabs it would wait for
  // a header that never renders and fail as a timeout that reads like app slowness. The
  // skeleton-zero gate in waitReady is the correct readiness signal here and is the measured one:
  // RWP paints 52 placeholder rows and "Count: 0" for the entire load, so neither row count nor
  // the footer count can distinguish loading from empty (walk evidence 2026-08-25).
  'discount-matrix': {
    path: (office) => `${BASE}/locations/${office}/settings/discount-matrix`,
    // Last-to-render control on the landing surface. Measured 2026-08-25: the criteria comboboxes
    // hydrate at t=31s but this input does not resolve until t=91-100s. Anchoring on anything
    // earlier is what produced the false denominator of 11.
    contentMarker: 'input[name="gavDiscountThreshold"]',
    openerTestidPatterns: [],
    openerRoleTextPatterns: [
      { role: 'tab', text: 'Region Weekly Peaks', branch: 'tab:region-weekly-peaks' },
      { role: 'tab', text: 'Location Activation', branch: 'tab:location-activation' },
    ],
    excludeOptionRoles: true,
    ...MC_DATA['discount-matrix'],
  },

  // ===========================================================================================
  // Item Search (NM-2253) — MFE web component at a top-level products URL, office 1101 only.
  // At-rest render measured fast (full panel + grid headers ≤18s; search → 15,874 rows ≤11s,
  // probe session 2026-08-31). The results grid and its pagination bar mount ONLY after a Search
  // click → 'search:executed' branch. Grid Options is a Radix menu opener present at rest.
  // Row-selection toolbar + Product Code dialogs are multi-step (search → row click → button) —
  // out of one-click branch reach; agent-driven probe evidence covers them (§20-Q opener frontier).
  // ===========================================================================================
  'item-search': {
    path: (office) => `${BASE}/locations/${office}/products`,
    // "N products found" renders at rest ("0 products found") and survives every state — and the
    // grid column headers arrive with it. Anchor on the footer text (unique to this surface).
    contentMarker: 'text=products found',
    urlGroup: 'products-page',
    openerTestidPatterns: [],
    openerRoleTextPatterns: [
      { role: 'button', text: 'Search', branch: 'search:executed' },
      { role: 'button', text: 'Grid Options', branch: 'expand:grid-options' },
    ],
    excludeOptionRoles: true,
    ...MC_DATA['item-search'],
  },
  'item-search-product-groups': {
    path: (office) => `${BASE}/locations/${office}/products/product-groups`,
    // Grid header unique to this page (Name / Description / Service Type / Status).
    contentMarker: 'text=Service Type',
    openerTestidPatterns: [],
    openerRoleTextPatterns: [
      { role: 'button', text: 'Search', branch: 'search:executed' },
      // The Add button is a ROUTE to the Add Product Group page, not a dialog. That page carries its own
      // config below ('item-search-add-product-group'), and its 7,394-row sub-class catalog hangs the
      // derive-type pass, so the list module no longer follows it (opener dropped 2026-09-09; the
      // 2026-08-31 'dialog:add-group' run snapshotted before the route change and only duplicated the list keys).
    ],
    excludeOptionRoles: true,
    ...MC_DATA['item-search-product-groups'],
  },
  'item-search-add-product-group': {
    // The Add Product Group PAGE (a route, not a dialog — the list module's 'dialog:add-group'
    // branch snapshots before the route change, so this surface carries its own config).
    path: (office) => `${BASE}/locations/${office}/products/product-groups/add`,
    // Form section heading unique to the Add page; the list page never renders it.
    contentMarker: 'text=Sub Classes',
    openerTestidPatterns: [],
    openerRoleTextPatterns: [
      { role: 'combobox', text: 'Service Type', branch: 'expand:service-type' },
      { role: 'combobox', text: 'Ascending',    branch: 'expand:sort-order' },
    ],
    ...MC_DATA['item-search-add-product-group'],
  },
  // Product Code dialogs (NM-2253 PCD sub-surface) — same products URL, but the View/Add Product
  // Code dialogs need search → row-select before their toolbar openers enable. Reached via the
  // preSteps mechanism (added 2026-09-01, closing the "one-click branch reach" gap the item-search
  // comment above documents): empty-criteria Search returns the full catalog (~11s), the first row
  // click arms the toolbar, then the branch opener click opens the dialog.
  'item-search-product-code': {
    path: (office) => `${BASE}/locations/${office}/products`,
    contentMarker: 'text=products found',
    urlGroup: 'products-page',
    openerTestidPatterns: [],
    openerRoleTextPatterns: [
      {
        role: 'button', text: 'View Product Code', branch: 'dialog:view-product-code',
        readySelector: '[role="dialog"]',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
        ],
      },
      {
        role: 'button', text: 'Add Product Code', branch: 'dialog:add-product-code',
        readySelector: '[role="dialog"]',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr', waitSelector: 'button:has-text("Add Product Code")' },
        ],
      },
      // Row pre-step (2026-09-14, PLAN_NM2255 P9): the first search row in a fresh context is the office's one
      // category-less Labor item, whose View-caret "Category" entry is a silent no-op (no dialog, no request);
      // the row pre-step below therefore takes the first row whose Category cell has content.
      // Third pre-step (added 2026-09-14, PLAN_NM2255 P9): the View dialog's two other tabs, the four
      // segment-scoped dialogs behind the View caret, and the caret menu itself enumerate as their own
      // states, so the deep walk's denominator covers every state of the dialog, not only the Item tab.
      // The caret is the unnamed Radix trigger beside the View button, bound by DOM adjacency exactly as
      // the shipped spec binds it.
      {
        role: 'tab', text: 'Product Code History', branch: 'tab:history',
        readySelector: '[role="dialog"] thead th',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
          { role: 'button', text: 'View Product Code', waitSelector: '[role="dialog"]' },
        ],
      },
      {
        role: 'tab', text: 'Translations', branch: 'tab:translations',
        readySelector: '[role="dialog"] table',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
          { role: 'button', text: 'View Product Code', waitSelector: '[role="dialog"]' },
        ],
      },
      {
        role: 'menuitem', text: 'Sub Class', branch: 'segment:sub-class',
        readySelector: '[role="dialog"]',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
          { selector: 'div:has(> button:text-is("View Product Code")) > button[aria-haspopup="menu"]', waitSelector: '[role="menu"]' },
        ],
      },
      {
        role: 'menuitem', text: 'Class', branch: 'segment:class',
        readySelector: '[role="dialog"]',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
          { selector: 'div:has(> button:text-is("View Product Code")) > button[aria-haspopup="menu"]', waitSelector: '[role="menu"]' },
        ],
      },
      {
        role: 'menuitem', text: 'Sub Category', branch: 'segment:sub-category',
        readySelector: '[role="dialog"]',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
          { selector: 'div:has(> button:text-is("View Product Code")) > button[aria-haspopup="menu"]', waitSelector: '[role="menu"]' },
        ],
      },
      {
        role: 'menuitem', text: 'Category', branch: 'segment:category',
        readySelector: '[role="dialog"]',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
          { selector: 'div:has(> button:text-is("View Product Code")) > button[aria-haspopup="menu"]', waitSelector: '[role="menu"]' },
        ],
      },
      {
        selector: 'div:has(> button:text-is("View Product Code")) > button[aria-haspopup="menu"]', branch: 'menu:view-caret',
        readySelector: '[role="menu"]',
        preSteps: [
          { role: 'button', text: 'Search', waitSelector: 'tbody tr', waitTimeout: 90000 },
          { selector: 'tbody tr:has(> td:first-child > :not(:empty))', waitSelector: 'button:has-text("View Product Code")' },
        ],
      },
    ],
    excludeOptionRoles: true,
    ...MC_DATA['item-search-product-code'],
  },

  'corporate-pricing-override': {
    path: (office) => `${BASE}/locations/${office}/settings/corporate-pricing/pg-override`,
    contentMarker: 'h1:text-is("Product Group Override")',
    openerTestidPatterns: [],
    // Role/text openers: Labor tab (exposes labor product groups), currency combobox (exposes options),
    // rows-per-page combobox (exposes options). Each carries a `branch` override so the emitted label
    // matches the requiredStates entry in module-config.mjs character-for-character (hard gate constraint).
    openerRoleTextPatterns: [
      { role: 'tab',      text: 'Labor', branch: 'tab:labor' },
      { role: 'combobox', text: 'ALL',   branch: 'expand:currency' },
      { role: 'combobox', text: '20',    branch: 'expand:rows-per-page', selector: 'button[role="combobox"]:has-text("20")' },
    ],
    // NM-1472 PRECONDITION: the Product-Group Picker (double-click + drag add) renders ONLY after a
    // specific location AND a non-ALL currency are selected — walks using Currency=ALL never saw it.
    // The locationDriver pass selects office 1101 (Labor product groups repro there — NM-1881) and
    // the first non-ALL currency, then enumerates the page to capture the picker's add controls.
    locationDriver: { searchTerm: '1101', branchLabel: 'location-selected+non-all-currency' },
    excludeOptionRoles: true,
    ...MC_DATA['corporate-pricing-override'],
  },
};

// ---- readiness gate (O1, rebuilt by PLAN_76): stability contract, no testid floor ----
// (LR-052 poll-not-sleep, LR-023 no-networkidle. Poll interval is a cadence, not a fixed sleep.)
//
// WHAT "READY" MEANS NOW (plain English — a new label-poor surface needs NO configuration):
//   The page is ready when the things a walk actually enumerates have arrived and stopped
//   changing: the interactive-element census (buttons, inputs, links, combo/tab roles) is at
//   least 1 and identical across consecutive polls, AND the total DOM element count has
//   settled (small tolerance absorbs spinner churn), AND a minimum time has elapsed.
//   A page rich in data-testids (>= 8, stable) is declared ready early — that is only a
//   fast-path accelerator, never a requirement. The old rule REQUIRED >= 8 testids, a floor
//   with no derivation that permanently blocked label-poor pages (live: a settings page
//   holding 135 buttons + 37 inputs renders exactly 1 testid — and 0 on its second tab).
//   Per LR-062 there is deliberately NO per-surface readiness knob here or in MODULE_CONFIG.
//
// The `minTestids` parameter is retained for signature compatibility (branch overrides at the
// :786 call site and older unit tests) but is INERT — the fast-path threshold is a hard
// constant so no configuration can weaken readiness into a false-small denominator.
// Cause-2 posture kept: throws loudly on timeout; a silent partial corrupts the denominator.
// Exported for unit testing.
const FAST_PATH_TESTIDS = 8;   // accelerator only — never a gate
const CENSUS_STABLE_READS = 3; // consecutive identical census polls required
const DOM_NODE_TOLERANCE = 2;  // absorbs spinner/animation churn; structural growth resets

// Skeleton gate (added 2026-08-25). A surface is NOT ready while it still renders loading
// placeholders. This app marks them with the shadcn/ui convention data-slot="skeleton", so this is a
// generic framework signal, not a per-surface knob (LR-062 still holds — nothing here is tunable).
//
// DERIVED FROM MEASUREMENT, not invented. Discount Matrix criteria bar, headless, 2026-08-25:
//   t=10s  skeleton=8    combobox=0  input=0   <- shell only
//   t=20s  skeleton=148  combobox=0  input=0   <- placeholders painted, census settles at 30
//   t=31s  skeleton=145  combobox=3  input=0   <- criteria dropdowns hydrate
//   t=91s  skeleton=0    combobox=3  input=1   <- GAV Discount Threshold finally resolves
// The old contract (3 identical polls = ~900ms of quiet) returned at ~22s and produced a denominator
// of 11; the fully-hydrated page yields 17. All four Search Criteria controls were invisible to every
// walk of that surface. Waiting for zero skeletons is exact — it releases precisely when the last
// placeholder resolves — where any fixed timeout would be a guess. Per this module's own posture,
// "a silently wrong denominator built on a partial load is worse than a crash": a permanently stuck
// skeleton now fails loudly at the timeout instead of silently under-counting.
// The selector itself lives with the census that produces it, in lib/deep-pierce.mjs (stats.skeletons),
// so readiness costs no extra page round-trip.

export async function waitReady(page, { minTestids = 8, stableReads = 2, interval = 300, timeout = 180000 } = {}) {
  void minTestids; // inert (see header note) — kept so existing callers/tests need no signature change
  let lastT = -1, lastC = -1, lastN = -1, fastStable = 0, censusStable = 0, waited = 0, lastError = '';
  while (waited < timeout) {
    let snap = null;
    try {
      // Single source of truth: uses inPageEnumerate scoped to <main> — the SAME function,
      // scope, and kind predicate that enumerateState uses for the denominator. No second
      // selector list can drift. CONTAINER_NOT_FOUND (no <main> yet) is caught and retried.
      snap = await page.evaluate(inPageEnumerate, 'main');
    } catch (err) {
      // LR-003: distinguish expected retry conditions from genuine errors.
      const msg = err && err.message || '';
      if (msg.includes('CONTAINER_NOT_FOUND') || msg.includes('Execution context was destroyed') ||
          msg.includes('frame was detached') || msg.includes('navigation')) {
        // Expected during page load — retry silently.
      } else {
        // Genuine error (syntax, serialization, unexpected) — surface in timeout message.
        lastError = msg;
      }
    }
    if (snap != null) {
      // Normalize result shape: inPageEnumerate returns {entries, stats}, legacy mocks return {t,c,n} or a number.
      if (typeof snap === 'number') snap = { t: snap, c: snap, n: snap };
      else if (snap.entries && snap.stats) {
        // Real inPageEnumerate result — derive t/c/n from the same data the denominator uses.
        const t = snap.entries.filter(e => e.key && e.key.startsWith('testid:')).length;
        snap = { t, c: snap.stats.uniqueKeys, n: snap.stats.scanned, skel: snap.stats.skeletons };
      }
      const { t, c, n, skel } = snap;
      // Fast path: label-rich page, same stability rule the old gate used — hard constant.
      if (t >= FAST_PATH_TESTIDS && t === lastT) { if (++fastStable >= stableReads) return t; } else fastStable = 0;
      // Stability contract: census present and identical, DOM settled within tolerance,
      // minimum elapsed time (implied by the consecutive-poll requirement, asserted anyway).
      const censusSame = c === lastC;
      const domSettled = lastN >= 0 && Math.abs(n - lastN) <= DOM_NODE_TOLERANCE;
      if (c >= 1 && censusSame && domSettled) { censusStable++; } else censusStable = 0;
      // Loading placeholders outrank census stability: the census can sit still for tens of
      // seconds while skeletons are still waiting on their data (measured above).
      // Non-number means the read did not yield a count (unit-test mocks return the enumerate
      // object); a live page always returns a number, so this never fails open in production.
      const skeletonsSettled = typeof skel !== 'number' || skel === 0;
      if (censusStable >= CENSUS_STABLE_READS && waited >= 2 * interval && skeletonsSettled) return t;
      lastT = t; lastC = c; lastN = n;
    }
    await page.waitForTimeout(interval);
    waited += interval;
  }
  // Loud failure: a silently wrong denominator built on a partial load is worse than a crash.
  throw new Error(`[WAIT_READY_TIMEOUT] waitReady timed out after ${timeout}ms (last testid count=${lastT}, interactive census=${lastC}, dom nodes=${lastN}${lastError ? `, lastError: ${lastError}` : ''}). Refusing to continue with a partial page load.`);
}

// History-specific content gate: waits for the Modified By column header (unique to the
// History panel, last-to-render) and at least one data row, then throws loudly on timeout.
// Exported for unit testing. Do NOT use for form surfaces � those use waitReady.
export async function waitReadyContent(page, { timeout = 120000 } = {}) {
  try {
    await page.waitForSelector('text=Modified By', { timeout });
  } catch {
    throw new Error(`[WAIT_READY_CONTENT_TIMEOUT] History content gate timed out after ${timeout}ms: "Modified By" header never appeared. Refusing to enumerate.`);
  }
  try {
    await page.waitForSelector('tbody tr', { timeout });
  } catch {
    throw new Error(`[WAIT_READY_CONTENT_TIMEOUT] History content gate timed out after ${timeout}ms: "Modified By" header found but no data rows appeared. Refusing to enumerate � denominator cannot be trusted.`);
  }
}

// Cause-1 fix: after the opener loop the page may be on a different panel.
// Extracted as an export so unit tests can verify the re-navigation is present.
export async function renavigateToOrigin(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReady(page);
}

// Broadened 2026-08-10: the original regex matched only external IdP URLs.
// The app's own /auth/sign-in route also signals an expired session and produced
// a silent false-green (element_count=0, status="complete") before this fix.
// Anchored alternatives prevent matching unrelated paths like /logintheme.
function isLoginRedirect(url) {
  return /login\.microsoftonline\.com|login\.microsoft\.com|\/oauth2\/|\/saml2\/|sts\.|\/auth\/sign-in(?:[/?#]|$)|\/auth\/login(?:[/?#]|$)|\/login(?:[/?#]|$)/i.test(url || '');
}

// Write a halted completion record to the output JSON and return the path written.
// Called at any abort site so a stale successful JSON from a prior run never survives.
function writeHaltedRecord(args, state, elementCount, rawCount, reason) {
  const outDir = join(REPO_ROOT, 'reports', 'walk-coverage');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const jsonPath = args.out ? resolve(REPO_ROOT, args.out) : join(outDir, `${state}.json`);
  const record = {
    version: 1,
    status: 'halted',
    surfaces_attempted: [state],
    surfaces_enumerated: [],
    element_count: elementCount,
    raw_before_collapse: rawCount,
    halt_reasons: [reason],
  };
  writeFileSync(jsonPath, JSON.stringify({ completion_record: record }, null, 2) + '\n', 'utf-8');
  return jsonPath;
}

// Robust Radix tab activation by TESTID (the pilot proved getByRole-by-name does not flip the
// sub-tab). Click → verify aria-selected flips → retry (a premature click on an under-hydrated page
// is a no-op even when trusted — O1/O2). Then wait for the strong content marker + settle.
async function activateTabByTestid(page, testid, contentMarker) {
  const loc = page.locator(`[data-testid="${testid}"]`);
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (!(await loc.count())) { await page.waitForTimeout(700); continue; }
    try { await loc.first().click({ timeout: 8000 }); } catch { /* not actionable yet */ }
    const sel = await loc.first().getAttribute('aria-selected').catch(() => null);
    if (sel === 'true') {
      if (contentMarker) { try { await page.waitForSelector(contentMarker, { timeout: 12000 }); } catch { /* marker absent in this data state */ } }
      await waitReady(page);
      return { ok: true, attempts: attempt };
    }
    await page.waitForTimeout(900);   // page/Radix not wired yet — settle and retry
  }
  return { ok: false, attempts: 5 };
}

// ---- merge enumerated entries into the accumulator (union by key; OR the A/B membership) ----
export function mergeEntries(accum, entries, branch, excludeOptionRoles) {
  let added = 0;
  for (const e of entries) {
    if (excludeOptionRoles && e.role === 'option') continue;   // M2: option-sets not denominator elements
    const prev = accum.get(e.key);
    if (!prev) {
      accum.set(e.key, { ...e, branches: branch ? [branch] : [] });
      added++;
    } else {
      prev.inA = prev.inA || e.inA;
      prev.inB = prev.inB || e.inB;
      if (e.occurrences && (!prev.occurrences || e.occurrences > prev.occurrences)) {
        prev.occurrences = e.occurrences;
      }
      if (branch && !prev.branches.includes(branch)) prev.branches.push(branch);
    }
  }
  return added;
}

// ---- CDP G1-recovery: cursor:pointer candidates → DOMDebugger.getEventListeners confirm ----
async function cdpG1Recovery(page, candidates, cap = 80) {
  const hits = [];
  if (!candidates || !candidates.length) return hits;
  let cdp;
  try { cdp = await page.context().newCDPSession(page); } catch { return hits; }
  const INTERACTION = new Set(['click', 'mousedown', 'pointerdown', 'mouseup', 'pointerup', 'dblclick', 'keydown']);
  for (const c of candidates.slice(0, cap)) {
    try {
      const ev = await cdp.send('Runtime.evaluate', { expression: `window.__wcCands[${c.idx}]`, objectGroup: 'wc-g1' });
      const objectId = ev && ev.result && ev.result.objectId;
      if (!objectId) continue;
      const res = await cdp.send('DOMDebugger.getEventListeners', { objectId });
      const types = (res.listeners || []).map(l => l.type);
      if (types.some(t => INTERACTION.has(t))) hits.push({ key: c.key, role: c.role, name: c.name, listeners: types });
    } catch { /* node gone / not resolvable */ }
  }
  try { await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'wc-g1' }); } catch {}
  return hits;
}

// ---- one enumeration of the current state (Pass A + Pass B + candidates), per frame ----
// Cause-4 fix: scope enumeration to <main> so app-shell chrome (sidebar anchors etc.) is excluded.
export async function enumerateState(page) {
  const out = { entries: [], candidates: [], stats: { scanned: 0, shadowHosts: 0 } };
  for (const frame of page.frames()) {
    let r;
    try { r = await frame.evaluate(inPageEnumerate, 'main'); } catch (err) {
      // CONTAINER_NOT_FOUND means the page genuinely has no <main>; a silent skip would produce
      // an empty denominator that reads as a clean pass — the exact failure mode we are fixing.
      // All other per-frame errors (frame detached, navigation, etc.) are tolerated as before.
      if (err.message && err.message.includes('CONTAINER_NOT_FOUND')) throw err;
      continue;
    }
    out.entries.push(...r.entries);
    if (frame === page.mainFrame()) out.candidates = r.candidates;
    out.stats.scanned += r.stats.scanned;
    out.stats.shadowHosts += r.stats.shadowHosts;
  }
  return out;
}

// ---- scan body-level portals (Radix/headless-UI menus, dialogs, listboxes) ----
// Safe to call at any time: when nothing is open it returns []. Called inline after each
// role/text opener click AND once at the end of main to capture any leftover open portals.
async function scanPortalElements(page) {
  return page.evaluate(() => {
    const sels = [
      '[data-radix-popper-content-wrapper]',
      '[data-radix-select-viewport]',
      '[role="listbox"]',
      '[role="dialog"]',
      '[role="menu"]',
    ];
    const results = [];
    const seen = new Set();
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        for (const child of el.querySelectorAll('[role="option"],[role="menuitem"],button,a,input,select,textarea')) {
          const tid = child.getAttribute('data-testid');
          const key = tid
            ? `testid:${tid}`
            : `role:${(child.getAttribute('role') || child.tagName.toLowerCase())}:${(child.textContent || '').trim().slice(0, 40)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const isDisabled = child.disabled === true || child.getAttribute('aria-disabled') === 'true';
          // Disabled portal elements carry `disabled: true` like every other enumeration path
          // (enumerateState, cdp:listener) — never `status: UNREACHABLE`, which verify-denominator
          // reserves for found-but-unverifiable elements and gates on human exemption. A disabled
          // control IS verified: it is present in the DOM and its disabled contract was read live.
          const entry = {
            key,
            role: child.getAttribute('role') || child.tagName.toLowerCase(),
            name: (child.textContent || '').trim().slice(0, 60),
            why: 'portal-scan',
            inA: true,
            inB: false,
            disabled: isDisabled,
          };
          results.push(entry);
        }
      }
    }
    return results;
  });
}

// ---- Phase 2.2: machine-derived field type detection ----------------------------------------

// Convert an entry key to a Playwright-compatible CSS selector, or null if unresolvable.
// Item 4: struct: keys resolve via their recorded DOM ancestor path. Where a key genuinely
// cannot resolve (e.g. ambiguous ancestor path), it is recorded with disposition 'unresolvable'.
export function entryKeyToSelector(key) {
  const clean = key.replace(/\s*\[archetype\u00D7\d+\]$/, '');
  if (clean.startsWith('testid:')) return `[data-testid="${clean.slice(7)}"]`;
  if (clean.startsWith('id:')) return `[id="${clean.slice(3)}"]`;
  if (clean.startsWith('name:')) return `[name="${clean.slice(5).split('|')[0]}"]`;
  if (clean.startsWith('struct:')) {
    // struct: keys have format "struct:role|accName|ancestorPath"
    // Attempt to build a selector from the ancestor path + role/name
    const parts = clean.slice(7).split('|');
    const role = parts[0] || '';
    const name = parts[1] || '';
    const ancestorPath = parts[2] || '';
    // Walk the ancestor path from outermost to innermost to build a scoped selector
    const ancestors = ancestorPath.split('/').filter(Boolean);
    const selectorParts = [];
    for (const seg of ancestors) {
      // Segments are either testid/name/id values or bare tag names
      if (/^[a-z]+$/.test(seg)) {
        selectorParts.push(seg);
      } else {
        // Prefer data-testid match, fall back to id, fall back to name
        selectorParts.push(`[data-testid="${seg}"], [id="${seg}"], [name="${seg}"]`);
      }
    }
    // Build a descendant selector: last ancestor > element[role]
    if (selectorParts.length > 0) {
      const lastAncestor = selectorParts[selectorParts.length - 1];
      const isCssSelector = lastAncestor.startsWith('[');
      const ancestorSel = isCssSelector ? lastAncestor.split(',')[0].trim() : lastAncestor;
      if (role) {
        return `${ancestorSel} [role="${role}"], ${ancestorSel} ${role}`;
      }
      return ancestorSel;
    }
    // Cannot resolve — return null; caller records as unresolvable disposition
    return null;
  }
  // role: keys have no reliable single-element CSS selector
  return null;
}

// Item 4: record unresolvable struct: keys with an explicit disposition and reason
function classifyUnresolvableKey(controlKey, reason) {
  return { type: null, resolved: false, evidence: `unresolvable: ${reason}`, probe: 'unresolvable' };
}

function formatEvidence(obs) {
  const parts = [];
  if (obs.tag) parts.push(`tag=${obs.tag}`);
  if (obs.type) parts.push(`type=${obs.type}`);
  if (obs.role) parts.push(`role=${obs.role}`);
  return parts.join(';');
}

function isRestingConclusive(obs) {
  const tag = (obs.tag || '').toUpperCase();
  const role = (obs.role || '').toLowerCase();
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (['checkbox', 'switch', 'spinbutton', 'combobox', 'listbox'].includes(role)) return true;
  return false;
}

// Safety denylist: controls whose accessible name or key matches these words must NEVER be clicked.
// The enumerator runs against a SHARED environment — clicking Save/Delete/etc. mutates real data.
// Fail CLOSED: if uncertain whether a control is safe, do not click.
const CLICK_DENYLIST_PATTERN = /\b(save|submit|apply|confirm|delete|remove|discard|send|post|publish|approve|reject|cancel)\b/i;

// Tags/roles that are plausibly editable cells or input triggers (safe to click for probing).
// A bare <button> that is not a click-to-edit cell should never be probed.
const PROBEABLE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'TD', 'TH', 'SPAN', 'DIV', 'A']);
// Cause-1 fix: 'tab' removed — tab triggers are navigation controls; clicking one unmounts the
// panel being measured, causing all subsequent $eval calls to fail (testids 80→0 in production).
// Tab triggers classified as non_probeable; ordering property: no probe changes mount state.
const PROBEABLE_ROLES = new Set([
  'cell', 'gridcell', 'textbox', 'combobox', 'listbox', 'spinbutton',
  'checkbox', 'switch', 'option', 'menuitem', 'treeitem',
]);

// Navigation roles: clicking these swaps the mounted panel — must never be click-probed regardless
// of tag (a tab trigger may be a DIV which is in PROBEABLE_TAGS, so we guard by role first).
const NAVIGATION_ROLES = new Set(['tab', 'tablist']);

function isProbeableByClikc(tag, role) {
  // Navigation roles override tag membership — they swap the mounted panel when clicked.
  if (role && NAVIGATION_ROLES.has(role)) return false;
  if (PROBEABLE_TAGS.has(tag)) return true;
  if (role && PROBEABLE_ROLES.has(role)) return true;
  return false;
}

async function readAccessibleName(page, selector) {
  try {
    return await page.$eval(selector, el => {
      return (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 200);
    });
  } catch {
    return '';
  }
}

// Signal-to-type mapping rules. Each rule tests a normalized observation and provides a regex
// to search the runtime-loaded legal type names. No hardcoded type strings — the taxonomy
// (field-case-generation.md) loaded via loadFieldCaseTaxonomy() is the single source of truth.
// Evaluation: ALL rules are tested; resolve only on a unique match (Defect 2 fix).
// Cause-3 fix: bare `INPUT` catch-all removed — it incorrectly classified type-less numeric inputs
// as "Plain text". A control matching no rule must remain `unresolved`; an honest unknown is
// better than a confident wrong type propagated into a closed plan.
const TYPE_SIGNAL_RULES = [
  { match: o => o.role === 'spinbutton',  pattern: /numeric|spinbutton/i },
  { match: o => o.role === 'checkbox',    pattern: /checkbox/i },
  { match: o => o.role === 'switch',      pattern: /checkbox|switch|toggle/i },
  { match: o => o.role === 'combobox',    pattern: /dropdown|combobox/i },
  { match: o => o.role === 'listbox',     pattern: /dropdown|combobox|listbox/i },
  { match: o => o.tag === 'INPUT' && o.type === 'number',  pattern: /numeric|spinbutton/i },
  // Cause-3 fix: type-less decimal inputs (the 79 percentage inputs). Confirmed signals:
  // tagName=INPUT, type=null, inputmode=decimal. No formcontrolname/id/name on these elements.
  { match: o => o.tag === 'INPUT' && o.type === '' && o.inputmode === 'decimal', pattern: /numeric|spinbutton/i },
  { match: o => o.tag === 'INPUT' && o.type === 'checkbox', pattern: /checkbox/i },
  { match: o => o.tag === 'INPUT' && o.type === 'password', pattern: /password/i },
  { match: o => o.tag === 'INPUT' && (o.type === 'date' || o.type === 'datetime-local'), pattern: /date/i },
  { match: o => o.tag === 'INPUT' && o.type === 'file',    pattern: /file/i },
  { match: o => o.tag === 'SELECT',       pattern: /dropdown|combobox/i },
  { match: o => o.tag === 'TEXTAREA',     pattern: /plain.text/i },
];

export function deriveFieldType(observation, legalTypes) {
  const normalized = {
    tag: (observation.tag || '').toUpperCase(),
    type: (observation.type || '').toLowerCase(),
    role: (observation.role || '').toLowerCase(),
    inputmode: (observation.inputmode || '').toLowerCase(),
  };
  const matchedTypes = new Set();
  for (const rule of TYPE_SIGNAL_RULES) {
    if (rule.match(normalized)) {
      const matches = legalTypes.filter(t => rule.pattern.test(t));
      for (const m of matches) matchedTypes.add(m);
    }
  }
  if (matchedTypes.size === 1) return [...matchedTypes][0];
  // Zero matches or ambiguous (2+) — return null; caller handles disambiguation
  return matchedTypes.size >= 2 ? { ambiguous: [...matchedTypes] } : null;
}

// Exported seam: resolves an --branch value to its matching openerRoleTextPatterns entry.
// Throws loudly if the value is unrecognised so the caller can exit(2) immediately.
export function resolveBranchOpener(cfg, branchArg) {
  const patterns = (cfg && cfg.openerRoleTextPatterns) || [];
  const match = patterns.find(p => p.branch === branchArg);
  if (!match) {
    const known = patterns.map(p => p.branch).filter(Boolean).join(', ') || '(none configured)';
    throw new Error(
      `[FATAL] --branch="${branchArg}" is not a recognised branch value for this module.\n` +
      `Known branches: ${known}\n` +
      'An unrecognised --branch value must fail loudly; silently ignoring it would reintroduce the original bug.'
    );
  }
  return match;
}
// Cause-1 seam: exported so tests can drive the production ordering
// (renavigate must precede every Phase 2.2 DOM read).
// main() calls this after the opener loop; the seam lets a unit test inject
// mock collaborators and assert goto fires before $eval — no browser required.
// Click a branch opener and wait for its panel to be ready. Shared by the branch enumeration pass and
// by deriveAllFieldTypes' re-establish step, so both reach the surface the same way and cannot drift.
export async function activateBranch(page, cfg, branchLabel) {
  const branchPattern = resolveBranchOpener(cfg, branchLabel);
  // Multi-step branches: a branch pattern may declare `preSteps` — an ordered list of clicks that
  // establish the state the opener needs (e.g. run a search and select a row before a toolbar
  // button enables). Each step is {selector}|{role,text} [+ timeout, waitSelector, waitTimeout];
  // a missing target fails loudly (same posture as resolveBranchOpener — silence would re-hide the
  // multi-step surfaces this exists to reach). Shared with deriveAllFieldTypes' re-establish path
  // by construction, since both call this function.
  for (const st of branchPattern.preSteps || []) {
    const stepLoc = st.selector
      ? page.locator(st.selector)
      : page.getByRole(st.role, { name: st.text, exact: true });
    await stepLoc.first().click({ timeout: st.timeout ?? 15000 });
    if (st.waitSelector) {
      await page.locator(st.waitSelector).first().waitFor({ state: 'visible', timeout: st.waitTimeout ?? 30000 });
    }
  }
  const loc = branchPattern.selector
    ? page.locator(branchPattern.selector)
    : page.getByRole(branchPattern.role, { name: branchPattern.text, exact: true });
  await loc.first().click({ timeout: branchPattern.preSteps ? 15000 : 5000 });
  // Portal-mounted branch surfaces (Radix dialogs) render seconds AFTER the opener click, while
  // waitReady below passes instantly on the host page's testids — so an immediate enumeration
  // snapshots the page without the branch surface (measured 2026-09-01: both Product Code dialog
  // runs emitted host-page-only manifests). `readySelector` names the branch surface's own root;
  // enumeration must not start until it is visible and its skeleton placeholders are gone.
  if (branchPattern.readySelector) {
    await page.locator(branchPattern.readySelector).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-slot="skeleton"]').length === 0,
      undefined, { timeout: 20000 },
    ).catch(() => { /* hydration slower than the bound — enumerate what is rendered */ });
  }
  // Content-gated branches (e.g. Service Charge History) wait for rendered DOM markers, not testid counts.
  if (branchPattern.contentGate) {
    await waitReadyContent(page);
  } else {
    await waitReady(page, branchPattern.minTestids != null ? { minTestids: branchPattern.minTestids } : {});
  }
  return branchPattern;
}
export async function deriveAllFieldTypes(page, url, entries, rawEntries, legalTypes, reestablish) {
  await renavigateToOrigin(page, url);
  // The renavigate above is the Cause-1 fix for the RESTING path, where the opener loop may have
  // wandered onto another panel. On a BRANCH run it is actively harmful: the originating URL lands on
  // the default panel, so every branch-specific element is then probed against a DOM that no longer
  // contains it and its type resolves to unresolved. Measured 2026-08-25 — every Region Weekly Peaks
  // and Location Activation control failed its read this way, and Service Charge History had the same
  // silent hole. The resting path passes no callback and behaves exactly as before.
  if (reestablish) await reestablish(page);

  // --- Phase 2.2: derive field types from DOM observation ---
  const archetypeRepKeys = new Map();
  for (const raw of rawEntries) {
    const tk = templateKey(raw.key);
    if (!archetypeRepKeys.has(tk)) archetypeRepKeys.set(tk, raw.key);
  }

  const derivedTypes = {};
  for (const entry of entries) {
    const controlKey = entry.key;
    let selectorKey = controlKey;
    if (entry.archetype) {
      const tk = controlKey.replace(/\s*\[archetype\u00D7\d+\]$/, '');
      selectorKey = archetypeRepKeys.get(tk) || controlKey;
    }
    const selector = entryKeyToSelector(selectorKey);
    if (!selector) {
      const keyPrefix = selectorKey.split(':')[0];
      derivedTypes[controlKey] = classifyUnresolvableKey(controlKey, `${keyPrefix}: key has no resolvable CSS selector from ancestor path`);
      continue;
    }
    let obs;
    try {
      obs = await readElementObservation(page, selector);
    } catch (err) {
      console.warn(`[derive-type] read failed for ${controlKey}: ${String(err).slice(0, 80)}`);
      derivedTypes[controlKey] = { type: null, resolved: false, evidence: '', probe: 'unresolved' };
      continue;
    }
    if (!obs) {
      derivedTypes[controlKey] = { type: null, resolved: false, evidence: '', probe: 'unresolved' };
      continue;
    }
    if (isRestingConclusive(obs)) {
      const fieldType = deriveFieldType(obs, legalTypes);
      if (fieldType && typeof fieldType === 'object' && fieldType.ambiguous) {
        derivedTypes[controlKey] = {
          type: null,
          resolved: false,
          evidence: `${formatEvidence(obs)}; ambiguous_candidates=${fieldType.ambiguous.join(',')}`,
          probe: 'unresolved',
        };
      } else {
        derivedTypes[controlKey] = {
          type: fieldType,
          resolved: fieldType !== null,
          evidence: formatEvidence(obs),
          probe: 'resting',
        };
      }
    } else {
      const accessibleName = await readAccessibleName(page, selector);
      const keyText = controlKey.replace(/^(testid:|id:|name:)/, '');
      if (CLICK_DENYLIST_PATTERN.test(keyText) || CLICK_DENYLIST_PATTERN.test(accessibleName)) {
        derivedTypes[controlKey] = {
          type: null,
          resolved: false,
          evidence: `denylist_hit: key="${keyText}" accessibleName="${accessibleName}"`,
          probe: 'unresolved',
        };
        continue;
      }
      const obsTag = (obs.tag || '').toUpperCase();
      const obsRole = (obs.role || '').toLowerCase();
      if (!isProbeableByClikc(obsTag, obsRole)) {
        derivedTypes[controlKey] = {
          type: null,
          resolved: false,
          evidence: `non_probeable: tag=${obsTag} role=${obsRole}`,
          probe: 'unresolved',
        };
        continue;
      }
      let activeObs = null;
      let clickPerformed = false;
      try {
        await page.click(selector, { timeout: 3000 });
        clickPerformed = true;
        await page.waitForTimeout(300);
        activeObs = await readActiveElementObservation(page);
      } catch (err) {
        console.warn(`[derive-type] click-probe failed for ${controlKey}: ${String(err).slice(0, 80)}`);
      } finally {
        if (clickPerformed) {
          try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
          } catch (escErr) {
            console.warn(`[derive-type] Escape failed for ${controlKey}: ${String(escErr).slice(0, 80)}`);
          }
        }
      }
      const effectiveObs = activeObs || obs;
      const fieldType = deriveFieldType(effectiveObs, legalTypes);
      if (fieldType && typeof fieldType === 'object' && fieldType.ambiguous) {
        derivedTypes[controlKey] = {
          type: null,
          resolved: false,
          evidence: `${formatEvidence(effectiveObs)}; ambiguous_candidates=${fieldType.ambiguous.join(',')}`,
          probe: 'unresolved',
        };
      } else {
        derivedTypes[controlKey] = {
          type: fieldType,
          resolved: fieldType !== null,
          evidence: formatEvidence(effectiveObs),
          probe: activeObs ? 'edit-mode-click' : 'resting',
        };
      }
    }
  }
  return derivedTypes;
}

async function readElementObservation(page, selector) {
  return page.$eval(selector, el => ({
    tag: el.tagName.toUpperCase(),
    type: el.getAttribute('type') || '',
    role: el.getAttribute('role') || '',
    inputmode: el.getAttribute('inputmode') || '',
  }));
}

async function readActiveElementObservation(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
      tag: el.tagName.toUpperCase(),
      type: el.getAttribute('type') || '',
      role: el.getAttribute('role') || '',
    };
  });
}

// ---- segment-boundary URL matching (g78-V13: fixes prefix-without-boundary defect) ----------
// A config path matches a URL only if the URL equals the path exactly or continues at a path
// segment boundary (/, ?, #). Prevents /settings/service-charge matching /settings/service-charger.
function matchesAtSegmentBoundary(url, prefix) {
  if (!url.startsWith(prefix)) return false;
  if (url.length === prefix.length) return true;
  const next = url[prefix.length];
  return next === '/' || next === '?' || next === '#';
}

// ---- run-config resolution (Build 1: kill silent defaults) ----------------------------------
// --url without --module: adhoc mode (cfg=null, office parsed from URL).
// --url with --module: validate URL matches config path; exit 2 on mismatch.
// No --url: existing behavior (module config required).
// g78-V13: segment-boundary matching + longest-prefix-wins resolves nested corporate-pricing paths.
export function resolveRunConfig(inputArgs, moduleConfig) {
  if (inputArgs.url) {
    const officeMatch = inputArgs.url.match(/\/locations\/(\d+)\//);
    const parsedOffice = officeMatch ? officeMatch[1] : 'unknown';
    const office = inputArgs.office || parsedOffice;
    if (inputArgs.module) {
      const cfg = moduleConfig[inputArgs.module];
      if (!cfg) return { error: `No config for module "${inputArgs.module}".`, exitCode: 2 };
      const expectedPrefix = cfg.path(office);
      if (!matchesAtSegmentBoundary(inputArgs.url, expectedPrefix))
        return { error: `--url "${inputArgs.url}" does not match config path for "${inputArgs.module}" (expected prefix: "${expectedPrefix}").`, exitCode: 2 };
      // Verify no more-specific config matches this URL (prevents naming a shorter module for a longer path)
      for (const [name, mcfg] of Object.entries(moduleConfig)) {
        if (name === inputArgs.module) continue;
        try {
          const otherPrefix = mcfg.path(office);
          if (otherPrefix.length > expectedPrefix.length && matchesAtSegmentBoundary(inputArgs.url, otherPrefix))
            return { error: `--url matches more-specific config "${name}" (path: "${otherPrefix}"), not "${inputArgs.module}".`, exitCode: 2 };
        } catch { /* path() may throw — skip */ }
      }
      return { office, moduleName: inputArgs.module, cfg, url: inputArgs.url };
    }
    // Match URL against every MODULE_CONFIG entry by segment-boundary prefix
    const matches = [];
    for (const [name, mcfg] of Object.entries(moduleConfig)) {
      try {
        const prefix = mcfg.path(office);
        if (matchesAtSegmentBoundary(inputArgs.url, prefix)) matches.push({ name, cfg: mcfg, prefixLen: prefix.length });
      } catch { /* path() may throw for configs needing extra args — skip */ }
    }
    if (matches.length === 0) {
      return { office, moduleName: 'adhoc', cfg: null, url: inputArgs.url };
    }
    // Longest prefix wins (most specific config)
    matches.sort((a, b) => b.prefixLen - a.prefixLen);
    const best = matches[0];
    const ties = matches.filter(m => m.prefixLen === best.prefixLen);
    if (ties.length > 1) {
      const names = ties.map(m => m.name).join(', ');
      return { error: `--url matches multiple configs with equal specificity: ${names}. Use --module to disambiguate.`, exitCode: 2 };
    }
    // urlGroup guard: if the winning config declares a urlGroup, check for siblings.
    // A shared URL cannot identify a single surface — require --module.
    if (best.cfg && best.cfg.urlGroup) {
      const siblings = Object.entries(moduleConfig)
        .filter(([n, c]) => c.urlGroup === best.cfg.urlGroup && n !== best.name)
        .map(([n]) => n);
      if (siblings.length > 0) {
        const all = [best.name, ...siblings].sort().join(', ');
        return { error: `URL maps to multiple surfaces sharing urlGroup "${best.cfg.urlGroup}": ${all}. Use --module to name the surface explicitly.`, exitCode: 2 };
      }
    }
    return { office, moduleName: best.name, cfg: best.cfg, url: inputArgs.url };
  }
  // No --url path: both --module and --office are required (no silent defaults).
  if (!inputArgs.module) return { error: 'No --url and no --module specified. Provide --module=<name> to select a surface.', exitCode: 2 };
  if (!inputArgs.office) return { error: 'No --url and no --office specified. Provide --office=<id>.', exitCode: 2 };
  const office = inputArgs.office;
  const moduleName = inputArgs.module;
  const cfg = moduleConfig[moduleName];
  if (!cfg) return { error: `No config for module "${moduleName}" and no --url given.`, exitCode: 2 };
  return { office, moduleName, cfg, url: cfg.path(office) };
}

// ---- selected-tab snapshot (Build 3: base_state) -------------------------------------------
async function getSelectedTabs(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"][aria-selected="true"]')]
      .map(el => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40))
  );
}

// ---- fixpoint expansion loop (Build 2: extracted for testability) ---------------------------
// Runs the self-expand-to-fixpoint loop: scan, click openers, re-scan until no new keys.
// Returns { settled, activated, msg }. Caller handles the halted path.
// _testLegacyBreak: when true, restores the pre-fix || break for T-race red evidence.
export async function expandToFixpoint(page, accum, cfg, excludeOptions, maxCycles, report, { _testLegacyBreak = false } = {}) {
  const activated = new Set();
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const cur = await enumerateState(page);
    const openerKeys = cur.entries.filter(e => {
      if (activated.has(e.key)) return false;
      const k = e.key.toLowerCase();
      if (cfg && cfg.openerTestidPatterns && cfg.openerTestidPatterns.some(re => re.test(k))) return true;
      return false;
    });
    let clicked = 0;
    for (const e of openerKeys) {
      const sel = e.key.startsWith('testid:') ? `[data-testid="${e.key.slice(7)}"]` : null;
      if (!sel) continue;
      try {
        const loc = page.locator(sel);
        if (await loc.count()) { await loc.first().click({ timeout: 5000 }); await waitReady(page); clicked++; activated.add(e.key); }
      } catch { activated.add(e.key); }
    }
    if (cfg && cfg.openerRoleTextPatterns) {
      for (const pattern of cfg.openerRoleTextPatterns) {
        const activatedKey = `roletext:${pattern.role}:${pattern.text}`;
        if (activated.has(activatedKey)) continue;
        try {
          const loc = pattern.selector
            ? page.locator(pattern.selector)
            : page.getByRole(pattern.role, { name: pattern.text, exact: true });
          if (!(await loc.count())) { activated.add(activatedKey); continue; }
          await loc.first().click({ timeout: 5000 });
          await waitReady(page);
          const inlinePortals = await scanPortalElements(page);
          const branch = pattern.branch || `expand:${pattern.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-menu`;
          mergeEntries(accum, inlinePortals, branch, false);
          report.branches.push({ branch, openerText: pattern.text, addedKeys: inlinePortals.length, ok: true });
          clicked++;
          activated.add(activatedKey);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        } catch (err) { report.branches.push({ branch: pattern.branch || `expand:${pattern.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-menu`, openerText: pattern.text, error: String(err).slice(0, 120), ok: false }); activated.add(`roletext:${pattern.role}:${pattern.text}`); }
      }
    }
    const after = await enumerateState(page);
    const fixBranch = clicked === 0 ? 'resting' : `expand-${cycle}`;
    const added = mergeEntries(accum, after.entries, fixBranch, excludeOptions);
    report.cycles.push({ cycle, openersClicked: clicked, added, accum: accum.size });
    if (_testLegacyBreak ? (clicked === 0 || added === 0) : (clicked === 0 && added === 0)) break;
    if (clicked === 0) await page.waitForTimeout(1000);
  }

  // Confirmation scan: one extra pass to verify the fixpoint holds
  // (skipped in legacy mode — pre-fix code had no confirmation)
  if (!_testLegacyBreak) {
    await page.waitForTimeout(1000);
    const confirmState = await enumerateState(page);
    const confirmAdded = mergeEntries(accum, confirmState.entries, 'resting', excludeOptions);
    report.cycles.push({ cycle: 'confirm', added: confirmAdded, accum: accum.size });
    if (confirmAdded > 0) {
      // Not settled — resume resting scans within remaining maxCycles budget
      const usedCycles = report.cycles.filter(c => typeof c.cycle === 'number' && c.cycle > 0).length;
      for (let cycle = usedCycles + 1; cycle <= maxCycles; cycle++) {
        await page.waitForTimeout(1000);
        const s = await enumerateState(page);
        const a = mergeEntries(accum, s.entries, 'resting', excludeOptions);
        report.cycles.push({ cycle, openersClicked: 0, added: a, accum: accum.size });
        if (a === 0) break;
      }
      const finalState = await enumerateState(page);
      const finalAdded = mergeEntries(accum, finalState.entries, 'resting', excludeOptions);
      report.cycles.push({ cycle: 'final-confirm', added: finalAdded, accum: accum.size });
      if (finalAdded > 0) {
        return { settled: false, activated, msg: `[FIXPOINT-EXHAUSTED] maxCycles=${maxCycles} exhausted; keys still growing (accum=${accum.size}). Refusing to emit a complete record for a page that never settled.` };
      }
    }
  }
  return { settled: true, activated };
}

async function main() {
  const rc = resolveRunConfig(args, MODULE_CONFIG);
  if (rc.error) { console.error(rc.error); process.exit(rc.exitCode); }
  const { office, moduleName, cfg, url } = rc;
  // Branch labels are namespaced with a colon ('tab:history'). A colon is legal in a POSIX
  // filename but on Windows NTFS it opens an alternate data stream, so `dsm-rwp--tab:region-weekly-peaks.json`
  // silently became a 0-byte file named `dsm-rwp--tab` with the JSON hidden in a stream no reader
  // looks at. Measured 2026-08-25 on both Discount Matrix branches. The colon is therefore stripped
  // like every other separator; the label still round-trips through --branch, which is unchanged.
  const state = (args.state || `${office}-${moduleName}`) + (args.branch ? `--${args.branch.replace(/[^a-z0-9]+/g, '-')}` : '');
  const authPath = args.auth || (existsSync(DEFAULT_AUTH) ? DEFAULT_AUTH : FALLBACK_AUTH);
  const maxCycles = parseInt(args['max-cycles'] || '6', 10);
  const useCdp = !args['no-cdp'];
  const headed = !!args.headed;

  if (args.branch) {
    if (!cfg) { console.error(`[FATAL] --branch requires a module config; none found for "${moduleName}".`); process.exit(2); }
    try { resolveBranchOpener(cfg, args.branch); } catch (err) { console.error(err.message); process.exit(2); }
  }

  if (!existsSync(authPath)) {
    console.error(`[FATAL] auth state not found: ${authPath}. Refresh via: playwright-cli open --persistent --profile=.auth\\e2e-profile`);
    process.exit(2);
  }

  // --- toothless-surface meta-gate (LR-069 §3.3): a module whose only requiredState is 'resting'
  //     AND has no opener patterns cannot be verified by verify-denominator.mjs — resting alone
  //     is a tautology (Item 1b). Warn or hard-fail before opening a browser. ---
  if (cfg) {
    const rs = cfg.requiredStates || [];
    const nonRestingStates = rs.filter(s => s.label !== 'resting');
    const openerCount = (cfg.openerTestidPatterns || []).length
                      + (cfg.openerRoleTextPatterns || []).length;
    if (nonRestingStates.length === 0 && openerCount === 0) {
      const mode = readGuardrailMode();
      if (mode === 'deny') {
        console.error(`[TOOTHLESS-SURFACE] module="${moduleName}" has no non-resting requiredStates and no opener patterns — denominator is unverifiable. Resolve required states before walking. (mode=deny)`);
        process.exit(4);
      } else {
        console.warn(`[TOOTHLESS-SURFACE] module="${moduleName}" has no non-resting requiredStates and no opener patterns — walk proceeds but denominator gate cannot verify it. (mode=${mode})`);
      }
    }
  }

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ storageState: authPath });
  const page = await context.newPage();
  // O3: auto-handle beforeunload / app dialogs so a dirty form can't wedge eval.
  page.on('dialog', d => d.accept().catch(() => {}));

  const report = { state, url, office, module: moduleName, authPath: authPath.replace(REPO_ROOT, '.'),
                   date: args.date || new Date().toISOString().slice(0, 10), cycles: [], branches: [] };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitReady(page);
    if (isLoginRedirect(page.url())) {
      const msg = `[ABORT-S1] redirected to login (${page.url()}). The saved session is stale — refresh ${authPath} via 'playwright-cli open --persistent' then 'state-save', and re-run. NOT enumerating the login page.`;
      console.error(msg);
      writeHaltedRecord(args, state, 0, 0, msg);
      await browser.close();
      process.exit(3);
    }

    const accum = new Map();
    const excludeOptions = cfg ? cfg.excludeOptionRoles : true;

    // --- activate configured sub-tabs by testid (trusted click + verify-retry — O1/O2) ---
    if (cfg && cfg.activateTabs) {
      report.tabActivate = [];
      for (const testid of cfg.activateTabs) {
        const res = await activateTabByTestid(page, testid, cfg.contentMarker);
        report.tabActivate.push({ testid, ...res });
        if (!res.ok) report.tabActivateNote = `failed to activate ${testid} after ${res.attempts} attempts (aria-selected never true)`;
      }
    }

    if (args.debug) {
      const sel = await page.locator('[data-testid="location-settings-sub-tab-pricing"]').first().getAttribute('aria-selected').catch(() => '?');
      const gridCount = await page.locator('[data-testid="location-settings-table-secondary-pricing"]').count().catch(() => -1);
      const altCount = await page.locator('[data-testid="location-settings-table-pricing-col-is-alternate"]').count().catch(() => -1);
      const frames = page.frames().length;
      console.error(`[debug] pre-enumerate: pricing aria-selected=${sel} gridCount=${gridCount} colIsAltCount=${altCount} frames=${frames} url=${page.url()}`);
    }

    let g1hits = [];
    if (args.branch) {
      // Capture the selected tab BEFORE the branch click. Only the resting path built base_state, so
      // the shared atEmit write below threw `Cannot set properties of undefined` and killed every branch
      // run after a full enumeration had already been paid for (measured 2026-08-25, both Discount Matrix
      // branches). NOTE atEmit is NOT proof the branch flipped: deriveAllFieldTypes renavigates to the
      // originating URL before atEmit is read, so on a branch run it always reports the DEFAULT panel.
      // The real proof the opener worked is report.branches[].addedKeys plus the branch panel's own
      // element keys appearing in entries.
      report.base_state = { atRest: await getSelectedTabs(page), atEmit: [] };
      // Branch-only path: click the single named opener, enumerate that surface only.
      const branchPattern = await activateBranch(page, cfg, args.branch);
      const branchState = await enumerateState(page);
      mergeEntries(accum, branchState.entries, args.branch, excludeOptions);
      // Portal-mounted branch surfaces live OUTSIDE <main> (Radix dialogs portal to body level),
      // so the container-scoped enumerateState above cannot see them — only the resting path ran
      // the portal scan before this fix (measured 2026-09-01: two Product Code dialog runs emitted
      // host-page-only manifests while the dialog was verifiably open via readySelector).
      const branchPortalEntries = await scanPortalElements(page);
      const branchPortalAdded = mergeEntries(accum, branchPortalEntries, args.branch, false);
      report.branches.push({ branch: args.branch, openerText: branchPattern.text, addedKeys: branchState.entries.length, portalKeys: branchPortalEntries.length, portalAdded: branchPortalAdded, ok: true });
    } else {    // --- resting-state enumeration + CDP G1 on its candidates (Pay To Address lives here) ---
    // Item 1(a): detect whether the page is genuinely at rest (no open dialogs/modals/popovers).
    // Only mark resting as observed when no overlay is blocking the base surface.
    const hasOpenOverlay = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]');
      for (const d of dialogs) {
        const cs = getComputedStyle(d);
        if (cs.display !== 'none' && cs.visibility !== 'hidden') return true;
      }
      const popovers = document.querySelectorAll('[data-state="open"], [aria-expanded="true"][aria-haspopup]');
      for (const p of popovers) {
        const cs = getComputedStyle(p);
        if (cs.display !== 'none' && cs.visibility !== 'hidden') return true;
      }
      return false;
    });
    report._restingObserved = !hasOpenOverlay;

    let cur = await enumerateState(page);
    if (args.debug) console.error(`[debug] resting enumerate: entries=${cur.entries.length} scanned=${cur.stats.scanned} candidates=${cur.candidates.length} restingObserved=${report._restingObserved}`);
    mergeEntries(accum, cur.entries, 'resting', excludeOptions);
    let g1hits = [];
    if (useCdp) {
      g1hits = await cdpG1Recovery(page, cur.candidates);
      for (const h of g1hits) {
        const prev = accum.get(h.key);
        if (prev) { prev.inA = true; if (!prev.why || prev.why === 'focusable') prev.why = 'cdp:listener'; }
        else accum.set(h.key, { key: h.key, role: h.role, name: h.name, why: 'cdp:listener', inA: true, inB: false, disabled: false, branches: ['resting'] });
      }
    }
    report.cycles.push({ cycle: 0, action: 'resting', scanned: cur.stats.scanned, shadowHosts: cur.stats.shadowHosts,
                         candidates: cur.candidates.length, g1hits: g1hits.length, accum: accum.size, restingObserved: report._restingObserved });
    report.base_state = { atRest: await getSelectedTabs(page), atEmit: [] };

    // --- self-expand to fixpoint (extracted — Build 2) ---
    const fixResult = await expandToFixpoint(page, accum, cfg, excludeOptions, maxCycles, report);
    const activated = fixResult.activated;
    if (!fixResult.settled) {
      console.error(fixResult.msg);
      writeHaltedRecord(args, state, accum.size, accum.size, fixResult.msg);
      await browser.close();
      process.exit(3);
    }

    // --- cascade lifecycle (detect → toggle → accumulate → restore) ---
    if (cfg && cfg.cascadeParentTestidPatterns) {
      const cascadeKeys = [...accum.keys()].filter(k => {
        const low = k.toLowerCase();
        return k.startsWith('testid:') && cfg.cascadeParentTestidPatterns.some(re => re.test(low));
      });
      for (const k of cascadeKeys.slice(0, 1)) {   // pilot: row-0 Is-Alternate represents the column archetype
        const sel = `[data-testid="${k.slice(7)}"]`;
        try {
          const loc = page.locator(sel).first();
          if (!(await loc.count())) continue;
          const before = accum.size;
          await loc.click({ timeout: 5000 });        // toggle ON (trusted — O2)
          await waitReady(page);
          const onState = await enumerateState(page);
          const added = mergeEntries(accum, onState.entries, 'cascade:alt-on', excludeOptions);
          await loc.click({ timeout: 5000 }).catch(() => {});   // O4: RESTORE before any navigation
          await waitReady(page);
          report.branches.push({ branch: 'cascade:alt-on', parentKey: k, addedKeys: added, accumBefore: before, accumAfter: accum.size, ok: true });
        } catch (e) { report.branches.push({ branch: 'cascade:alt-on', parentKey: k, error: String(e).slice(0, 120), ok: false }); }
      }
    }

    // --- Portal scan: Radix/headless-UI portals rendered at document.body root ---
    // Portals are only present when their trigger (select, dropdown, menu) is open.  Any portal left
    // open by the self-expand pass will be captured here.  When nothing is open the scan finds zero
    // elements — that is a safe no-op (no crash, no false elements added).
    // Full live portal-reach proof (portals opened by trigger clicks) requires a headed run; see
    // ASSUMPTIONS-MADE in the worker report.
    const portalEntries = await scanPortalElements(page);
    const portalAdded = mergeEntries(accum, portalEntries, 'portal-scan', false);
    report.cycles.push({ cycle: 'portal-scan', portalElements: portalEntries.length, added: portalAdded, accum: accum.size });

    // --- location-driver pass: select a real location + non-ALL currency to expose picker controls ---
    // Implements CORRECTION 1 (dg-phase1b-01): NM-1472 shows the Product-Group Picker add controls
    // only appear after a specific location AND non-ALL currency are selected. Drives this state
    // programmatically using selectors from CorporatePricingOverrideSelectors. office 1101 used
    // because Labor product groups repro there (NM-1881); not 1604.
    if (cfg && cfg.locationDriver) {
      const { searchTerm, branchLabel } = cfg.locationDriver;
      try {
        const trigger = page.locator('text=Change Local Office').first();
        if (await trigger.count()) {
          await trigger.click({ timeout: 8000 });
          const searchInput = page.locator('input[placeholder="Search by Location Name, Number"]').first();
          await searchInput.waitFor({ state: 'visible', timeout: 10000 });
          await page.locator('[role="dialog"] tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
          // Bounded retry in case the Radix modal open-animation races the fill (mirrors selectLocation).
          for (let attempt = 1; ; attempt++) {
            try { await searchInput.fill(searchTerm, { timeout: 6000 }); break; }
            catch (err) {
              if (attempt >= 3) throw err;
              await page.keyboard.press('Escape').catch(() => {});
              await searchInput.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
              await trigger.click({ timeout: 8000 });
              await searchInput.waitFor({ state: 'visible', timeout: 10000 });
            }
          }
          const row = page.locator('[role="dialog"] tbody tr').filter({ hasText: searchTerm }).first();
          await row.waitFor({ state: 'visible', timeout: 10000 });
          await row.locator('[role="checkbox"]').first().check();
          await page.locator('button:text-is("Select")').first().click();
          await waitReady(page);
          // Select the first non-ALL currency to expose the Product-Group Picker add controls (NM-1472).
          let currencyVerified = false;
          const currencyBtn = page.locator('button[role="combobox"]:has-text("ALL")').first();
          if (await currencyBtn.count()) {
            await currencyBtn.click({ timeout: 5000 });
            const opts = page.locator('[role="option"]');
            await opts.first().waitFor({ state: 'visible', timeout: 8000 });
            // Scan the open currency portal now — after a non-ALL option is selected the combobox
            // text changes away from 'ALL', making the openerRoleTextPatterns entry unmatchable in
            // any subsequent pass.  Record the expand:currency branch inline while the portal is open.
            const currencyOpenerPattern = cfg.openerRoleTextPatterns && cfg.openerRoleTextPatterns.find(p => p.role === 'combobox' && p.text === 'ALL');
            if (currencyOpenerPattern) {
              const currencyBranch = currencyOpenerPattern.branch || `expand:${currencyOpenerPattern.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-menu`;
              const currencyPortalEntries = await scanPortalElements(page);
              const currencyPortalAdded = mergeEntries(accum, currencyPortalEntries, currencyBranch, false);
              report.branches.push({ branch: currencyBranch, openerText: currencyOpenerPattern.text, addedKeys: currencyPortalAdded, ok: true });
              activated.add(`roletext:${currencyOpenerPattern.role}:${currencyOpenerPattern.text}`);
            }
            const optTexts = (await opts.allInnerTexts()).map(t => t.trim()).filter(Boolean);
            const nonAll = optTexts.find(t => t !== 'ALL');
            if (nonAll) {
              await page.locator('[role="option"]').filter({ hasText: nonAll }).first().click();
              await waitReady(page);
              currencyVerified = (await page.locator('button[role="combobox"]:has-text("ALL")').count()) === 0;
            } else {
              await page.keyboard.press('Escape');
            }
          }
          const locState = await enumerateState(page);
          const locAdded = mergeEntries(accum, locState.entries, branchLabel, excludeOptions);
          if (currencyVerified) {
            report.branches.push({ branch: branchLabel, searchTerm, addedKeys: locAdded, ok: true });
          } else {
            report.branches.push({ branch: branchLabel, searchTerm, addedKeys: locAdded, ok: false, note: 'location selected but currency not verified non-ALL — compound state not achieved' });
          }
        } else {
          report.branches.push({ branch: branchLabel, note: '"Change Local Office" trigger not found — location-driver skipped', ok: false });
        }
      } catch (e) {
        report.branches.push({ branch: branchLabel, error: String(e).slice(0, 200), ok: false });
      }
    }

    // --- post-location opener pass: re-run role/text openers unreachable on the pre-location empty state ---
    // Only fires for surfaces that declare locationDriver. Patterns that already produced an ok:true
    // branch record (tab:labor from pass 1, expand:currency from the inline driver scan) are skipped
    // — no duplicate branch records accumulate.
    if (cfg && cfg.locationDriver && cfg.openerRoleTextPatterns) {
      for (const pattern of cfg.openerRoleTextPatterns) {
        const activatedKey = `roletext:${pattern.role}:${pattern.text}`;
        const branch = pattern.branch || `expand:${pattern.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-menu`;
        if (report.branches.some(b => b.branch === branch && b.ok)) continue;
        try {
          const loc = pattern.selector
            ? page.locator(pattern.selector)
            : page.getByRole(pattern.role, { name: pattern.text, exact: true });
          if (!(await loc.count())) {
            report.branches.push({ branch, openerText: pattern.text, note: 'not found after location driver', ok: false });
            continue;
          }
          await loc.first().click({ timeout: 5000 });
          await waitReady(page);
          const inlinePortals = await scanPortalElements(page);
          mergeEntries(accum, inlinePortals, branch, false);
          report.branches.push({ branch, openerText: pattern.text, addedKeys: inlinePortals.length, ok: true });
          activated.add(activatedKey);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        } catch (err) {
          report.branches.push({ branch, openerText: pattern.text, error: String(err).slice(0, 120), ok: false });
          activated.add(activatedKey);
        }
      }
    }

    // --- Item 5: §20 state-graph exhaustion — detect interactive containers never opened ---
    // Scan for dialogs, menus, popovers that are present in the DOM but were never activated
    // during the walk. Their controls should join the denominator; an unopened container is a finding.
    const unopenedContainers = await page.evaluate(() => {
      const containers = [];
      const interactiveContainers = document.querySelectorAll(
        '[role="dialog"], [role="menu"], [role="listbox"], [aria-haspopup="true"], ' +
        '[aria-haspopup="dialog"], [aria-haspopup="menu"], [aria-haspopup="listbox"], ' +
        '[data-state="closed"], [aria-expanded="false"]'
      );
      for (const el of interactiveContainers) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const testid = el.getAttribute('data-testid') || '';
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
        containers.push({ testid, role, name, tag: el.tagName.toLowerCase() });
      }
      return containers;
    });
    const activatedKeys = new Set([...activated].map(k => k.toLowerCase()));
    const neverOpened = unopenedContainers.filter(c => {
      const key = c.testid ? `testid:${c.testid}` : `${c.role}:${c.name}`;
      return !activatedKeys.has(key.toLowerCase()) && !activatedKeys.has(`roletext:${c.role}:${c.name}`.toLowerCase());
    });
    report.stateGraphExhaustion = {
      containersFound: unopenedContainers.length,
      neverOpened: neverOpened.length,
      samples: neverOpened.slice(0, 10),
    };
    if (neverOpened.length > 0 && cfg) {
      const declaredExpansion = (cfg.openerTestidPatterns || []).length + (cfg.openerRoleTextPatterns || []).length;
      if (declaredExpansion === 0) {
        const mode = readGuardrailMode();
        const msg = `[STATE-GRAPH-EXHAUSTION] module="${moduleName}" declares no reachable-state expansion but enumeration found ${neverOpened.length} interactive container(s) never opened: ${neverOpened.slice(0, 3).map(c => c.testid || c.name).join(', ')}`;
        if (mode === 'deny') {
          console.error(msg + ' (mode=deny — FAILING)');
          report.stateGraphExhaustion.verdict = 'FAIL';
        } else {
          console.warn(msg + ` (mode=${mode})`);
          report.stateGraphExhaustion.verdict = 'ANNOUNCE';
        }
      }
    }

    }

    // --- archetype-collapse (F3/G8) + set algebra (M4) ---
    const rawEntries = [...accum.values()];
    const entries = collapseArchetypes(rawEntries, parseInt(args['archetype-threshold'] || '4', 10));
    const algebra = setAlgebra(entries);

    report.denominator = entries.length;
    report.rawBeforeArchetypeCollapse = rawEntries.length;
    report.setAlgebra = { union: algebra.unionCount, intersection: algebra.intersectionCount, symDiff: algebra.symDiffCount };
    report.symDiffReview = algebra.symDiff;
    report.g1Recovered = g1hits;
    report.entries = entries;

    // Zero-denominator backstop: any redirect shape, error page, or blank render
    // that slips past isLoginRedirect() still produces no elements — catch it here.
    if (entries.length === 0) {
      const msg = `[ABORT-S1] zero elements enumerated on ${page.url()} — likely a redirect, error page, or blank render. Refusing to write a false-complete record.`;
      console.error(msg);
      writeHaltedRecord(args, state, 0, rawEntries.length, msg);
      await browser.close();
      process.exit(3);
    }

    // Cause-1 fix: the opener loop may have left the page on a History tab or other mounted panel.
    // Navigate back to the originating URL so Phase 2.2 reads DOM from the correct mounted panel.
    const taxonomy = loadFieldCaseTaxonomy();
    const legalTypes = taxonomy.fieldTypes.map(ft => ft.type);
    report.derived_types = await deriveAllFieldTypes(page, url, entries, rawEntries, legalTypes,
      args.branch ? (pg) => activateBranch(pg, cfg, args.branch) : null);

    // --- completion_record: attach before JSON write; self-hash for anti-tamper ---
    // Build the record first (without content_sha256), serialize, compute sha256 over that,
    // then embed the hash.  Any file mutation after this point will fail the gate's re-verify.
    report.base_state.atEmit = await getSelectedTabs(page);
    report.completion_record = {
      version: 1,
      status: 'complete',
      surfaces_attempted: [state],
      surfaces_enumerated: [state],
      element_count: entries.length,
      raw_before_collapse: rawEntries.length,
      halt_reasons: [],
    };
    const preHash = JSON.stringify(report, null, 2) + '\n';
    report.completion_record.content_sha256 = createHash('sha256').update(preHash).digest('hex');

    // --- emit JSON provenance + markdown manifest scaffold ---
    const outDir = join(REPO_ROOT, 'reports', 'walk-coverage');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const jsonPath = args.out ? resolve(REPO_ROOT, args.out) : join(outDir, `${state}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    // Item 1(a): resting enters the walked set ONLY when observed, not hardcoded.
    // The resting enumeration at cycle 0 is the observation; if the page was not genuinely
    // at rest (e.g., started on an open dialog), restingObserved will be false.
    const walkedStateLabels = [...new Set([
      ...(report._restingObserved ? ['resting'] : []),
      ...report.branches.filter(b => b.ok && b.branch).map(b => b.branch),
    ])];
    const walkStateStr = `office=${office} module=${moduleName} walked=[${walkedStateLabels.join(',')}]`;
    const manifestMd = renderManifest({ walkState: walkStateStr, entries,
      machineFoundDate: report.date, sourceJson: `reports/walk-coverage/${state}.json`,
      completionRecord: report.completion_record, baseState: report.base_state });
    const mdPath = jsonPath.replace(/\.json$/, '.manifest.md');
    writeFileSync(mdPath, manifestMd, 'utf-8');

    console.log(`[walk:enumerate] state=${state} denominator=${entries.length} (raw=${rawEntries.length}, archetype-collapsed)`);
    console.log(`  union=${algebra.unionCount} intersection=${algebra.intersectionCount} A△B-review=${algebra.symDiffCount} | CDP-G1 hits=${g1hits.length}`);
    console.log(`  cycles=${report.cycles.length} branches=${report.branches.length}`);
    console.log(`  JSON: ${jsonPath.replace(REPO_ROOT, '.')}`);
    console.log(`  Manifest: ${mdPath.replace(REPO_ROOT, '.')}`);
  } catch (e) {
    console.error(`[FATAL] ${String(e).slice(0, 300)}`);
    // Write halted completion_record to JSON before exit — spec requires this on any error path.
    try {
      const haltDir = join(REPO_ROOT, 'reports', 'walk-coverage');
      if (!existsSync(haltDir)) mkdirSync(haltDir, { recursive: true });
      const haltJsonPath = args.out ? resolve(REPO_ROOT, args.out) : join(haltDir, `${state}.json`);
      report.completion_record = {
        version: 1,
        status: 'halted',
        surfaces_attempted: [state],
        surfaces_enumerated: [],
        element_count: 0,
        raw_before_collapse: 0,
        halt_reasons: [String(e).slice(0, 200)],
      };
      writeFileSync(haltJsonPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    } catch { /* swallow — already in error path */ }
    await browser.close();
    process.exit(1);
  }
  await browser.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { main(); }

