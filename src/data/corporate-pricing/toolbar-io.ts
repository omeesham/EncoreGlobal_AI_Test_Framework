export const CORP_PRICING_EXPORT_API = '/navigator/api/location/pricing/pricing-export' as const;
export const CORP_PRICING_LOC_EXPORT_API = '/navigator/api/location/pricing/location-export' as const;
// Loc Pricing Import PUT — a per-(location, currency) replace; partitions absent from the file stay untouched (NM-2305).
// Filter save listeners on this path, not the page URL.
export const CORP_PRICING_LOC_IMPORT_API = '/navigator/api/location/pricing/location-import' as const;

// Import All commit PUT — choosing a file only stages an in-browser diff; this fires on Publish (NM-2265).
// Filter save listeners on this path, not the page URL.
export const CORP_PRICING_IMPORT_ALL_API = '/navigator/api/location/pricing/pricing-import' as const;

export const CORP_PRICING_TOOLBAR_IO = {
  /** Export ▾ and Import ▾ expose the same 4 labels; the isLabor/isMaxDiscount pair maps 1:1 to the variant (NM-1604). */
  variants: [
    { label: 'All Equipment Pricing', isLabor: false, isMaxDiscount: false, exportFilename: 'EquipmentPricings.csv' },
    { label: 'All Labor Pricing', isLabor: true, isMaxDiscount: false, exportFilename: 'LaborPricings.csv' },
    { label: 'All Equipment Max Discount', isLabor: false, isMaxDiscount: true, exportFilename: 'EquipmentMaxDiscounts.csv' },
    { label: 'All Labor Max Discount', isLabor: true, isMaxDiscount: true, exportFilename: 'LaborMaxDiscounts.csv' },
  ] as const,

  /** Every export request carries the UI locale (NM-1604 locale facet). */
  exportLocaleParam: 'locale=en-US',

  /** NM-2264: an Export variant opens a Year(s) 1-3 + Currency dialog first; Continue stays disabled until both are set. */
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

  // Grid export is a wide matrix: these two fixed columns, then one column per pricebook (row 2 = the currency).
  // Pricing and Max Discount share that shape, so they are told apart by request params, not by columns.
  exportBaseColumns: ['Product Group Id', 'Product Group Name'] as const,

  // An Import ▾ variant opens a custom in-app dialog, not a native OS file chooser; title = titlePrefix + variant label.
  // No request fires on trigger — only after a file is chosen and Upload is clicked.
  importDialog: {
    titlePrefix: 'Import ',
    prompt: 'Choose a file to import data',
    buttons: ['Browse', 'Cancel', 'Upload', 'Close'],
  } as const,

  // Import All is a delta MERGE with no location axis: the file is diffed in-browser and staged in a publish
  // modal, and only Publish commits; product-group rows absent from the file are untouched, not deleted (NM-2265).
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
    // Safe mutation target: pricebook 2026-LV-PB-9025 / group 271 is referenced by no other corporate-pricing spec.
    // The baseline is captured live at test start and restored; testValue proves the change came from the import.
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

  // Kept to one throwaway office because a full ~38k-row import 500s partway through (NM-2407).
  // Of the flag columns only IsAlternate is actually applied, and unknown pricebook names are silently dropped.
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

  // Non-first reversible column for the toggle/persist tests; visibility is server-persisted per user,
  // so any test that hides it must toggle it back on.
  toggleColumn: 'Price Year',

  // Loc Pricing Export is an all-locations CSV, a different dataset from the on-screen strategy grid,
  // so the file's own structure is the oracle (NM-2262).
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
    // UseDate is a 0/1 date-window flag; every row sampled reads 0 with StartDate/EndDate empty,
    // so the populated date-string format is not yet assertable.
    useDateColumn: 'UseDate',
    dateWindowColumns: ['StartDate', 'EndDate'],
  },
} as const;
