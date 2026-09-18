// scripts/walk-coverage/lib/module-config.mjs
// Pure data — no imports, no side effects.
// Single source of truth for per-module requiredStates consumed by verify-denominator.mjs
// (W-DENOM gate, LR-062). Must stay in sync with the requiredStates entries in
// enumerate-page.mjs MODULE_CONFIG whenever a module's required walk states change.
//
// Item 1(c): A resting-only declaration MUST carry an `evidence` field citing the enumeration
// run that found zero openers, or verify-denominator will fail it. A hand-written comment
// is not evidence — the evidence field must reference a dated walk artifact or run ID.

export const MODULE_CONFIG = {
  // Service Charge — resting state (Basic Information tab default) + History tab state.
  // Discount Matrix — CMX rides the resting pass (it is the default tab); RWP and LOA are branches.
  'discount-matrix': {
    requiredStates: [
      { label: 'resting' },
      { label: 'tab:region-weekly-peaks' },
      { label: 'tab:location-activation' },
    ],
  },
  // Discount Matrix per-submodule inventories (split 2026-08-27 to pair one inventory per
  // test-case file). Each split artifact binds to its own single-state manifest.
  'discount-matrix-criteria': {
    requiredStates: [{
      label: 'resting',
      evidence: 'enumeration:2026-08-25:dsm-crt-skelgate.json (resting-state record, 17 elements) — NOT a zero-openers claim: the two tab branch states are owned by the sibling split registrations below, and the three in-module unopened openers are recorded in the artifact opener-frontier',
    }],
  },
  'discount-matrix-region-weekly-peaks': {
    requiredStates: [{ label: 'tab:region-weekly-peaks' }],
  },
  'discount-matrix-location-activation': {
    requiredStates: [{ label: 'tab:location-activation' }],
  },
  'service-charge': {
    requiredStates: [
      { label: 'resting' },
      { label: 'tab:history' },
    ],
  },
  pricing: {
    requiredStates: [{ label: 'resting' }, { label: 'cascade:alt-on' }],
    dependencyPairs: [
      { source: 'override-price', dependent: 'current-price', description: 'Override Price → Current Price' },
      { source: 'max-discount', dependent: 'location-pricing-export', description: 'Max Discount → Location Pricing export value' },
    ],
    editableFields: ['override-price', 'max-discount'],
  },
  'corporate-pricing-search': {
    requiredStates: [{ label: 'resting' }, { label: 'expand:import-menu' }],
  },
  // Strategy tab: resting-only declaration with evidence from enumeration run.
  'corporate-pricing-strategy': {
    requiredStates: [{ label: 'resting', evidence: 'enumeration:2026-06-05:zero-openers-found' }],
  },
  // Pricing Detail grid: resting-only declaration with evidence from enumeration run.
  'corporate-pricing-detail': {
    requiredStates: [{ label: 'resting', evidence: 'enumeration:2026-06-05:zero-openers-found' }],
  },
  // New Pricebook form: resting-only declaration with evidence from enumeration run.
  'corporate-pricing-new-pricebook': {
    requiredStates: [{ label: 'resting', evidence: 'enumeration:2026-06-05:zero-openers-found' }],
  },
  // Override surface has two tabs (Equipment/Labor), a currency combobox, and a rows-per-page
  // combobox — each exposes distinct elements. A re-walk with a location selected and a non-ALL
  // currency additionally exposes the Product-Group Picker add controls (NM-1472).
  // Item Search (NM-2253, office 1101 only) — products page: resting (search panel + empty grid +
  // full header set) + post-search grid (pagination bar, result rows, selectItem/ownedCount cells
  // mount only after a Search click) + Grid Options column menu. Row-selection toolbar and the
  // View/Add Product Code dialogs are multi-step states (search → row click → button) the one-click
  // branch mechanism cannot reach — they are walked agent-driven with snapshot/probe evidence and
  // recorded in the walk artifact's opener-frontier section, per §20-Q.
  'item-search': {
    requiredStates: [
      { label: 'resting' },
      { label: 'search:executed' },
      { label: 'expand:grid-options' },
    ],
  },
  // Product Code dialogs (View/Add) on the products URL — multi-step states reached via the
  // enumerate-page preSteps mechanism (2026-09-01; supersedes the "cannot reach" note above for
  // this sub-surface). Artifact: field-inventories/item-search-product-code-<DATE>.md.
  'item-search-product-code': {
    requiredStates: [
      { label: 'dialog:view-product-code' },
      // View-dialog sub-states (2026-09-14, PLAN_NM2255 P9 — third pre-step in enumerate-page.mjs).
      { label: 'tab:history' },
      { label: 'tab:translations' },
      { label: 'segment:sub-class' },
      { label: 'segment:class' },
      { label: 'segment:sub-category' },
      { label: 'segment:category' },
      { label: 'menu:view-caret' },
      { label: 'dialog:add-product-code' },
    ],
  },
  // Product Groups sibling URL (…/products/product-groups): own search panel + Add-group dialog.
  'item-search-product-groups': {
    requiredStates: [
      { label: 'resting' },
      { label: 'search:executed' },
      // 'dialog:add-group' dropped 2026-09-09 — Add is a route to the Add page, which has its own entry below.
    ],
  },
  'item-search-add-product-group': {
    requiredStates: [
      { label: 'resting' },
      { label: 'expand:service-type' },
      { label: 'expand:sort-order' },
    ],
  },
  'corporate-override': {
    requiredStates: [
      { label: 'resting' },
      { label: 'tab:labor' },
      { label: 'expand:currency' },
      { label: 'expand:rows-per-page' },
      { label: 'location-selected+non-all-currency' },
    ],
    dependencyPairs: [
      { source: 'override-price', dependent: 'current-price', description: 'Override Price → Current Price (per-location)' },
    ],
    editableFields: ['override-price'],
  },
};
