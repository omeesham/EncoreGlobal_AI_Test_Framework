// Test data for Tax → Special Rate (NM-4022). Values were read live on 2026-11-05.
// Special rates are kept per state, county, city and zip code and per tax type, company-wide: every
// office lists the same rows, so the office in the URL only decides which office the user is working in.

export interface SrOffice {
  readonly code: string;
  readonly country: 'USA' | 'Canada' | 'Mexico';
}

/** The page opens and searches the same way on all three canonical offices. */
export const SR_OFFICES: readonly SrOffice[] = [
  { code: '1606', country: 'USA' },
  { code: '2359', country: 'Canada' },
  { code: '7147', country: 'Mexico' },
];

export const officeLabel = (o: SrOffice): string => `${o.country} ${o.code}`;

/** Office opened by the cases that do not depend on the office (company-wide data). */
export const EDIT_OFFICE = '1606';

export const TABS = ['Basic Information', 'Special Rate History'] as const;
export type Tab = (typeof TABS)[number];

/** State filter options after "All": US states, DC and the territories, alphabetical. */
export const STATES = [
  'AK', 'AL', 'AR', 'AS', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'FM', 'GA', 'GU', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS',
  'KY', 'LA', 'MA', 'MD', 'ME', 'MH', 'MI', 'MN', 'MO', 'MP', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY',
  'OH', 'OK', 'OR', 'PA', 'PR', 'PW', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY',
] as const;

/** Tax Type filter options after "All". Two names carry an en dash, as the page writes them. */
export const TAX_TYPES = [
  'APP Downloaded', 'App Quality Assurance', 'App Quality Assurance – M', 'App Remote Access', 'Application Development',
  'Application Development – M', 'Application Programming', 'Application Programming – M', 'Audio Conferencing',
  'Cancellation Fee', 'Concise Labor - M', 'Damage Waiver', 'Digital Services', 'Digital Services Labor', 'Freight', 'HSIA',
  'HSIA Labor', 'Installation Labor', 'Miscellaneous Services', 'Mobile Apps', 'Music Access', 'Operating Labor', 'Power',
  'Professional Services', 'Reimbursed Exp', 'Rental', 'Repair & Maintenance', 'Rigging', 'Rigging Labor', 'Sales',
  'Service Charge', 'Set & Strike Labor', 'Subrental', 'Subrented Labor', 'Technician - Support Services', 'Telecom',
  'Telecom Labor', 'Venue Equipment', 'Video Conferencing', 'Web Conferencing',
] as const;

export const YES_NO = ['All', 'Yes', 'No'] as const;

/** A state search lists one state-level row per tax type. */
export const ROWS_PER_PLACE = TAX_TYPES.length;

/** County and city the cascade cases use (California › Alameda › Berkeley). */
export const PLACE = { state: 'CA', county: 'ALAMEDA', city: 'BERKELEY', otherState: 'NY' } as const;

/**
 * Palau (PW) rows the cases edit. Its 40 rows are plain state-level records last changed years ago.
 * Saves are dated the day after each row's latest record and never before FUTURE_FLOOR, so today's taxes never change.
 * - edit: edited without saving by the validation and unsaved-changes cases (record of 01/19/2006).
 * - save / saveOther: written by the save cases and put back by one more record dated a day later.
 * - asOf: Freight carries a fixed record from 01/02/2099 (Special, 1.25%, set up on 2026-11-05).
 */
export const PW = {
  state: 'PW',
  edit: 'Rental',
  editSince: '01/19/2006',
  save: 'Rigging',
  saveOther: 'Sales',
  asOf: { taxType: 'Freight', before: '01/19/2006', since: '01/02/2099', rate: '0.012500', notes: 'ITS-AUTO probe' },
} as const;

/**
 * History of January 2006 for a territory no case writes to: American Samoa's 18 original state-level records,
 * all from 01/19/2006 (Palau's history also carries the save cases' records, so it is not used here).
 */
export const JAN_2006 = { state: 'AS', from: [2006, 1, 1], to: [2006, 1, 31], count: 18, date: '01/19/2006' } as const;

/**
 * County-level history is rare: with State on All, History lists state-level records only. Texas › Harris
 * has county records from November 2013 (4 on 2026-11-05); Houston is one of its cities.
 */
export const COUNTY_HISTORY = { state: 'TX', county: 'HARRIS', city: 'HOUSTON', from: [2013, 1, 1], to: [2013, 12, 31] } as const;

/** A year of history across all states, for paging (451 records on 2026-11-05). */
export const YEAR_2006 = { from: [2006, 1, 1], to: [2006, 12, 31] } as const;

/** Prefix of every Notes value the save cases write, so leftovers are easy to spot. */
export const NOTE_PREFIX = 'SR-AUTO';

/** Earliest date a save case writes: records from this day on cannot change today's taxes. */
export const FUTURE_FLOOR = '01/03/2099';

/** "As of" date far enough ahead to show each row's latest record. */
export const LATEST_AS_OF = '12/31/2199';

export const NOTES_MAX = 500;

export const PAGE_SIZES = ['10', '20', '30', '40', '50'] as const;

export const TEXT = {
  pageTitle: 'Special Rate | Navigator',
  header: 'Special Rate',
  info: 'Special Rate.',
  emptyBasic: 'Select criteria and click Search to view special rate records.',
  emptyHistory: 'Select criteria and click Search to view special rate history records.',
  noHistory: 'No special rate history records found',
  saved: 'Record(s) saved successfully.',
  saveFailed: 'Failed to save special rate',
  signInTitle: 'Sign in | Navigator',
  unsavedTitle: 'Unsaved changes',
  unsavedBody: 'Are you sure you want to leave this view? Any unsaved changes will be lost.',
} as const;

/** Messages of the per-row validation marker. */
export const ALERT = {
  required: 'Required',
  invalidDate: 'Invalid date',
  newDateNeeded: 'Effective date must be changed when special rate, taxable setting, or special setting is modified',
  /** The message writes the date short: 01/19/2006 → "1/19/2006". */
  dateAfter: (mmddyyyy: string) => `Effective date must be after ${mmddyyyy.replace(/(^|\/)0/g, '$1')}`,
} as const;

export const BASIC_COLUMNS = [
  'State', 'County', 'City', 'Zip Code', 'Tax Type', 'Taxable', 'Special', 'Effective Date', 'State Special',
  'County Special', 'City Special', 'Special Combined', 'Sales Combined', 'Total Combined', 'Notes', 'Modified By',
  'Modified On',
] as const;

export const HISTORY_COLUMNS = [
  'State', 'County', 'City', 'Zip Code', 'Tax Type', 'Taxable', 'Special', 'State Special', 'County Special',
  'City Special', 'Effective Date', 'Notes', 'Modified By', 'Modified On',
] as const;

export type Column = (typeof BASIC_COLUMNS)[number];

/** The filters of the search panel, both tabs. */
export type Filter = 'state' | 'county' | 'city' | 'taxType' | 'special' | 'taxable';
