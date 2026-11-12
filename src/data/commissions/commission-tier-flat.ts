// Test data for Setup → Commissions → Tier/Flat (NM-3350; features NM-2083, NM-1635, NM-2168, NM-3728).
// Route, labels and texts come from the requirements document and the screenshots of 2026-11-12 (office 1606).
// Values marked "UNCONFIRMED" were not observed live yet — confirm them on the first headed run and adjust here,
// never in the specs.

/** Offices. Every one can be overridden with an env var for another environment. */
export const TF_OFFICES = {
  /**
   * Corporate office: the Local Office is a Location picker, and the grid is editable (toolbar, row editors, Delete).
   * The only office the automation user may edit on e2e — every case that edits runs here.
   */
  corporate: process.env.TF_CORPORATE_OFFICE ?? '1101',
  /** Local office: read-only Local Office text and a read-only grid with no toolbar (live, 2026-11-12). */
  local: process.env.TF_LOCAL_OFFICE ?? '1606',
  /** Canada office of NM-3599 ("Unexpected error occurred"). */
  canada: process.env.TF_CANADA_OFFICE ?? '2322',
  /** Mexico office (CountryId 3): the Reset Dates CPT shows NA. */
  mexico: process.env.TF_MEXICO_OFFICE ?? '7147',
} as const;

export interface TfOffice {
  readonly code: string;
  readonly country: 'USA' | 'Canada' | 'Mexico';
}

/** Offices outside the US whose tiers and history must load cleanly (NM-3599). */
export const TF_FOREIGN_OFFICES: readonly TfOffice[] = [
  { code: TF_OFFICES.canada, country: 'Canada' },
  // Mexico 7147 fails to open on e2e for this user ("Unexpected error occured."); dropped on review 2026-11-12.
];

export const officeLabel = (o: TfOffice): string => `${o.country} ${o.code}`;

/** Office whose History has more than one page (paging cases skip, with a reason, when it has not). */
export const TF_HISTORY_OFFICE = process.env.TF_HISTORY_OFFICE ?? TF_OFFICES.corporate;

/** Route (confirmed live). */
export const TF_PATH = (office: string): string => `/locations/${office}/commissions/tiers`;

export const TABS = ['Basic Information', 'Commission Tier/Flat History'] as const;
export type Tab = (typeof TABS)[number];

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_BUSINESS_TYPE = process.env.TF_BUSINESS_TYPE ?? 'Audio Visual';

/**
 * Data writes. E2E allows set-up, edit and clean-up (NM-3350 directive 5); TF_WRITES=off turns every case that
 * stores data into a skip, so the suite can run read-only against a shared environment.
 */
export const WRITES_ALLOWED = (process.env.TF_WRITES ?? 'on').toLowerCase() !== 'off';

/**
 * Copy to other locations overwrites the tiers of the destination office. It only runs when a sandbox
 * destination office is named.
 */
export const COPY_TARGET_OFFICE = process.env.TF_COPY_TARGET_OFFICE ?? '';

// ---------------------------------------------------------------- grid

/** Basic Information headers in screen order, as far as the screenshot shows them (left part of the grid). */
export const BASIC_COLUMNS_SEEN = [
  'Service Type', 'Lower Tier Boundary', 'Upper Tier Boundary', 'Profit Only', 'SC Comm %',
  'Is SC Comm Calculated On Net?', 'ETS Comm %',
] as const;

/** Every column Basic Information must offer (requirements §4). */
export const BASIC_COLUMNS_REQUIRED = [
  'Business Type', 'Service Type', 'Lower Tier Boundary', 'Upper Tier Boundary', 'Comm %', 'Profit Only', 'SC Comm %',
  'Is SC Comm Calculated On Net?', 'ETS Comm %', 'Currency', 'Modified By', 'Modified On',
] as const;

/** History headers: the first ten from the screenshot, the rest from requirements §5. */
export const HISTORY_COLUMNS = [
  'Local Office', 'Business Name', 'Service Type', 'Action', 'Lower Tier Boundary', 'Upper Tier Boundary', 'Comm %',
  'Profit Only', 'SC Comm %', 'Is SC Comm Calculated On Net?', 'ETS Comm %', 'Currency', 'Notes', 'Modified By',
  'Modified Date',
] as const;

export type Column = (typeof BASIC_COLUMNS_REQUIRED)[number] | (typeof HISTORY_COLUMNS)[number];

/** The cells a user types into. */
export type NumberField = 'Lower Tier Boundary' | 'Upper Tier Boundary' | 'Comm %' | 'SC Comm %' | 'ETS Comm %';
export type CheckField = 'Profit Only' | 'Is SC Comm Calculated On Net?';
export const PERCENT_FIELDS = ['Comm %', 'SC Comm %', 'ETS Comm %'] as const;
export const READ_ONLY_FIELDS = ['Currency', 'Modified By', 'Modified On'] as const;

/** Add Row defaults (TC-TF-14). */
export const ADD_ROW_DEFAULTS = {
  'Lower Tier Boundary': 0,
  'Upper Tier Boundary': 100_000_000,
  'Comm %': 0,
  'SC Comm %': 0,
  'ETS Comm %': 0,
  'Profit Only': 'No',
  'Is SC Comm Calculated On Net?': 'No',
} as const;

/** The Add Row default upper boundary. Not a cap: larger values are accepted (live, 2026-11-12). */
export const BOUNDARY_MAX = ADD_ROW_DEFAULTS['Upper Tier Boundary'];

/**
 * Bands the suite writes carry this upper boundary, so a leftover from an aborted run is recognised and
 * removed by `purgeLeftovers()` before the next run relies on a clean service type.
 */
export const AUTO_UPPER = 99_999_901;

export const PAGE_SIZES = ['10', '20', '30', '40', '50'] as const; // UNCONFIRMED beyond the default 10
/** History Action values. The requirements say "Update"; the live page says "Modify" (accepted as the live design). */
export const HISTORY_ACTIONS = ['Add', 'Modify', 'Remove', 'Copy'] as const;

// ---------------------------------------------------------------- field validation tables

/** A value typed into a cell and why it is tested. */
export interface Typed { readonly typed: string; readonly why: string }
/** A valid value and the number the cell must hold afterwards. */
export interface Kept extends Typed { readonly kept: number }

/**
 * The inputs of one number field:
 * - valid:   kept as `kept`, no marker, Save available;
 * - invalid: flagged while still being typed (NM-3673), Save unavailable, never kept;
 * - guarded: free-form input whose exact handling is a design choice — flagged, or read as a plain number,
 *            never kept as raw text and never executed.
 */
export interface FieldInput {
  readonly valid: readonly Kept[];
  readonly invalid: readonly Typed[];
  readonly guarded: readonly string[];
}

const LONG_DIGITS = '1234567890'.repeat(5);
const XSS = '<img src=x onerror=window.__tfXss=1>';

/** Lower Tier Boundary, on a new row whose Upper Tier Boundary is the default 100,000,000. */
export const LOWER_INPUT: FieldInput = {
  valid: [
    { typed: '0', kept: 0, why: 'the minimum' },
    { typed: '1', kept: 1, why: 'just above the minimum' },
    { typed: '99999999', kept: 99_999_999, why: 'one below Upper' },
    { typed: '100000000', kept: 100_000_000, why: 'equal to Upper' },
    { typed: '0007', kept: 7, why: 'leading zeros' },
  ],
  invalid: [
    { typed: '100000001', why: 'above Upper' },
    { typed: '-1', why: 'negative' },
    { typed: '-0.01', why: 'just below zero' },
    { typed: LONG_DIGITS, why: 'fifty digits' },
  ],
  guarded: ['', 'abc', '!@#$', '1500.75', '1e3', '1,000', XSS],
};

/** Upper Tier Boundary, on a new row whose Lower Tier Boundary is set to UPPER_LOWER_SEED first. */
export const UPPER_LOWER_SEED = 1_000;
export const UPPER_INPUT: FieldInput = {
  valid: [
    { typed: '1001', kept: 1_001, why: 'one above Lower' },
    { typed: '1000', kept: 1_000, why: 'equal to Lower' },
    { typed: '100000000', kept: 100_000_000, why: 'the Add Row default' },
    // No maximum is enforced (live, 2026-11-12): the default 100,000,000 is not a cap.
    { typed: '100000001', kept: 100_000_001, why: 'above the default — no maximum' },
  ],
  invalid: [
    { typed: '999', why: 'below Lower' },
    { typed: '0', why: 'below Lower' },
    { typed: '-1', why: 'negative' },
  ],
  guarded: ['', 'xyz', '  2000  ', LONG_DIGITS],
};

/** Comm % — 0 % to 100 % (requirements §4, NM-3241). */
export const COMM_INPUT: FieldInput = {
  valid: [
    { typed: '0', kept: 0, why: 'the minimum' },
    // A value below 1 is read as a fraction (0.01 = 1 %), the rate entry rule accepted on review 2026-11-12.
    { typed: '0.01', kept: 1, why: 'below 1, read as a fraction: 1 %' },
    { typed: '50', kept: 50, why: 'mid-range' },
    { typed: '99.99', kept: 99.99, why: 'just below the maximum' },
    { typed: '100', kept: 100, why: 'the maximum' },
  ],
  invalid: [
    { typed: '100.01', why: 'just above the maximum' },
    { typed: '101', why: 'above the maximum' },
    { typed: '-0.01', why: 'just below zero' },
    { typed: '-5', why: 'negative' },
  ],
  guarded: ['', 'abc', '1.2.3', '12.345', '25%'],
};

/** SC Comm % and ETS Comm % share Comm %'s editor: the edges that prove its range check. */
export const RATE_EDGES: FieldInput = {
  valid: [{ typed: '100', kept: 100, why: 'the maximum' }],
  invalid: [{ typed: '100.01', why: 'just above the maximum' }, { typed: '-0.01', why: 'just below zero' }],
  guarded: [],
};

// ---------------------------------------------------------------- overlap rule

export interface Band { readonly lower: number; readonly upper: number }
export interface BandPair { readonly a: Band; readonly b: Band; readonly why: string }

/** Requirements §4: bands of one service type overlap when max(L1, L2) ≤ min(U1, U2). */
export const OVERLAPPING: readonly BandPair[] = [
  { a: { lower: 0, upper: 5_000 }, b: { lower: 4_000, upper: 9_000 }, why: 'partly overlapping' },
  { a: { lower: 0, upper: 10_000 }, b: { lower: 2_000, upper: 3_000 }, why: 'one inside the other' },
  { a: { lower: 100, upper: 200 }, b: { lower: 100, upper: 200 }, why: 'identical' },
  { a: { lower: 0, upper: 1_000 }, b: { lower: 1_000, upper: 2_000 }, why: 'sharing a boundary value' },
];

export const SEPARATE: readonly BandPair[] = [
  { a: { lower: 0, upper: 999 }, b: { lower: 1_000, upper: 2_000 }, why: 'adjacent' },
  { a: { lower: 0, upper: 1_000 }, b: { lower: 2_000, upper: 5_000 }, why: 'with a gap (TC-TF-13)' },
];

// ---------------------------------------------------------------- import and export

export const EXPORT_FILE = (office: string): string => `TierFlatCommissions-${office}.xlsx`;

/** Header row of the Basic Information export (live; its names differ from the grid — accepted on review). */
export const EXPORT_HEADERS = [
  'Local Office Id', 'Business Type', 'Service Type', 'Lower Tier Boundary', 'Upper Tier Boundary', 'Commission %',
  'Profit Only', 'Service Charge Commission %', 'Is Service Charge Commission Calculated On Net?', 'ETS Commission %',
  'Currency', 'Modified By', 'Modified On',
] as const;

/** Header row of the History export (live; accepted on review). */
export const AUDIT_HEADERS = [
  'Local Office Id', 'Action', 'Business Type', 'Service Type', 'Lower Tier Boundary', 'Upper Tier Boundary', 'Comm %',
  'Profit Only', 'Service Charge Comm', 'Is Service Charge Commission Calculated On Net?', 'ETS Comm %', 'Currency',
  'Notes', 'Modified By', 'Modified On',
] as const;
export const AUDIT_FILE = (office: string): string => `TierFlatCommAudit-${office}.xlsx`;

export interface BadUpload { readonly name: string; readonly mimeType: string; readonly body: string }

/** Files Import must refuse before anything is uploaded (TC-TF-26; requirements: .xlsx / .xls only). */
export const BAD_UPLOADS: readonly BadUpload[] = [
  { name: 'tiers.txt', mimeType: 'text/plain', body: 'Service Type,Lower,Upper\nRental,0,1000\n' },
  { name: 'tiers.pdf', mimeType: 'application/pdf', body: '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' },
  { name: 'tiers.csv', mimeType: 'text/csv', body: 'Service Type,Lower,Upper\nRental,0,1000\n' },
  { name: 'tiers.xlsx.exe', mimeType: 'application/octet-stream', body: 'MZ' },
];

/** History page-number box: each must leave the pager on a real page. */
export const PAGE_BOX_INPUT: readonly Typed[] = [
  { typed: '0', why: 'below the first page' },
  { typed: '-1', why: 'negative' },
  { typed: '9999', why: 'past the last page' },
  { typed: 'abc', why: 'letters' },
  { typed: '1.5', why: 'decimal' },
];

// ---------------------------------------------------------------- reset dates

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** Days in a month of a year (month 1 – 12), leap-year aware. */
export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

// ---------------------------------------------------------------- texts

export const TEXT = {
  header: 'Commission Tier/Flat',
  pageTitle: 'Commission Tier/Flat | Navigator',
  info: 'View and manage commission tiers for the selected local office.',
  productCodeBanner: 'Product Code Commissions exist for this location.',
  /** Tooltip of the red warning icon of a Lower Tier Boundary above the Upper Tier Boundary. */
  lowerAboveUpper: 'Lower tier must be less than or equal to upper tier.',
  /** History of an office with no business type (Canada 2322 on e2e) shows this instead of a grid. */
  selectBusinessType: 'Select a business type to view commission tier history.',
  signInTitle: 'Sign in | Navigator',
  emptyBasic: 'Select criteria and click Search to view commission tiers.',
  noResults: 'No results',
  unsavedTitle: 'Unsaved changes',
  resetModalTitle: 'Commission Tier Reset',
  unexpectedError: /unexpected error/i,
  /** VALID_MSG_4 — the exact wording is UNCONFIRMED, so the check is on its meaning. */
  invalidFileType: /(excel|\.xlsx|\.xls|file type|invalid file|not supported)/i,
  forbidden: /forbidden|not authori[sz]ed|access denied|permission/i,
  /** CPT footer value: "1,250.00 USD" or "NA". */
  cpt: /^(NA|-?[\d,]+\.\d{2}\s+[A-Z]{3})$/,
} as const;
