import { CORPORATE_PRICING_COMMON, CORPORATE_PRICING_FIXTURES } from './common';

export const STRATEGY = {
  office: CORPORATE_PRICING_COMMON.office,
  pricebookGuid: CORPORATE_PRICING_FIXTURES.strategyFixture.guid,
  pricebookName: CORPORATE_PRICING_FIXTURES.strategyFixture.name,

  fixtureStrategyName: '2022-NP Tier 1',

  header: {
    name: '2022-NP Tier 1',
    type: 'Equipment',
    year: '2022',
    currency: 'USD',
    active: 'Active',
  },

  flags: {
    isProductions: { checked: true, disabled: false },
    isInternal: { checked: false, disabled: true },
    isGSO: { checked: false, disabled: true },
    isActive: { checked: true, disabled: false },
  },

  /**
   * Cross-surface seed for TC-CPR-STR-013 ("Locations Using Pricing As Default" grid).
   * Live-verified 2026-06-29: office 1604's Primary Equipment Pricing = this strategy ⇒ office 1604
   * appears in the strategy's grid. The grid is a read-only back-reference populated by a location
   * selecting the strategy as its Primary Pricing — so the test points office 1604's Primary
   * Equipment Pricing at this strategy, asserts 1604 surfaces in the grid, then restores the
   * location's original selection (the prior fixed-assignment data 1991/7011 had been reassigned
   * away, which is exactly what made the old row-shape loop pass vacuously on an empty grid).
   */
  crossSurfaceSeed: {
    office: '1604',
    strategyName: '2026-Tier 2 Resort B',
    pricebookGuid: 'd4f8d502-ca92-5fdf-91d6-5b1bee109f54',
  },

  reversibleEdit: {
    editedName: '2022-NP Tier 1 (qa)',
    restoredName: '2022-NP Tier 1',
  },

  newStrategyPayload: {
    name: 'ZZ-QA-TEMP-STRATEGY (discard)',
  },

  liveTabs: ['Pricing Strategy', 'Pricing Detail'] as const,
  docxTabs: ['Pricing Strategy', 'Pricing Detail', 'History'] as const,
  absentTab: 'History',

  /** Deep-coverage (NM-2261) — in-session strategy names; never saved (reload discards). */
  deep: {
    alpha: 'ZZ-QA-Alpha (discard)',
    bravo: 'ZZ-QA-Bravo (discard)',
    charlie: 'ZZ-QA-Charlie (discard)',
    inactiveFlag: 'ZZ-QA-Inactive-Flag (discard)',
    gsoFlag: 'ZZ-QA-GSO-Flag (discard)',
    internalFlag: 'ZZ-QA-Internal-Flag (discard)',
    productionsFlag: 'ZZ-QA-Productions-Flag (discard)',
    overLengthName: 'A'.repeat(255),
    nameMaxLength: 100,
    specialName: 'ZZ-Test & <Strategy> "2026"',
    duplicateName: '2022-NP Tier 1',
    duplicateError: 'A pricing strategy with this name already exists.',
    specialPersistName: '2022-NP Tier 1 & "QA"',
  },
} as const;
