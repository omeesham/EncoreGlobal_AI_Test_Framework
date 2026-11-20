// Test data for Commissions → CMP (NM-3649). Values were read live on 2026-11-09 and 2026-11-10.
// The page sets one CMP commission percentage per local office and business type. The corporate office
// (1101) changes them through its Change Local Office dialog; a local office (e.g. 1115) only views its own.
// Business Type lists the types ticked for the office in Settings > Location > Business Types.

/** The office whose page manages CMP commissions. */
export const OFFICE = '1101';

/** The office the page shows first, with its business type (only Audio Visual is ticked for it). */
export const FIRST_OFFICE = '1102 - Corporate Office - Long Beach';
export const BUSINESS_TYPES = ['Audio Visual'] as const;

/** Every business type, in the order the lists show them. */
export const ALL_BUSINESS_TYPES = [
  'Audio Visual', 'Business Center Rentals', 'Business Center Services', 'Electrical Services', 'Production',
  'Expo Services', 'In-House', 'Integrated Solutions', 'Internet Services', 'Rigging Services',
] as const;

/** The office the saving cases change; its value is put back after each case. Every business type is ticked for it. */
export const EDIT_OFFICE = '1107';
/** The other business type a saving case changes on 1107 (its id in the save). */
export const OTHER_TYPE = { name: 'Production', id: 5 } as const;

/** An office whose export holds commissions for several business types. */
export const MULTI_TYPE_OFFICE = '1121';

/** A local office: opened on its own, the page only shows its commissions. */
export const LOCAL_OFFICE = { code: '1115', name: '1115 - The Abbey Resort' } as const;

/** Canonical country offices: the page is not offered there and shows its error message (each with its own case). */
export const COUNTRY_OFFICES = [
  { code: '1606', country: 'USA', tc: 'TC-COM-CMP-005', tag: '@C107851' },
  { code: '2359', country: 'Canada', tc: 'TC-COM-CMP-006', tag: '@C107852' },
  { code: '7147', country: 'Mexico', tc: 'TC-COM-CMP-007', tag: '@C107853' },
] as const;

/** Offices listed only once Active/Inactive is unticked. */
export const INACTIVE_OFFICES = ['0000', '1099', '1100', '1103'] as const;

export const HISTORY_COLUMNS = ['Local Office', 'Business Type', 'Action', 'Commission', 'Modified By', 'Modified On'] as const;
export type HistoryColumn = (typeof HISTORY_COLUMNS)[number];

/** Column ids the resize handles are labelled with ("Resize column commission"). */
export const COLUMN_ID: Record<HistoryColumn, string> = {
  'Local Office': 'localOffice', 'Business Type': 'businessType', Action: 'action', Commission: 'commission', 'Modified By': 'modifiedBy', 'Modified On': 'modifiedOn',
};

export const PAGE_SIZES = ['10', '20', '30', '40', '50'] as const;

export const EXPORT = {
  basic: { file: 'CMPCommission.xlsx', columns: ['Local Office Id', 'Business Type', 'Commission'] },
  history: { file: 'CMPCommissionHistory.xlsx' },
} as const;

/** Typed into the Commission field → what it should show after leaving the field. */
export const VALID_ENTRIES: readonly [string, string][] = [['1', '1 %'], ['5.5', '5.5 %'], ['99.99', '99.99 %'], ['100', '100 %']];
/** Characters a percentage cannot hold are not typed: typed → shown while typing. */
export const STRIPPED_ENTRIES: readonly [string, string][] = [['abc', ''], ['%', ''], ['-5', '5'], ['+5', '5'], [' 5', '5'], ['1e2', '12'], ['1.2.3', '1.23']];
/** A value below 1 is read as a fraction and shown (and sent) as a percentage: typed → shown and sent. */
export const BELOW_ONE: readonly [string, number][] = [['0.5', 50], ['0.05', 5], ['.25', 25], ['..5', 50]];
export const OVER_100 = ['100.01', '101', '150', '12345'] as const;
/** Whole numbers whose fraction (n / 100) does not round-trip exactly in floating point. */
export const WHOLE_NUMBERS = ['7', '29', '57'] as const;
/** Pasted → shown after leaving the field: only a plain number is taken, anything else is refused whole. */
export const PASTES: readonly [string, string][] = [['12.5', '12.5 %'], ['12.5%', ''], [' 7 ', ''], ['abc12.5%', '']];
/** Entries the page-number box does not take (the page stays). */
export const BAD_PAGE_NUMBERS = ['0', '-1', 'abc', ''] as const;
/** The History export's columns (Action comes before Business Type). */
export const HISTORY_EXPORT_COLUMNS = ['Local Office Id', 'Action', 'Business Type', 'Commission', 'Modified By', 'Modified On'] as const;
/** Another Commissions page, opened from the sidebar with an unsaved edit. */
export const OTHER_MENU_PAGE = 'Allow DPCD';

export const TEXT = {
  pageTitle: 'CMP Commissions | Navigator',
  signInTitle: 'Sign in | Navigator',
  heading: 'CMP Commissions',
  tabs: ['Basic Information', 'Commission CMP History'],
  menuItems: ['CMP', 'Allow DPCD', 'Product Code', 'Tier/Flat'],
  info: 'View and update the commission percentage for the selected local office.',
  crash: 'Unexpected error occured.',
  tryAgain: 'Try again',
  locationTab: 'Business Types',
  pickerTitle: 'Change Local Office',
  pickerSearch: 'Search by Location Name, Number',
  pickerColumns: ['Local Office', 'Local Office Name'],
  activeFilter: 'Active/Inactive',
  noResults: 'No results.',
  confirmTitle: 'Save Changes',
  confirmText: 'Are you sure you want to save the changes?',
  unsavedTitle: 'Unsaved changes',
  unsavedText: 'Are you sure you want to leave this view? Any unsaved changes will be lost.',
  saved: 'CMP commission updated successfully.',
  saveFailed: 'Failed to save CMP commission.',
  action: 'Modify',
} as const;
