// Test data for Tax → International Tax Type Setup (NM-4026). Values were read live on 2026-11-04.
// The tax types are kept per country and province, company-wide: every office lists the same rows,
// so the office in the URL only decides which office the user is working in.

export interface ItsOffice {
  readonly code: string;
  readonly country: 'USA' | 'Canada' | 'Mexico';
}

/** The page opens and searches the same way on all three canonical offices. */
export const ITS_OFFICES: readonly ItsOffice[] = [
  { code: '1606', country: 'USA' },
  { code: '2359', country: 'Canada' },
  { code: '7147', country: 'Mexico' },
];

export const officeLabel = (o: ItsOffice): string => `${o.country} ${o.code}`;

/** Office opened by the cases that do not depend on the office (company-wide data). */
export const EDIT_OFFICE = '1606';

export const COUNTRIES = ['Mexico', 'Canada', 'Bahamas'] as const;

/** Provinces listed per country, in the default (Province ascending) order. */
export const PROVINCES = {
  Mexico: 32,
  Canada: [
    'Alberta',
    'British Columbia',
    'Manitoba',
    'Nanavut',
    'New Brunswick',
    'Newfoundland and Labrador',
    'Northwest Territories',
    'Nova Scotia',
    'Ontario',
    'Prince Edward Island',
    'Quebec',
    'Saskatchewan',
    'Yukon',
  ],
  Bahamas: ['Bahamas'],
} as const;

/** Options of the row pickers per country; '' is the blank Provincial option. */
export const TYPE_OPTIONS = {
  Mexico: { gov: ['IVA'], provincial: [''] },
  Canada: { gov: ['GST', 'HST'], provincial: ['', 'PST', 'QST'] },
} as const;

/**
 * Rows the cases use. The spec files run side by side, so the rows edited without saving are never
 * rows the save cases write to. An empty Mexican state (no tax type yet) is looked up at run time, as
 * other users set states up too; it is never saved, because a GOV type cannot be cleared again.
 * - mexico / canada: read only, for the picker options of each country.
 * - edit: Canadian, HST with a GOV Reg. Number; the validation and unsaved-changes cases edit it.
 * - noProvincial: Canadian, GST only; the Provincial Reg. Number case adds PST to it without saving.
 * - withProvincial: Canadian, GST and PST; the Provincial removal case blanks PST without saving.
 */
export const ROW = {
  mexico: 'Aguascalientes',
  canada: 'Alberta',
  edit: 'Ontario',
  noProvincial: 'Northwest Territories',
  withProvincial: 'Manitoba',
} as const;

/** Quebec's GST/QST record has applied since 01/01/2000, so the day before shows none. */
export const QUEBEC_RECORD = {
  since: '01/01/2000',
  dayBefore: '12/31/1999',
  gov: 'GST',
  provincial: 'QST',
  provincialReg: '1002036904',
} as const;

/**
 * Reg. Numbers the save cases change and always put back, by row. A new number needs a new effective
 * date and records cannot be deleted, so each is put back by one more record dated a day later.
 */
export const SAVE_ROWS = {
  mexico: { country: 'Mexico', province: 'Aguascalientes', kind: 'gov', reg: '45896155' },
  canada: [
    { country: 'Canada', province: 'Alberta', kind: 'provincial', reg: '836078-2' },
    { country: 'Canada', province: 'Quebec', kind: 'provincial', reg: '1002036904' },
  ],
} as const;

/**
 * Row whose tax types the type-change cases switch and put back: Yukon has GST and no Provincial type.
 * GST can be switched to HST and back, and a Provincial type can be added and removed again (the
 * Provincial picker has a blank option), so these saves can be undone.
 */
export const TYPE_ROW = { country: 'Canada', province: 'Yukon', gov: 'GST', otherGov: 'HST', provincial: 'PST' } as const;

/** Prefix of every Reg. Number the save cases write, so leftovers are easy to spot. */
export const REG_PREFIX = 'ITS-AUTO';

/** "As of" date far enough ahead to show each row's latest record. */
export const LATEST_AS_OF = '12/31/2099';

export const REG_MAX = 100;

export const TEXT = {
  pageTitle: 'International Tax Type Setup | Navigator',
  header: 'International Tax Type Setup',
  info: 'Search and manage international tax configurations.',
  empty: 'Select country and effective date, then click Search to view international tax type records.',
  saved: 'Record(s) saved successfully.',
  saveFailed: 'Failed to save international tax type',
  signInTitle: 'Sign in | Navigator',
  unsavedTitle: 'Unsaved changes',
  unsavedBody: 'Are you sure you want to leave this view? Any unsaved changes will be lost.',
} as const;

/** Messages of the per-row validation marker in the Effective Date cell. */
export const ALERT = {
  required: 'Required',
  invalidDate: 'Invalid date',
  newDateNeeded: 'Effective date must be changed when tax type or registration number is modified',
  provincialRegRequired: 'Provincial Tax Reg Number is required',
  /** The GOV counterpart of the Provincial message; the page shows no such message today. */
  govRegRequired: 'GOV Tax Reg Number is required',
  /** The message writes the date short: 01/01/2000 → "1/1/2000". */
  dateAfter: (mmddyyyy: string) => `Effective date must be after ${mmddyyyy.replace(/(^|\/)0/g, '$1')}`,
} as const;

export const COLUMNS = [
  'Province',
  'GOV Tax Type Name',
  'GOV Tax Reg. Number',
  'Provincial Tax Type Name',
  'Provincial Tax Reg. Number',
  'Effective Date',
] as const;

export type Column = (typeof COLUMNS)[number];

/** The two tax type pickers of a row. */
export type TypeKind = 'gov' | 'provincial';
