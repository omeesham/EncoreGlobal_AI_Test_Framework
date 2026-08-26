export const CORP_PRICING_SEARCH_API = '/navigator/api/location/pricing/strategies' as const;

export const CORP_PRICING_SEARCH = {
  liveColumns: [
    'Price Book',
    'Price Book Strategy',
    'Price Year',
    'Is GSO',
    'Is Internal',
    'Is Labor',
    'Is Active',
    'Is Productions',
    'Currency',
  ] as const,

  docxColumns: [
    'Price Book',
    'Price Book Strategy',
    'Price Year',
    'Is GSO',
    'Is Internal',
    'Is Labor',
    'Is Active',
    'Productions Currency',
  ] as const,

  liveColumnCount: 9,

  columnKeys: [
    'pricebookName',
    'strategyName',
    'strategyYear',
    'isGSO',
    'isInternal',
    'isLabor',
    'isActive',
    'isProduction',
    'currencyAbbrv',
  ] as const,

  booleanColumns: ['Is GSO', 'Is Internal', 'Is Labor', 'Is Active', 'Is Productions'] as const,
  booleanTrueMarker: '✔',

  filterDefaults: {
    pricebook: '',
    pricingStrategy: '',
    location: 'All Locations',
    currency: 'All Currencies',
    isInternal: false,
    isLabor: false,
    activeOnly: true,
  } as const,

  currencyOptions: ['All Currencies', 'USD', 'CAD', 'MXN'] as const,

  locationDefault: 'All Locations',
  locationFirstEntry: 'Clear selection',
  // Location popover is virtualized/lazy (live 2652 options) — assert only that it POPULATES (> this),
  // never a large structural count (the exact 2652 figure is volatile).
  locationOptionFloor: 2,

  itemCountPattern: /\d[\d,]*\s+items found/,
  itemCountReference: 591, // reference only, NOT asserted

  pricebookFilterSample: { value: '2021-PB6', expectedName: '2021-PB6' } as const,

  isInternalSample: { firstNarrowedName: '2023-Internal1' } as const,

  actionButtons: [
    'New',
    'Pricing Override',
    'Loc Pricing Export',
    'Loc Pricing Import',
    'Export',
    'Import',
    'Grid Options',
  ] as const,

  newMenu: {
    equipment: { item: 'Equipment Pricing', routeParam: 'type=equipment' },
    labor: { item: 'Labor Pricing', routeParam: 'type=labor' },
  } as const,

  /**
   * Field-coverage (P2) — live-verified 2026-06-10.
   * The complete server query-param contract + BVA/each-option samples. The earlier pass left `currencyId`/
   * `locationNo` unverified and GUESSED `strategyName` — corrected here to the live `pricingStrategyName`.
   */
  fcc: {
    params: {
      pricebook: 'pricebookName',
      strategy: 'pricingStrategyName',
      currency: 'currencyId',
      location: 'locationNo',
      isInternal: 'isInternal',
      isLabor: 'isLabor',
      isActive: 'isActive',
    },
    currencyId: { USD: 1, CAD: 2, MXN: 3 },
    pricebookNoMatch: 'ZZZ-NOPE-NOMATCH-9999',
    pricebookOverflow: 'A'.repeat(250), // no maxlength — accepted in full, server returns 0
    pricebookSpecial: `%_'"<>&#`, // accepted literally; URL-encoded; no crash; escapable
    pricebookSpecialEncoded: 'pricebookName=%25_%27%22%3C%3E%26%23',
    pricebookWhitespace: '   ', // server ignores whitespace → full list
    pricebookBroad: '2',
    strategyNoMatch: 'ZZZ-NOPE-STRAT',
  },
} as const;
