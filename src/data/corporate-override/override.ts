export const CORP_PRICING_OVERRIDE = {
  tabs: ['Equipment', 'Labor'] as const,
  defaultTab: 'Equipment' as const,

  gridColumns: [
    'Location',
    'Product Group',
    'Product Group Name',
    'Currency',
    'Current Price',
    'Override Price',
    'Max Discount %',
    'Active',
    'Mod Date',
    'Updated By',
  ] as const,

  columnIndex: {
    location: 0,
    productGroup: 1,
    productGroupName: 2,
    currency: 3,
    currentPrice: 4,
    overridePrice: 5,
    maxDiscount: 6,
    active: 7,
    modDate: 8,
    updatedBy: 9,
  } as const,

  readOnlyColumns: ['Location', 'Product Group', 'Product Group Name', 'Currency', 'Current Price', 'Mod Date', 'Updated By'] as const,
  editableCells: ['Override Price', 'Max Discount %', 'Active'] as const,

  currencyOptions: ['ALL', 'USD', 'CAD', 'MXN'] as const,
  currencyDefault: 'ALL' as const,

  rowsPerPageOptions: ['10', '20', '30', '40', '50'] as const,
  rowsPerPageDefault: '20' as const,

  activeOnlyDefault: false,

  activeBooleanRender: 'radix-checkbox-aria-checked' as const,

  filterPlaceholder: 'Filter Product Groups Override...',
  filterMode: 'client-side' as const,

  emptyStateText: 'No results.',

  itemCountPattern: /\d[\d,]*\s+items found/,

  locationPicker: {
    searchPlaceholder: 'Search by Location Name, Number',
    columns: ['Local Office', 'Local Office Name'] as const,
    confirmButton: 'Select',
    cancelButtons: ['Cancel', 'Close'] as const,
  } as const,

  saveDialogTitlePattern: /save changes/i,
  saveDialog: { title: 'Save Changes', body: 'Are you sure you want to save the changes?' },
  saveSuccessToast: 'Pricing overrides saved successfully.',

  saveApiPath: '/navigator/api/location/corporate-price-pg-override',

  locationModalTitle: 'Change Local Office',

  gridOptionsToggleColumn: 'Updated By',
  gridOptionsResetLabel: 'Reset to Default',

  /**
   * Override-page Export = a DIRECT CSV download (no Year/Currency dialog — distinct from the
   * Search screen's Export menu). Filter the download's own request on the backend API path, never the page URL.
   *
   * The exported file is the oracle — a tenant-wide dump (rows begin around office 1101, not scoped to
   * whichever office is selected on screen when Export is clicked), a different dataset from the on-screen
   * grid (which has 10 columns incl. Mod Date / Updated By; the file has these 9 instead, incl. Location Id
   * and Is Labor which the grid does not show). Live-verified 2026-07-09 from a real download (8,995 rows):
   * every row splits into exactly 9 comma-separated fields (Product Group Name may contain literal `"`
   * inch-mark characters, RFC4180-quoted/escaped, but never an unquoted comma, so a plain `split(',')` is safe).
   */
  export: {
    filenamePattern: /^ProductGroupOverrides_\d{8}_\d{6}UTC\.csv$/,
    apiPathFragment: 'corporate-price-pg-override/export',
    localeParam: 'locale=en-US',
    expectedHeaders: [
      'Location Id', 'Product Group Id', 'Product Group Name', 'Is Labor',
      'Currency', 'Current Price', 'Override Price', 'Override Discount', 'Is Active',
    ],
    validCurrencies: ['USD', 'CAD', 'MXN'],
    booleanColumns: ['Is Labor', 'Is Active'],
    moneyColumn: 'Current Price',
    optionalMoneyColumn: 'Override Price',
    optionalPercentColumn: 'Override Discount',

    /**
     * Export scope oracle (verified live 2026-07-21). Ten exports taken across ten different grid
     * states — location picker, Equipment/Labor tab, Active only, Currency, text filter,
     * rows-per-page and column sort — all returned the SAME file, byte for byte. Export is an
     * unconditional tenant-wide dump: its request carries no filter parameters. Treated as intended
     * behavior (NM-1446 documents the mechanism, and the import dialog is titled "Import All Pricing
     * Overrides"). Floors are deliberately well below the observed values (8,996 rows across 1,782
     * offices, stable over 4 days) so real data growth never breaks the suite.
     */
    scope: {
      minDataRows: 5000,
      minDistinctLocations: 500,
      /** Both Is Labor values must survive every export, whichever tab is showing. */
      expectedIsLaborValues: ['0', '1'],
      /** The tenant carries all three; an export missing one would mean the filter leaked in. */
      minDistinctCurrencies: 3,
    },

    /**
     * NM-1940 — the export emits rows whose Override Price is empty, which the app's own import then
     * rejects. Assert the file TOLERATES them; never assert "every row has an override price".
     */
    emptyOverridePriceIsTolerated: true,

    /**
     * Locale behavior. French and Mexican Spanish translate the header row; German and British
     * English fall back to the English header. Data rows are locale-independent — money stays
     * "1001.00" under French, which is what keeps a comma-delimited file parseable. Malformed values
     * degrade to the English header with a 200, never an error.
     */
    locales: {
      localizing: ['fr-FR', 'es-MX'],
      fallback: ['de-DE', 'en-GB'],
      malformed: ['zz-ZZ', 'xx', '%20'],
    },

    /**
     * Override Discount is stored as a FRACTION and displayed as a percentage — 0.06 in the file
     * reads as "6.00 %" in the grid. Four rows across the tenant break that convention and store a
     * raw percentage instead (13, 14, 20), so the grid renders them as 1300.00 %, 1400.00 % and
     * 2000.00 % — above the 0-100 cap the app enforces when the value is typed in. Confirmed against
     * the export file, the grid's JSON API and the rendered grid, all three agreeing (2026-07-21).
     * Pinned in both directions: a rise means the bad rows are spreading, a drop to zero means they
     * were cleaned up and the guard can be retired.
     */
    discountScale: {
      percentCap: 100,
      knownOverScaleRows: 4,
    },

    /**
     * File structure: LF line endings (NOT CRLF — verified byte-for-byte: 8,997 line feeds, zero
     * carriage returns), RFC 4180 quoting, UTF-8 text with no byte-order mark.
     */
    structure: {
      lineEnding: '\n',
      /** Product Group Name carries literal inch marks (50"-59"), doubled per RFC 4180. */
      minQuotedRows: 100,
    },
  },

  /**
   * The grid's own data endpoint, which is separate from the export endpoint. Office 1604 returns
   * HTTP 500 ("An item with the same key has already been added. Key: 4543") while every other office
   * checked returns 200 — and the screen renders that failure as a silent "0 items found". Observed
   * live 2026-07-21 and reproduced three times. The check below guards against the failure spreading
   * to other offices and flags the day 1604 recovers.
   */
  gridApi: {
    pathFragment: '/navigator/api/location/corporate-price-pg-override',
    healthyOffices: ['1105', '1974', '9187', '9019', '9185', '1115'] as const,
    knownFailingOffice: '1604',
    knownFailureSignature: 'same key has already been added',
  },

  pager: {
    rowsPerPageOptions: ['10', '20', '30', '40', '50'] as const,
    defaultRowsPerPage: '20',
    /** An office with enough Equipment overrides to page through (161 rows on 2026-07-21). */
    multiPageOffice: '1974',
  },

  importDialog: {
    title: 'Import All Pricing Overrides',
    buttons: ['Browse', 'Cancel', 'Upload', 'Close'] as const,
    noFileText: 'No file selected',
  },

  /**
   * Import upload behavior — live-verified 2026-07-23 on office 4107 (the live-certified import target).
   * The Override import commits directly (no preview screen) and upserts ONLY the rows present in the
   * file — a location absent from the file keeps its rows untouched (verified: a partial import left
   * office 1105 unchanged). A MINIMAL valid file (header + one row) returns a clean HTTP 200 in ~2s; the
   * full tenant dump instead stalls the client at "Uploading… 50%" (NM-2186) while applying in the
   * background, so the round-trip test imports a minimal file for a deterministic completion signal.
   */
  import: {
    fixtureDir: 'import-all',
    malformedFixture: 'malformed.csv',
    emptyFixture: 'empty.csv',
    apiPathFragment: 'corporate-price-pg-override/import',
    malformedRejectPattern: /Error Row#:\d+, Msg: LocationId, ProductGroupId, OverridePrice is required\./,
    emptyRejectMessage: 'Please check the upload file format.',
    nm1940RejectPattern: /Error Row#:\d+, Msg: LocationId, ProductGroupId, OverridePrice is required\./,
    roundTrip: {
      office: '4107',
      canaryOffice: '1105',
      productGroupId: '4298',
      productGroupName: 'Project Manager (Pre/Post) - Hourly',
      overridePriceColumnIndex: 6,
      emptyPriceRowPrefix: '1115,286,',
    },

    /**
     * Field-level validation matrix — live-verified 2026-07-23 on office 4107 / product group 4298.
     * The import is a PER-ROW partial-success API: a valid file returns HTTP 200 with a body of shape
     * { success, data: { successRecordCount, failureRecordCount, errors: [{ error }] } }. A 200 does NOT
     * mean a row applied — a fully-invalid file still returns 200 with failureRecordCount > 0. Rows are
     * atomic: any one invalid field rejects the whole row (a valid Override Price in that row does not
     * apply). Rejections surface on two layers — parse/format errors as an alert toast with NO server
     * POST, and semantic/data errors inside the 200 response body's errors[] with NO toast.
     */
    validation: {
      resultShape: { successCount: 'successRecordCount', failureCount: 'failureRecordCount', errors: 'errors' },
      bodyErrors: {
        invalidCurrency:    { fixture: 'override-invalid-currency.csv',     errorContains: 'invalid data for Currency' },
        negativePrice:      { fixture: 'override-negative-price.csv',       errorContains: 'invalid data for OverridePrice' },
        discountOver100:    { fixture: 'override-discount-over-100.csv',    errorContains: 'invalid data for OverrideDiscount' },
        nonexistentPg:      { fixture: 'override-nonexistent-pg.csv',       errorContains: "ProductGroupId '9999999' does not exist" },
        nonexistentLocation:{ fixture: 'override-nonexistent-location.csv', errorContains: "LocationNo '9999999' does not exist" },
      },
      toastErrors: {
        nonNumericPrice: { fixture: 'override-nonnumeric-price.csv', pattern: /Error Row#:\d+, Msg: The Override Price should be decimal format within two decimal places\./ },
        tooFewColumns:   { fixture: 'override-too-few-columns.csv',  pattern: /Error Row#:\d+, Msg: LocationId, ProductGroupId, OverridePrice is required\./ },
        headerOnly:      { fixture: 'override-header-only.csv',      message: 'Please check the upload file format.' },
      },
      wrongExtension: { fixture: 'wrong-format.txt', message: 'Unsupported file type. Allowed: .csv' },
      extraColumns: { fixture: 'override-extra-columns.csv' },
    },
  },

  maxDiscountCap: 100,
} as const;

/**
 * Numeric field-coverage values for the Override Price + Max Discount % cells (live-verified editable 2026-06-09).
 * Reuses the Pricing Detail numeric-BVA shape on a distinct screen/fixture. `edited` differs from the
 * fixture default so it produces a net change (a revert-to-original must use the default, not `edited`).
 */
export const OVERRIDE_NUMERIC_CASES = {
  overridePrice: {
    default: '500.00',
    edited: '446',
    zero: '0',
    decimal: '123.45',
    large: '999999',
    nonNumeric: 'abc',
    negative: '-5',
  },
  maxDiscount: {
    edited: '10',
    zero: '0',
    boundary: '100', // the inclusive upper cap — commits
    justOver: '101', // one over the cap — flagged aria-invalid, does not commit
    overHundred: '150',
    decimal: '12.5',
    negative: '-5',
  },
} as const;

/**
 * Dedicated Override mutation fixture (F1 isolation) — DISTINCT from the pricebook-GUID fixtures.
 *
 * The Override screen is **NOT pricebook-GUID-based**: it is the `/pg-override` screen, a
 * per-(location, tab) product-group override grid. There is therefore **ZERO row-collision** with
 * `strategyFixture` / `detailFixture` (`CORPORATE_PRICING_FIXTURES` in `common.ts`, which mutate
 * pricebook RECORDS on the `/details/<guid>` screens) — by construction, a different screen and a
 * different data model. Under `workers:2` the Override suite and the Strategy/Detail suites
 * never touch the same row, so no cross-fixture collision is possible.
 *
 * The mutation-row anchor below was **PROVISIONAL** when first live-observed (2026-06-08), then
 * finalized AFTER resolving the Override grid's edit-activation mechanism — the click-to-edit cells
 * did NOT reveal an input via click/dblclick/Enter during the initial read-only exploration.
 * Anchored by content (Product Group ID + Name), never index (assert content, not position).
 */
/**
 * Sort-order verification data for the office 1105 Equipment tab.
 * Verified 2026-07-17: the Override grid column sort is triggered via a header
 * dropdown menu ("Sort ascending" / "Sort descending" / "Hide column") — NOT a header-click toggle.
 * Product Group Name ASC first cell: "07A Compass Screen Set Kit";
 * Product Group Name DESC first cell: "Whiteboard Supply - Marker 4 Pk"
 *   (confirmed via live run — the prior constant "Whiteboard Supply" was truncated; full value confirmed 2026-07-18).
 */
export const CORP_PRICING_OVERRIDE_SORT_BED = {
  office: '1105',
  productGroupNameAscFirstCell: '07A Compass Screen Set Kit',
  productGroupNameDescFirstCell: 'Whiteboard Supply - Marker 4 Pk',
  /** Verified: all 10 columns visible at default state (after Reset to Default). */
  gridDefaultColumnCount: 10,
  /** Verified: 9 columns visible after hiding "Max Discount %" via Grid Options. */
  gridHiddenColumnCount: 9,
  /** Column hidden in TC-CPR-OVR-048 to exercise the hide/reset round-trip. */
  gridHideTestColumn: 'Max Discount %',
} as const;

/**
 * Read-only data bed for Active-only filter effect tests (office 1105).
 * Verified 2026-07-17: 9 Equipment rows total, 7 active, 2 inactive.
 * The two inactive rows are Product Groups 1482 (Camlok #1) and 1484 (Camlok #2).
 * All rows carry USD currency — no multi-currency data on this office.
 */
export const CORP_PRICING_OVERRIDE_ACTIVE_BED = {
  office: '1105',
  totalRows: 9,
  activeOnlyRows: 7,
  inactiveGroupName1: "Camlok #1 - 50' (Set of 5 Conductors)",
  inactiveGroupName2: "Camlok #2 - 10'",
  textFilterCamlok: 'Camlok',
  camlokTotalRows: 2,
  /**
   * Currency that has override rows on this office. Selecting it must show exactly totalRows.
   * Verified 2026-07-17: all 9 Equipment rows carry USD — no multi-currency data on office 1105.
   */
  presentCurrency: 'USD' as const,
  /**
   * A currency with no override rows on this office. Selecting it must show exactly 0 rows.
   * Verified 2026-07-17 (same walk — 1105 is USD-only; CAD has no rows).
   */
  absentCurrency: 'CAD' as const,
} as const;

/**
 * Labor-tab mutation fixture (NM-2271) — office 1105 Labor has exactly two override rows
 * (verified live 2026-07-20 with a committed save + restore round-trip: 160.00 → 161 → 160.00,
 * POST 200 + success toast + persistence across reload confirmed on row 655).
 * The Labor grid uses the same click-to-edit spinbutton cells and the same save dialog as
 * Equipment; the Active cell is a checkbox read via aria-checked on both tabs of this grid.
 */
export const CORP_PRICING_OVERRIDE_LABOR_BED = {
  office: '1105',
  mutationRowAnchor: {
    productGroupId: '655',
    productGroupName: 'General - Ops',
    overridePriceDefault: '160.00',
    activeDefault: false,
  },
  secondRow: { productGroupId: '656', productGroupName: 'General - Utility' },
  laborEdited: '161', // differs from the 160.00 default so the edit is a net change
} as const;

/**
 * Populated Labor volume/pagination bed (NM-2271) — office 9460 Labor, verified live 2026-07-20:
 * "212 items found", 20 rows per page by default, first page starts at "Banners Design",
 * page 2 starts at "Candids Video Engineer - FULL DAY", the last page holds the remainder.
 * Totals are for bed sanity + content anchors — assert relationships, never brittle equalities.
 */
export const CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED = {
  office: '9460',
  page1FirstRowAnchor: 'Banners Design',
  filterNeedle: 'Banners', // narrows the 212-row Labor grid to the anchor row
  minExpectedRows: 100, // bed-sanity floor: the office carries a triple-digit Labor row count
} as const;

/**
 * Blank Override Price render bed (NM-1932) — office 1115, Product Group 286
 * "01D Double Screen Set Kit" carries a blank (never-set) Override Price. Verified live
 * 2026-07-20: the cell renders an em-dash inside a muted span — NOT an empty cell.
 */
export const CORP_PRICING_OVERRIDE_EMDASH_BED = {
  office: '1115',
  blankRowName: '01D Double Screen Set Kit',
  emDash: '—',
  mutedSpanClass: 'text-muted-foreground',
} as const;

/**
 * Currency-gated Product Group picker bed (NM-2271 add-override flow) — office 4104.
 * Verified live 2026-07-20 (and 2026-07-17 discovery walk): the picker panel appears in the
 * left search area ONLY when a specific currency (USD/CAD/MXN — not ALL) is selected; rows are
 * added by dragging a picker row into the override grid. A dropped row stages client-side
 * (no network call) at Override Price 0.00 / inactive, and enables Save.
 */
export const CORP_PRICING_OVERRIDE_PICKER_BED = {
  office: '4104',
  gatingCurrency: 'USD' as const,
  pickerHeading: 'Product Groups',
  pickerSearchPlaceholder: 'Search product groups...',
  droppedRowDefaults: { overridePrice: '0.00', active: false },
} as const;

/** Unsaved-changes guard dialog contract — verified verbatim live (2026-07-17 walks + 2026-07-20 Stay probe). */
export const CORP_PRICING_OVERRIDE_UNSAVED_DIALOG = {
  title: 'Unsaved changes',
  body: 'Are you sure you want to leave this view? Any unsaved changes will be lost.',
  stayButton: 'Stay',
  discardButton: 'Discard',
} as const;

export const CORP_PRICING_OVERRIDE_FIXTURE = {
  office: '1606',
  tab: 'Equipment' as const,
  currency: 'ALL' as const,
  /**
   * Mutation-row anchor — CONFIRMED reversible on the live save-cycle (Override Price round-trips
   * 500.00 → 446 → 500.00, office 1606, 2026-07-06). `overridePriceDefault` / `activeDefault` are
   * the baseline `ensureDefaultState` restores to.
   */
  mutationRowAnchor: {
    productGroupId: '2609',
    productGroupName: 'House Video Monitor LED 70"-79"',
    overridePriceDefault: '500.00',
    activeDefault: true,
  },
  readAnchors: [
    { productGroupId: '2609', productGroupName: 'House Video Monitor LED 70"-79"', overridePrice: '500.00' },
    { productGroupId: '2606', productGroupName: 'House Video Monitor LED 40"-49"', overridePrice: '170.00' },
    { productGroupId: '2607', productGroupName: 'House Video Monitor LED 50"-59"', overridePrice: '278.00' },
  ],
} as const;

/**
 * BVA / negative / boundary oracle for Override Price and Max Discount % fields.
 * Each entry carries its INPUT value and its EXPECTED DISPLAYED STRING — input and display
 * diverge on this screen (the gap is three of the five known defects).
 *
 * Per-field divergence: Max Discount displays with "%" suffix; Override Price does not.
 * Values sourced from live oracle verification.
 */
export const OVERRIDE_FIELD_ORACLE = {
  /** Values the app REJECTS (editor stays open / does not commit). */
  rejected: {
    both: [
      { input: '150', reason: 'over-cap on MaxDisc; out-of-range on OverridePrice' },
      { input: '-5', reason: 'negative' },
      { input: '-0.01', reason: 'negative fractional' },
    ],
    maxDiscountOnly: [
      { input: '1e5', reason: 'scientific notation rejected on Max Discount' },
    ],
  },

  /** Values the app COMMITS — with per-field expected displayed strings. */
  committed: [
    { input: '50', maxDiscountDisplay: '50.00 %', overridePriceDisplay: '50.00' },
    { input: '100', maxDiscountDisplay: '100.00 %', overridePriceDisplay: '100.00' },
    { input: '007', maxDiscountDisplay: '7.00 %', overridePriceDisplay: '7.00' },
    { input: '99.99', maxDiscountDisplay: '99.99 %', overridePriceDisplay: '99.99' },
    { input: '0', maxDiscountDisplay: '0.00 %', overridePriceDisplay: '0.00' },
    { input: '1e5', maxDiscountDisplay: null as unknown as string, overridePriceDisplay: '100000.00', note: 'commits on Override Price only; rejected on Max Discount' },
  ],

  /** Known display defects (app transforms input incorrectly). */
  defects: [
    { input: '0.5', maxDiscountDisplay: '50.00 %', overridePriceDisplay: '50.00', bug: 'multiplies by 100' },
    { input: '1.2.3', maxDiscountDisplay: '1.23 %', overridePriceDisplay: '1.23', bug: 'silently drops second decimal point' },
    { input: 'abc', maxDiscountDisplay: '—', overridePriceDisplay: '—', bug: 'renders em-dash instead of rejection' },
  ],

  /** Unprobed values — keep marked until live-verified. */
  unverified: [
    { input: '0.001', note: 'TODO-UNVERIFIED' },
    { input: '12.345', note: 'TODO-UNVERIFIED' },
    { input: '999999.99', note: 'TODO-UNVERIFIED' },
  ],
} as const;

/**
 * Single-row Equipment bed — office 4107, Product Group 4298.
 * Verified: exactly 1 row, Max Discount is empty (renders em-dash "—"), Active = true, USD.
 */
export const CORP_PRICING_OVERRIDE_SINGLE_ROW_BED = {
  office: '4107',
  productGroupId: '4298',
  currentPrice: '305.00',
  overridePrice: '152.00',
  maxDiscount: '—',
  active: true,
  currency: 'USD' as const,
  expectedRowCount: 1,
} as const;

/**
 * Multi-row Equipment bed — office 1134, two Product Groups.
 * Used for multi-row edit/save tests (edit PG 565, verify PG 893 untouched).
 */
export const CORP_PRICING_OVERRIDE_MULTI_ROW_BED = {
  office: '1134',
  rows: [
    { productGroupId: '565', currentPrice: '13.00', maxDiscount: '14.00 %' },
    { productGroupId: '893', currentPrice: '12.00', maxDiscount: '6.00 %' },
  ],
} as const;

/**
 * Multi-currency bed — office 1145.
 * Verified: 10 USD rows + 1 CAD row. Used to test currency filter isolation.
 */
export const CORP_PRICING_OVERRIDE_MULTI_CURRENCY_BED = {
  office: '1145',
  usdRowCount: 10,
  cadRowCount: 1,
  totalRowCount: 11,
} as const;

// --- NM-2271 BVA constants ---

export const OVERRIDE_BVA_OFFICES = {
  equipment: {
    office: '4107',
    rows: [{ productGroupId: '4298', currentPrice: '305.00', overridePrice: '152.00', maxDiscount: '—', active: true, currency: 'USD' as const }],
  },
  labor: {
    office: '1134',
    rows: [
      { productGroupId: '565', overridePrice: '13.00', maxDiscount: '14.00' },
      { productGroupId: '893', overridePrice: '12.00', maxDiscount: '6.00' },
    ],
  },
} as const;

export const OVERRIDE_BVA_REJECTED = {
  overHundred: { input: '150', reason: '>100 cap' },
  negativeFive: { input: '-5', reason: 'negative' },
  scientificNotation: { input: '1e5', reason: 'scientific notation >100' },
  negativeSmall: { input: '-0.01', reason: 'negative fractional' },
} as const;

export const OVERRIDE_BVA_COMMITTED = {
  fifty: { input: '50', expectedDisplay: '50.00 %' },
  hundredCap: { input: '100', expectedDisplay: '100.00 %' },
  leadingZeros: { input: '007', expectedDisplay: '7.00 %' },
  justUnderCap: { input: '99.99', expectedDisplay: '99.99 %' },
} as const;

export const OVERRIDE_BVA_DEFECTS = {
  hundredXMisread: { input: '0.5', expectedDisplay: '50.00 %' },
  silentCorruptionMaxDiscount: { input: '1.2.3', expectedDisplay: '1.23 %' },
  silentCorruptionOverridePrice: { input: '1.2.3', expectedDisplay: '1.23' },
  blankCommits: { input: 'abc', expectedDisplay: '\u2014' },
} as const;

export const OVERRIDE_REJECTION_SIGNATURE = {
  ariaInvalid: 'true',
  borderColor: 'oklch(0.577 0.245 27.325)',
  alertRoleTextContent: null,
} as const;

export const OVERRIDE_CURRENCY_BED = {
  office: '1145',
  officeName: 'Hilton Dallas/Park Cities',
  tab: 'Equipment' as const,
  totalRows: 11,
  currencies: {
    USD: { count: 10 },
    CAD: { count: 1 },
    MXN: { count: 0 },
  },
  rows: {
    cadAnchor: { productGroupId: '425', productGroupName: 'Box Truss 20.5x20.5 - 5\'' },
    usdAnchor: { productGroupId: '4298', productGroupName: 'Project Manager (Pre/Post) - Hourly' },
  },
} as const;
