export const CORP_PRICING_EXPORT_API = '/navigator/api/location/pricing/pricing-export' as const;
export const CORP_PRICING_LOC_EXPORT_API = '/navigator/api/location/pricing/location-export' as const;
/**
 * "Loc Pricing Import" (location-scoped) — the real upload endpoint. A PUT of the chosen CSV; the server
 * applies the file as a per-(location, currency) replace — the rows the file carries for a location-and-
 * currency REPLACE that location's existing rows in that currency (a row omitted from the file within a
 * currency the file touches is removed), while any location — and any currency partition — absent from the
 * file is untouched (live-verified: a USD-only file leaves a location's CAD rows intact). Mirrors the
 * export path. Live-verified 2026-07-07 (NM-2305). Filter save listeners on THIS path, not the page URL.
 */
export const CORP_PRICING_LOC_IMPORT_API = '/navigator/api/location/pricing/location-import' as const;

/**
 * Import ▾ All (grid-scoped) — the real commit endpoint. Choosing a file does NOT commit: the app first
 * re-downloads the current server pricebook via the export path and diffs the file against it in the
 * browser, then stages the differences in a "Select items to publish" modal. The mutating PUT fires ONLY
 * when the user selects rows and clicks Publish. Distinct from `location-import` (that is the location-
 * scoped Loc Pricing Import; this one is the grid/corporate-scoped Import All). Live-verified 2026-07-08
 * (NM-2265). Filter save listeners on THIS path, not the page URL.
 */
export const CORP_PRICING_IMPORT_ALL_API = '/navigator/api/location/pricing/pricing-import' as const;

export const CORP_PRICING_TOOLBAR_IO = {
  /**
   * Export ▾ and Import ▾ expose the SAME 4 variant labels (live-verified identical lists).
   * Each export variant fires `pricing-export?isLabor=<x>&isMaxDiscount=<y>&locale=en-US` — the
   * `isLabor`/`isMaxDiscount` pair maps 1:1 to the variant (the live answer to
   * NM-1604 "4 export variants + locale").
   */
  variants: [
    { label: 'All Equipment Pricing', isLabor: false, isMaxDiscount: false, exportFilename: 'EquipmentPricings.csv' },
    { label: 'All Labor Pricing', isLabor: true, isMaxDiscount: false, exportFilename: 'LaborPricings.csv' },
    { label: 'All Equipment Max Discount', isLabor: false, isMaxDiscount: true, exportFilename: 'EquipmentMaxDiscounts.csv' },
    { label: 'All Labor Max Discount', isLabor: true, isMaxDiscount: true, exportFilename: 'LaborMaxDiscounts.csv' },
  ] as const,

  /** Every export request carries the UI locale (NM-1604 locale facet). */
  exportLocaleParam: 'locale=en-US',

  /**
   * NM-2264: clicking an Export variant no longer downloads directly — it opens a shared
   * precondition dialog that requires a Year(s) selection (1–3) and a Currency before the export
   * can run. Continue stays disabled until BOTH are set; the export fires only on Continue.
   * Live-verified 2026-07-07 (office 1604).
   */
  exportDialog: {
    title: 'Export',
    prompt: 'Select between 1 and 3 years and choose a currency to continue.',
    yearPlaceholder: 'Select years...',
    currencyPlaceholder: 'Select currency...',
    buttons: ['Cancel', 'Continue', 'Close'] as const,
    maxYears: 3,
    yearOptions: ['2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028'] as const,
    defaultYear: '2026',
  },

  currencies: [
    { code: 'USD', currencyId: 1 },
    { code: 'CAD', currencyId: 2 },
    { code: 'MXN', currencyId: 3 },
  ] as const,

  /**
   * The grid-scoped Export CSV is a wide matrix, NOT the same shape as the Loc Pricing Export.
   * Header row 1 = these two fixed leading columns followed by one column per pricebook; row 2 =
   * the chosen currency repeated per pricebook column; each data row is a product group's price
   * (or max-discount %) per pricebook. Equipment and Labor variants carry different product-group
   * populations and pricebook columns; Pricing and Max Discount share the shape and differ only in
   * the cell values, so those two are distinguished by the request params, not the columns.
   */
  exportBaseColumns: ['Product Group Id', 'Product Group Name'] as const,

  /**
   * Clicking an Import ▾ variant opens a CUSTOM in-app dialog (NOT a native OS file chooser).
   * Dialog title = `titlePrefix` + the variant label, e.g. "Import All Equipment Pricing".
   * No backend request fires on trigger — the upload POST fires only after a file is chosen and
   * "Upload" is clicked (deferred to a later edge-case test phase).
   */
  importDialog: {
    titlePrefix: 'Import ',
    prompt: 'Choose a file to import data',
    buttons: ['Browse', 'Cancel', 'Upload', 'Close'],
  } as const,

  /**
   * Import ▾ All (grid-scoped) — the real upload round-trip (NM-2265 / NM-1446). Live-verified 2026-07-08
   * (office 1604). This is a DELTA-STAGE flow, fundamentally different from the location-scoped Loc Pricing
   * Import above:
   *
   *  1. Import ▾ → a variant → a Year(s)+Currency precondition dialog (title "Import", the same 1-3 year cap
   *     and USD/CAD/MXN currency gate as Export ▾; Continue disabled until both set).
   *  2. Continue → the "Import All <variant>" upload dialog (Browse + a `.csv` file input).
   *  3. Choosing a file does NOT commit — the app re-downloads the current server pricebook (via the export
   *     path, scoped to the chosen variant + currency + years) and diffs the uploaded file against it in the
   *     browser. Then, depending on the diff, it either shows a message (no changes / no matching pricebooks /
   *     unsupported type) or opens a "Select items to publish" modal listing every changed cell as
   *     Pricebook / Product Group ID / Product Group Name / Price / New Price, one row per change.
   *  4. Nothing persists until the user selects rows (Publish is disabled until at least one is checked) and
   *     clicks Publish, which fires the ONLY mutating request (`CORP_PRICING_IMPORT_ALL_API`). Success shows
   *     a "Pricing import complete. There were N pricing change updates." toast.
   *
   * It is a delta MERGE (product-group rows absent from the file are left untouched — NOT deleted; the file is
   * fixed-width so a pricebook column can never be "absent"), and it has no
   * location axis (the file's columns are Product Group Id + Product Group Name + one column per pricebook;
   * there is no LocationNo), so a change touches a corporate pricebook that every location referencing it
   * shares. The round-trip below therefore mutates ONE product-group price in ONE pricebook that no other
   * test reads, and restores it, verifying the restore from a fresh export (never trusting the undo).
   */
  importAll: {
    precondition: {
      title: 'Import',
      prompt: 'Select between 1 and 3 years and choose a currency to continue.',
      buttons: ['Cancel', 'Continue', 'Close'] as const,
      maxYears: 3,
      yearOptions: ['2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028'] as const,
      defaultYear: '2026',
    },
    messages: {
      noChanges: 'There are no changes between the imported and server pricebook',
      noMatch: 'None of the pricebooks on the server match the imported pricebook',
      unsupportedType: 'Unsupported file type',
    },
    publishModal: {
      title: 'Select items to publish',
      columns: ['Pricebook', 'Product Group ID', 'Product Group Name', 'Price', 'New Price'] as const,
      successToastFragment: 'Pricing import complete',
    },
    /**
     * The safe mutation target for the real round-trip. Product group 271 in pricebook `2026-LV-PB-9025`
     * (Equipment Pricing / 2026 / USD) is referenced by NO other corporate-pricing test — deliberately not
     * `2021-PB6`, `2022-NP Tier 1`, `2023-Internal1`, or the Override product groups — so mutating and
     * restoring it cannot turn another spec's assertions red. The natural server baseline is captured live at
     * test start (never hardcoded here); `testValue` is a distinctive value proving the change came from the import.
     */
    roundTrip: {
      variant: 'All Equipment Pricing',
      years: ['2026'] as const,
      currency: 'USD',
      productGroupId: '271',
      productGroupName: "Lift 0'-40' Boom - Daily",
      pricebook: '2026-LV-PB-9025',
      testValue: '424.24',
    },
    fixtures: {
      empty: 'empty.csv',
      malformed: 'malformed.csv',
      wrongFormat: 'wrong-format.txt',
    },
  } as const,

  locPricingImportDialogTitle: 'Import All Location Pricing',

  /**
   * Loc Pricing Import — the REAL upload round-trip (NM-2305). Live-verified 2026-07-07 (office 5897).
   *
   * The import is a per-(location, currency) replace: the rows the file carries for a location-and-currency
   * REPLACE that location's existing rows in that currency (a row omitted from the file within a currency
   * the file touches is removed — live-verified), while every location — and every currency partition —
   * absent from the file is left untouched (proven live: a single-location USD file changed only that
   * location's USD rows, and a USD-only file leaves the same location's CAD rows intact). So a minimal
   * single-location USD file is safe AND avoids the failure a full ~38k-row import currently hits: live on
   * 2026-07-07 the full file returned HTTP 500 partway through with "Failed to replace LocationPricebook
   * document ..." (NM-2407) — the round-trip is deliberately kept to one throwaway location for that reason.
   * The round-trip flips a pricebook between Primary and Alternate (the IsAlternate flag) — the update
   * pattern the product team uses — then reads it back from a fresh export to confirm. Live-observed write
   * scope: of the flag columns only IsAlternate is applied by the import (IsInternal / IsLabor /
   * IsProduction come back reported "updated" but the exported value does not change); and a pricebook name
   * not already defined in the system is silently dropped (the server reports it processed but createdCount
   * is 0 and the row never appears) — the import updates existing pricebooks, it does not create new ones.
   */
  locImport: {
    throwawayOffice: '5897',
    fixtures: {
      validUpdate: 'valid-update.csv',
      partialUpdate: 'partial-update.csv',
      empty: 'empty.csv',
      malformed: 'malformed.csv',
      wrongFormat: 'wrong-format.txt',
      headerOnly: 'header-only.csv',
      fieldWritability: 'field-writability.csv',
      createNovel: 'create-novel.csv',
    },
    rowKeyColumns: ['LocationNo', 'PriceBook', 'Currency'] as const,
    mutatedColumn: 'IsAlternate',
    successMessageFragment: 'Successfully processed',
    rejectEmptyMessage: 'does not contain any valid location pricing rows',
    rejectWrongFormatMessage: 'Unsupported file type',
    rejectHeaderOnlyMessage: 'Please check the upload file format',
  },

  gridColumns: [
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

  /**
   * A non-first, reversible column used by the toggle/persist tests. Toggling it OFF hides its
   * `<th>`; the hidden state persists across reload; toggling it back ON restores it (mutation
   * safety — the column-visibility preference is server-persisted per user).
   */
  toggleColumn: 'Price Year',

  /**
   * Loc Pricing Export — the REAL downloaded file's shape (NM-2262). Confirmed from a live download
   * on 2026-07-06: the export is an all-locations CSV (rows begin at office 1101), a different dataset
   * from the on-screen strategy grid, so the file's own structure is the oracle. The file name carries
   * a UTC timestamp; the header set + order below are the live-verified columns.
   */
  locExport: {
    filenamePattern: /^LocationPricebooks_\d{8}_\d{6}UTC\.csv$/,
    expectedHeaders: [
      'LocationNo', 'PricingStrategy', 'PriceBook', 'Currency',
      'IsInternal', 'IsLabor', 'IsAlternate', 'IsProduction',
      'UseDate', 'StartDate', 'EndDate',
    ],
    currencyColumn: 'Currency',
    validCurrencies: ['USD', 'CAD', 'MXN'],
    booleanColumns: ['IsInternal', 'IsLabor', 'IsAlternate', 'IsProduction'],
    /**
     * `UseDate` is a use-a-date-window flag (0/1); every row sampled so far reads `0` with
     * `StartDate`/`EndDate` empty, matching a pricing strategy with no effective date range set.
     * When the window is turned on (`UseDate=1`), both date columns should be populated — no export
     * with that state has been observed yet, so the exact date-string format is not yet assertable.
     */
    useDateColumn: 'UseDate',
    dateWindowColumns: ['StartDate', 'EndDate'],
  },
} as const;
