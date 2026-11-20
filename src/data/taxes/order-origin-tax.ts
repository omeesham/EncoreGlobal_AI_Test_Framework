// Test data for Tax → Order Origin Tax (NM-4020). Values were read live on 2026-10-23.
// The table is company-wide: every office page lists every location's rows, so the office in the
// URL only decides which office the user is working in, not which rows are shown.

export interface OrderOriginTaxOffice {
  readonly code: string;
  readonly country: 'USA' | 'Canada' | 'Mexico';
}

/** The office-dependent cases run on all three canonical offices. */
export const OOT_OFFICES: readonly OrderOriginTaxOffice[] = [
  { code: '1606', country: 'USA' },
  { code: '2359', country: 'Canada' },
  { code: '7147', country: 'Mexico' },
];

export const officeLabel = (o: OrderOriginTaxOffice): string => `${o.country} ${o.code}`;

/** Office opened by the cases that do not depend on the office (company-wide data). */
export const EDIT_OFFICE = '1606';

/**
 * Rows (tax types) each office's edit and save cases use. All of them are 0 % rows, so they are
 * listed only with "Percentage not equal to 0" unticked.
 * - validation: never saved. Its only entry is the 1/1/2000 starting entry (Modified By "-").
 * - save: gets a new rate and is put back with a later record, as records cannot be deleted.
 * - notes: the first two rows of the office list, saved together with new notes and then cleared.
 */
export const ROW = {
  validation: 'Audio Conferencing',
  save: 'Web Conferencing',
  notes: ['APP Downloaded', 'App Quality Assurance'],
} as const;

/** Rate of the save row, which the save cases always put back. */
export const SAVE_ROW_RATE = '0.000000';

/** "As of" date far enough ahead to show each row's latest record. */
export const LATEST_AS_OF = '12/31/2099';

/** Stored effective date of the validation row's only entry. */
export const VALIDATION_ROW_DATE = '01/01/2000';

export const TEXT = {
  pageTitle: 'Order Origin Tax | Navigator',
  header: 'Order Origin Tax',
  info: 'Order Origin Tax.',
  tabBasic: 'Basic Information',
  tabHistory: 'Order Origin Tax History',
  allLocations: 'All locations',
  allTaxTypes: 'All',
  emptyBasic: 'Select criteria and click Search to view order origin tax records.',
  emptyHistory: 'Select criteria and click Search to view order origin tax history records.',
  saved: 'Record(s) saved successfully.',
  saveFailed: 'Failed to save order origin tax',
  /** Toast shown when the server fails a search. */
  loadFailed: 'Unable to load order origin tax information.',
  unsavedTitle: 'Unsaved changes',
  unsavedBody: 'Are you sure you want to leave this view? Any unsaved changes will be lost.',
  dialogTitle: 'Change Local Office',
} as const;

/** Messages of the per-row validation marker. */
export const ALERT = {
  newDateNeeded: 'Changing the tax rate requires a new effective date',
  dateAfter: (mdyyyy: string) => `Effective date must be after ${mdyyyy}.`,
  required: 'Required',
  invalidDate: 'Invalid date',
} as const;

export const COLUMNS = [
  'Location No',
  'Location Name',
  'Tax Type',
  'Zip Code',
  'City',
  'County',
  'State',
  'Additional Tax',
  'Effective Date',
  'Notes',
  'Modified By',
  'Modified On',
] as const;

export type Column = (typeof COLUMNS)[number];

/** Tax Type filter options after "All". Every office has one order origin tax row per tax type. */
export const TAX_TYPES = [
  'APP Downloaded',
  'App Quality Assurance',
  'App Quality Assurance – M',
  'App Remote Access',
  'Application Development',
  'Application Development – M',
  'Application Programming',
  'Application Programming – M',
  'Audio Conferencing',
  'Cancellation Fee',
  'Concise Labor - M',
  'Damage Waiver',
  'Digital Services',
  'Digital Services Labor',
  'Freight',
  'HSIA',
  'HSIA Labor',
  'Installation Labor',
  'Miscellaneous Services',
  'Mobile Apps',
  'Music Access',
  'Operating Labor',
  'Power',
  'Professional Services',
  'Reimbursed Exp',
  'Rental',
  'Repair & Maintenance',
  'Rigging',
  'Rigging Labor',
  'Sales',
  'Service Charge',
  'Set & Strike Labor',
  'Subrental',
  'Subrented Labor',
  'Technician - Support Services',
  'Telecom',
  'Telecom Labor',
  'Venue Equipment',
  'Video Conferencing',
  'Web Conferencing',
] as const;

/** Tax type used by the Tax Type filter case; it has rows on many locations. */
export const FILTER_TAX_TYPE = 'Rental';

/**
 * Additional Tax is stored as a fraction (0.05 = 5 %) and shown with six decimals. A whole number
 * typed in is read as a percentage, and the rate is capped at ±100 %.
 */
export const TAX_INPUT = [
  { typed: '5', shown: '0.050000', why: 'a whole number is read as a percentage' },
  { typed: '8.375', shown: '0.083750', why: 'a percentage with decimals' },
  { typed: '-5', shown: '-0.050000', why: 'a negative percentage (a tax reduction)' },
  { typed: '100', shown: '1.000000', why: 'the 100 % upper limit' },
  { typed: '101', shown: '1.000000', why: 'above 100 % is capped at 100 %' },
  { typed: '99999', shown: '1.000000', why: 'a far larger value is capped at 100 %' },
  { typed: '-100', shown: '-1.000000', why: 'the -100 % lower limit' },
  { typed: '-101', shown: '-1.000000', why: 'below -100 % is capped at -100 %' },
  { typed: '0.1234567', shown: '0.123457', why: 'more than six decimals is rounded to six' },
  { typed: '0.0000004', shown: '0.000000', why: 'a value below the sixth decimal rounds to zero' },
  { typed: '', shown: '0.000000', why: 'an emptied field becomes zero' },
] as const;

export const NOTES_MAX = 500;

/**
 * Start of the History range and pagination cases (the end stays today). From here to 2026-10-23
 * the company had 65 history records, so the window always holds more than one 50-row page.
 */
export const HISTORY_RANGE_START = { mdyyyy: '9/1/2025', shown: '09/01/2025' } as const;


/** Prefix of every note the save cases write, so leftovers are easy to spot. */
export const NOTE_PREFIX = 'ZZ OOT automation';
