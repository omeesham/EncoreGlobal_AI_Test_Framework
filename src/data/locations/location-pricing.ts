export const PRICING_COLUMN_HEADERS = [
  'Pricing Strategy',
  'Pricebook',
  'Currency',
  'Is Alternate',
  'Use Effective Dates',
  'Start Date',
  'End Date',
] as const;

export const PRIMARY_PRICING_DROPDOWNS = [
  'drpPrimaryLaborPricingUSD',
  'drpPrimaryEquipmentPricingUSD',
  'drpPrimaryInternalEquipmentPricingUSD',
  'drpPrimaryProductionLaborPricingUSD',
  'drpPrimaryProductionEquipmentPricingUSD',
] as const;

// The filter is computed from grid rows, so this holds only on a clean USD-only office — currency pollution
// from location-currency.spec.ts adds price-book rows and grows the list.
export const CURRENCY_FILTER_OPTIONS = ['All', 'USD'] as const;

export const PRIMARY_TEST_ROW = '2021-Tier 3 Urban A';

export const SECONDARY_TEST_ROW = '2022-Zone 5 A';

export const TERTIARY_TEST_ROW = '2022-Zone 1 A';

export const MULTI_ALT_PRICEBOOKS = [
  PRIMARY_TEST_ROW,
  SECONDARY_TEST_ROW,
  TERTIARY_TEST_ROW,
] as const;

export const DEFAULT_CURRENCY_FILTER = 'All';

/** alternateOption exists so a test always changes the dropdown — selectPrimaryDropdownOption silently skips when the DB value already matches. */
export const DROPDOWN_PERSISTENCE_CASES = [
  { tcId: 'TC-LOC-PRI-026', key: 'drpPrimaryLaborPricingUSD', option: '2026-Zone 3 D', alternateOption: '2026-Zone 3 E', label: 'Primary Labor Pricing' },
  { tcId: 'TC-LOC-PRI-027', key: 'drpPrimaryEquipmentPricingUSD', option: '2026-Tier 2 Resort B', alternateOption: '2026-Tier 2 Resort A', label: 'Primary Equipment Pricing' },
  { tcId: 'TC-LOC-PRI-028', key: 'drpPrimaryInternalEquipmentPricingUSD', option: '2023-Internal2', alternateOption: '2023-Internal1', label: 'Primary Internal Equipment Pricing' },
  { tcId: 'TC-LOC-PRI-029', key: 'drpPrimaryProductionLaborPricingUSD', option: '2026-NP LB3', alternateOption: '2026-NP LB2', label: 'Primary Production Labor Pricing' },
  { tcId: 'TC-LOC-PRI-030', key: 'drpPrimaryProductionEquipmentPricingUSD', option: '2026-NP Tier 2', alternateOption: '2026-NP Tier 1', label: 'Primary Production Equipment Pricing' },
] as const;

export const DATE_TEST_VALUES = {
  startDate: '04/01/2026',
  endDate: '04/30/2026',
} as const;

export const TC033_DATE_VALUES = {
  startDate: '05/01/2026',
  endDate: '05/31/2026',
} as const;

// The USA office for this suite. Deliberately NOT common.ts OFFICE_NO (1604), which other specs share.
// 1606 has the same USD-only grid and strategies as 1604. Verified live 2026-09-25 — see
// specs_planning/_internal/field-inventories/pricing-1606-usd-2026-09-25.md.
export const USA_OFFICE_NO = '1606';

// Office 1606 baseline for ensureDefaultState. The five primary dropdowns are deliberately absent:
// they have no canonical default, so dropdown cases self-baseline via `alternateOption` instead.
// 1606 loads with Enable Price Escalator CHECKED — its saved value — so the escalator cases toggle
// away from whatever loads rather than assuming unchecked.
export const PRICING_DEFAULTS_USA = {
  corporatePricing: true,
  priceGuideInclusive: true,
  enablePriceEscalator: true,
  gridRows: [PRIMARY_TEST_ROW, SECONDARY_TEST_ROW, TERTIARY_TEST_ROW],
} as const;

// Office 1605 baseline (the multi-currency cases). Kept separate from 1606 so neither office is ever
// reset to the other's saved settings.
export const PRICING_DEFAULTS = {
  corporatePricing: true,
  priceGuideInclusive: true,
  enablePriceEscalator: false,
  gridRows: [PRIMARY_TEST_ROW, SECONDARY_TEST_ROW, TERTIARY_TEST_ROW],
} as const;

// The grid persists sort + column visibility here, and it SURVIVES A FULL RELOAD. Left alone it
// leaks row order from one test into the next, so every test clears it before navigating.
export const GRID_PREF_STORAGE_KEY = 'navigator-location-pricing-table';

// Both fire on every confirmed save; TC-LOC-PRI-031 asserts the pair (Tier-2 save verification).
export const SAVE_API_ROUTES = {
  updateProperties: '/api/location/update-properties',
  upsertPricebook: '/api/location/pricebook/upsert-location-pricebook',
} as const;

// Verbatim app strings. The start-date message renders only in a hover tooltip; the end-date
// invalid state renders a red ring with NO message at all (BUG-LOC-PRI-002).
export const PRICING_MESSAGES = {
  startDateRequired: 'Pricing Effective start date must be set to a date value when using Effective Dates.',
  noPricingStrategyFound: 'No pricing strategy found.',
} as const;

// End < Start. Accepted by the UI, saves 200, then silently discarded — BUG-LOC-PRI-002.
export const INVALID_DATE_RANGE = {
  startDate: '04/01/2026',
  endDate: '03/01/2026',
} as const;

export const GRID_OPTIONS_COLUMNS = PRICING_COLUMN_HEADERS;

// Column toggled by the Grid Options cases. "Currency" is the safe pick: it is not the row anchor,
// so hiding it never breaks the content-anchored row lookups the other tests rely on.
export const TOGGLE_COLUMN = 'Currency';

// Office 1604 is USD-only (no CAD/MXN dropdowns render); 1605 renders all 15 primary dropdowns.

export const MULTI_CURRENCY_OFFICE_NO = '1605';

// Currency-filter anchor on 1605. The filter matches strictly on the row's own currency, so this
// row is present only under MXN (and absent under All, which renders the USD rows at the top of the
// virtualized window). Verified live 2026-09-23 — pricing-2026-09-23.md "Currency filter" section.
export const MXN_TEST_ROW = 'MEX BO CDMX MXN 2021';

export const PRIMARY_PRICING_DROPDOWNS_CAD = [
  'drpPrimaryLaborPricingCAD',
  'drpPrimaryEquipmentPricingCAD',
  'drpPrimaryInternalEquipmentPricingCAD',
  'drpPrimaryProductionLaborPricingCAD',
  'drpPrimaryProductionEquipmentPricingCAD',
] as const;

export const PRIMARY_PRICING_DROPDOWNS_MXN = [
  'drpPrimaryLaborPricingMXN',
  'drpPrimaryEquipmentPricingMXN',
  'drpPrimaryInternalEquipmentPricingMXN',
  'drpPrimaryProductionLaborPricingMXN',
  'drpPrimaryProductionEquipmentPricingMXN',
] as const;

// Only these two of the ten CAD/MXN dropdowns carry pricing strategies on 1605 — the rest show
// "No pricing strategy found." and have no value to persist.
// ── Office 7147 (Mexico) — a THIRD currency shape: USD + MXN, no CAD group ──────────────────
// 1604 is USD-only (5 dropdowns), 1605 is USD/CAD/MXN (15), 7147 is USD/MXN (10). Verified live
// 2026-09-24 — see specs_planning/_internal/field-inventories/pricing-7147-mxn-2026-09-24.md.
export const MEXICO_OFFICE_NO = '7147';

export const MEXICO_CURRENCY_FILTER_OPTIONS = ['All', 'USD', 'MXN'] as const;

// A real MXN row on 7147. It renders only while the Currency filter is on MXN — under `All` the
// USD rows occupy the top of the virtualized window and this row is not in the DOM at all.
export const MEXICO_MXN_ROW = 'MEX BO CDMX MXN 2021';

// The MXN Labor Pricing value 7147 loads with, plus a different real MXN strategy to switch to so
// the save is always a genuine net change.
export const MEXICO_MXN_LABOR = {
  loaded: 'MEX LB23H MXN 2026',
  alternate: 'MEX LB1 MXN 2026',
} as const;

// 7147 loads with Include Service Fee in Price Guides UNCHECKED, unlike 1604. That is per-office by
// design, so the office must not be reset against the 1604 baseline or the suite would silently
// flip a real setting on every run.
export const PRICING_DEFAULTS_MEXICO = {
  corporatePricing: true,
  priceGuideInclusive: false,
  enablePriceEscalator: false,
  gridRows: [PRIMARY_TEST_ROW, SECONDARY_TEST_ROW, TERTIARY_TEST_ROW],
} as const;

// All TEN primary dropdowns on 7147 carry selectable strategies as of 2026-09-24 (the three MXN
// production/internal lists were empty before that). `option` is a real strategy that differs from
// the value the office loads with, so the save is always a genuine net change. Six of the ten load
// as `--Select--`; those restore by RE-CLICKING the selected option, which Radix treats as a
// deselect — verified end to end (select → save → reload → deselect → save → reload) during the
// 2026-09-24 walk, including on production-labor-MXN, which has exactly ONE option and therefore no
// alternative route back to `--Select--`.
export const MEXICO_DROPDOWN_PERSISTENCE_CASES = [
  { tcId: 'TC-LOC-PRI-074', key: 'drpPrimaryLaborPricingUSD', option: '2022-Zone 5 A', label: 'Primary Labor Pricing (USD)' },
  { tcId: 'TC-LOC-PRI-075', key: 'drpPrimaryEquipmentPricingUSD', option: '2021-Tier 3 Urban A', label: 'Primary Equipment Pricing (USD)' },
  { tcId: 'TC-LOC-PRI-076', key: 'drpPrimaryInternalEquipmentPricingUSD', option: '2023-Internal1', label: 'Primary Internal Equipment Pricing (USD)' },
  { tcId: 'TC-LOC-PRI-077', key: 'drpPrimaryProductionLaborPricingUSD', option: '2022-NP LB3', label: 'Primary Production Labor Pricing (USD)' },
  { tcId: 'TC-LOC-PRI-078', key: 'drpPrimaryProductionEquipmentPricingUSD', option: '2022-NP Tier 1', label: 'Primary Production Equipment Pricing (USD)' },
  { tcId: 'TC-LOC-PRI-079', key: 'drpPrimaryLaborPricingMXN', option: '2027-28 Tier 3 - GSO Internal', label: 'Primary Labor Pricing (MXN)' },
  { tcId: 'TC-LOC-PRI-080', key: 'drpPrimaryEquipmentPricingMXN', option: 'MEX BO CDMX MXN 2021', label: 'Primary Equipment Pricing (MXN)' },
  { tcId: 'TC-LOC-PRI-081', key: 'drpPrimaryInternalEquipmentPricingMXN', option: '2026-27 fiscal year Internal', label: 'Primary Internal Equipment Pricing (MXN)' },
  { tcId: 'TC-LOC-PRI-082', key: 'drpPrimaryProductionLaborPricingMXN', option: '2026-27-*Tier 2 - In Production', label: 'Primary Production Labor Pricing (MXN)' },
  { tcId: 'TC-LOC-PRI-083', key: 'drpPrimaryProductionEquipmentPricingMXN', option: '2025-26-27 In prod', label: 'Primary Production Equipment Pricing (MXN)' },
] as const;

// ── Office 2359 (Canada, Toronto Hilton) — a FOURTH currency shape: CAD only, no USD group ──────
// Verified live 2026-09-25 — see
// specs_planning/_internal/field-inventories/pricing-2359-cad-2026-09-25.md.
export const CANADA_OFFICE_NO = '2359';

export const CANADA_CURRENCY_FILTER_OPTIONS = ['All', 'CAD'] as const;

// The ONLY two grid rows on 2359, both CAD, both from pricebook "Can Price Book Aru". Anchor on the
// strategy name — the pricebook name is shared, so it would match both rows.
export const CANADA_CAD_ROW = 'Can PStr Aru1';
export const CANADA_CAD_ROW_2 = 'Can PStr2';

// Only Equipment (CAD) carries strategies on 2359; the other four CAD dropdowns show the empty
// message. All five load unset.
export const CANADA_EQUIPMENT_CAD = {
  key: 'drpPrimaryEquipmentPricingCAD',
  options: ['Can PStr Aru1', 'Can PStr2'],
} as const;

export const CANADA_EMPTY_CAD_DROPDOWNS = [
  'drpPrimaryLaborPricingCAD',
  'drpPrimaryInternalEquipmentPricingCAD',
  'drpPrimaryProductionLaborPricingCAD',
  'drpPrimaryProductionEquipmentPricingCAD',
] as const;

// 2359 loads with Include Service Fee UNCHECKED (like 7147, unlike 1604) — its own baseline, so the
// suite never flips a real setting.
export const PRICING_DEFAULTS_CANADA = {
  corporatePricing: true,
  priceGuideInclusive: false,
  enablePriceEscalator: false,
  gridRows: [CANADA_CAD_ROW, CANADA_CAD_ROW_2],
} as const;

// The placeholder an unset primary dropdown renders. Restoring to this exact string is what proves a
// case put the office back as it found it.
export const DROPDOWN_UNSET = '--Select--';

export const MXN_PRIMARY_PERSISTENCE_CASES = [
  { tcId: 'TC-LOC-PRI-037', key: 'drpPrimaryLaborPricingMXN', option: 'MEX DYN LB1 MXN 2025', label: 'Primary Labor Pricing (MXN)' },
  { tcId: 'TC-LOC-PRI-038', key: 'drpPrimaryEquipmentPricingMXN', option: 'MEX BO CDMX MXN 2025', label: 'Primary Equipment Pricing (MXN)' },
] as const;
