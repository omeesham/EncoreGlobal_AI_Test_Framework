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

  // Direct CSV download (no Year/Currency dialog): match the request on the API path, not the page URL.
  // The file is a tenant-wide dump with its own 9 columns, unrelated to the grid's 10.
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

    // NM-1446: export ignores every grid filter, so these floors sit well below the real counts
    // and only catch a filter leaking into the request.
    scope: {
      minDataRows: 5000,
      minDistinctLocations: 500,
      /** Both Is Labor values must survive every export, whichever tab is showing. */
      expectedIsLaborValues: ['0', '1'],
      /** The tenant carries all three; an export missing one would mean the filter leaked in. */
      minDistinctCurrencies: 3,
    },

    // NM-1940: export emits empty Override Price rows that its own import rejects — never assert
    // every row has one.
    emptyOverridePriceIsTolerated: true,

    // Only the header row localizes; data stays "1001.00" so the comma-delimited file remains parseable.
    // A malformed locale degrades to the English header with a 200, never an error.
    locales: {
      localizing: ['fr-FR', 'es-MX'],
      fallback: ['de-DE', 'en-GB'],
      malformed: ['zz-ZZ', 'xx', '%20'],
    },

    // Override Discount is stored as a fraction (0.06 renders "6.00 %"); four tenant rows hold a raw
    // percentage instead and render over the 100 cap. Pinned both ways so spread or cleanup is noticed.
    discountScale: {
      percentCap: 100,
      knownOverScaleRows: 4,
    },

    // LF line endings (not CRLF), RFC 4180 quoting, UTF-8 with no byte-order mark.
    structure: {
      lineEnding: '\n',
      /** Product Group Name carries literal inch marks (50"-59"), doubled per RFC 4180. */
      minQuotedRows: 100,
    },
  },

  // The grid's data endpoint, separate from export. Office 1604 returns HTTP 500 and the screen
  // renders it as a silent "0 items found"; the guard flags spread to other offices or a fix.
  gridApi: {
    pathFragment: '/navigator/api/location/corporate-price-pg-override',
    healthyOffices: ['1105', '1974', '9187', '9019', '9185', '1115'] as const,
    knownFailingOffice: '1604',
    knownFailureSignature: 'same key has already been added',
  },

  pager: {
    rowsPerPageOptions: ['10', '20', '30', '40', '50'] as const,
    defaultRowsPerPage: '20',
    /** Office with enough Equipment overrides (~161 rows) to page through. */
    multiPageOffice: '1974',
  },

  importDialog: {
    title: 'Import All Pricing Overrides',
    buttons: ['Browse', 'Cancel', 'Upload', 'Close'] as const,
    noFileText: 'No file selected',
  },

  // Import commits directly (no preview) and upserts only rows present in the file. NM-2186: a full
  // tenant dump stalls at "Uploading… 50%", so the round-trip uses a minimal file to get a clean 200.
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

    // Per-row partial-success API: HTTP 200 does not mean a row applied — check failureRecordCount.
    // Parse errors surface as a toast with no POST; data errors only inside the 200 body's errors[].
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

/** `edited` differs from the fixture default so it is a net change; revert with the default, not `edited`. */
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

/** Sort bed for office 1105 Equipment; column sort fires from a header dropdown, not a header-click toggle. */
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

/** Read-only bed for Active-only filter tests: office 1105 Equipment, 9 rows, 7 active, all USD. */
export const CORP_PRICING_OVERRIDE_ACTIVE_BED = {
  office: '1105',
  totalRows: 9,
  activeOnlyRows: 7,
  inactiveGroupName1: "Camlok #1 - 50' (Set of 5 Conductors)",
  inactiveGroupName2: "Camlok #2 - 10'",
  textFilterCamlok: 'Camlok',
  camlokTotalRows: 2,
  /** Selecting it must show exactly totalRows. */
  presentCurrency: 'USD' as const,
  /** Has no rows on this office; selecting it must show exactly 0 rows. */
  absentCurrency: 'CAD' as const,
} as const;

// Labor-tab mutation fixture (NM-2271): office 1105 Labor has exactly two override rows, and row 655
// round-trips 160.00 → 161 → 160.00.
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

// Labor volume/pagination bed (NM-2271): office 9460 Labor carries ~212 rows.
// Anchors are for relationship assertions, never exact-count equalities.
export const CORP_PRICING_OVERRIDE_LABOR_VOLUME_BED = {
  office: '9460',
  page1FirstRowAnchor: 'Banners Design',
  filterNeedle: 'Banners', // narrows the 212-row Labor grid to the anchor row
  minExpectedRows: 100, // bed-sanity floor: the office carries a triple-digit Labor row count
} as const;

// NM-1932: this row's never-set Override Price renders an em-dash in a muted span, not an empty cell.
export const CORP_PRICING_OVERRIDE_EMDASH_BED = {
  office: '1115',
  blankRowName: '01D Double Screen Set Kit',
  emDash: '—',
  mutedSpanClass: 'text-muted-foreground',
} as const;

// Add-override picker (NM-2271): the panel appears only under a specific currency, never ALL.
// Dragging a row in stages it client-side at 0.00 / inactive with no network call.
export const CORP_PRICING_OVERRIDE_PICKER_BED = {
  office: '4104',
  gatingCurrency: 'USD' as const,
  pickerHeading: 'Product Groups',
  pickerSearchPlaceholder: 'Search product groups...',
  droppedRowDefaults: { overridePrice: '0.00', active: false },
} as const;

/** Unsaved-changes guard dialog — copy is asserted verbatim, so keep it byte-exact. */
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
  // Reversible on the live save cycle; the defaults below are the baseline `ensureDefaultState` restores to.
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

// Each entry pairs an input with its expected displayed string — the two diverge on this screen.
// Max Discount displays a "%" suffix; Override Price does not.
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

/** Single-row Equipment bed; Max Discount is unset here and renders an em-dash. */
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

/** Multi-row edit/save bed: edit PG 565, verify PG 893 stays untouched. */
export const CORP_PRICING_OVERRIDE_MULTI_ROW_BED = {
  office: '1134',
  rows: [
    { productGroupId: '565', currentPrice: '13.00', maxDiscount: '14.00 %' },
    { productGroupId: '893', currentPrice: '12.00', maxDiscount: '6.00 %' },
  ],
} as const;

/** Multi-currency bed for currency-filter isolation: 10 USD rows plus 1 CAD row. */
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
