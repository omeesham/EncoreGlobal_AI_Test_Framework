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

// The filter is computed from grid rows, so this holds only on a clean 1604 — currency pollution
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

// Office 1604 baseline for ensureDefaultState. The five primary dropdowns are deliberately absent:
// they start unset with no canonical default, and the 1605 tests restore their own to unset.
export const PRICING_DEFAULTS = {
  corporatePricing: true,
  priceGuideInclusive: true,
  gridRows: [PRIMARY_TEST_ROW, SECONDARY_TEST_ROW, TERTIARY_TEST_ROW],
} as const;

// Office 1604 is USD-only (no CAD/MXN dropdowns render); 1605 renders all 15 primary dropdowns.

export const MULTI_CURRENCY_OFFICE_NO = '1605';

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
export const MXN_PRIMARY_PERSISTENCE_CASES = [
  { tcId: 'TC-LOC-PRI-037', key: 'drpPrimaryLaborPricingMXN', option: 'MEX DYN LB1 MXN 2025', label: 'Primary Labor Pricing (MXN)' },
  { tcId: 'TC-LOC-PRI-038', key: 'drpPrimaryEquipmentPricingMXN', option: 'MEX BO CDMX MXN 2025', label: 'Primary Equipment Pricing (MXN)' },
] as const;
