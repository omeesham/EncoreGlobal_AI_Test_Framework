// Test data for Commissions → Product Code (NM-3349). Values were read live on 2026-11-11.
// The page sets a commission per office on any level of the product tree (Category > Sub Category > Class >
// Sub Class > Item). The corporate office (1101) picks an office and edits; a local office only views its own.

/** The office whose page edits commissions (through Change Local Office). */
export const OFFICE = '1101';
export const OFFICE_NAME = '1101 - Corporate Office Encore USA SGA';

/** Canonical country offices: opened on their own, the page is view-only. */
export const COUNTRY_OFFICES = [
  { code: '1606', country: 'USA', name: '1606 - Embassy Suites by Hilton Washington DC Convention Center', tc: 'TC-COM-PCC-005', tag: '@C108015' },
  { code: '2359', country: 'Canada', name: '2359 - Toronto Hilton', tc: 'TC-COM-PCC-006', tag: '@C108016' },
  { code: '7147', country: 'Mexico', name: '7147 - Barcelo Monterrey Valle', tc: 'TC-COM-PCC-007', tag: '@C108017' },
] as const;

/** The office the saving cases change from 1101 (every change is put back), and where Copy sends it. */
export const EDIT_OFFICE = COUNTRY_OFFICES[0];
export const COPY_OFFICE = COUNTRY_OFFICES[1];

export const LEVELS = ['Category', 'Sub Category', 'Class', 'Sub Class', 'Item'] as const;
export type Level = (typeof LEVELS)[number];

/** One branch of the product tree, found by searching "Stingers". */
export const TREE = {
  search: 'Stingers',
  Category: 'Audio',
  'Sub Category': 'Audio Source',
  Class: 'Music Access Service',
  'Sub Class': 'Encore Music: Royalty Free Music',
  Item: 'Encore Music: Stingers - Royalty Free Music',
  subClassId: 91353,
  /** The Sub Class's items, as its dialog lists them. */
  items: ['Encore Music: Stingers - Royalty Free Music', 'Encore Music: Streaming - Royalty Free Music', 'Encore Music: Sync w/ Video - Royalty Free'],
  /** The Class's sub classes. */
  subClasses: ['Encore Music: Commercial Bckgrnd Music w/Player', 'Encore Music: Royalty Free Music'],
  /** Segments below the Class (2 sub classes and their 4 items). */
  classChildren: 6,
} as const;
/** What each level's dialog lists under the edited segment. */
export const CHILD_LEVEL: Record<Level, Level | null> = { Category: 'Sub Category', 'Sub Category': 'Class', Class: 'Sub Class', 'Sub Class': 'Item', Item: null };

export const GRID_COLUMNS = ['Local Office ID', 'Category', 'Sub Category', 'Class', 'Sub Class', 'Item', 'Description', 'Commission', 'Use Default Commission'] as const;
export type GridColumn = (typeof GRID_COLUMNS)[number];
/** The grid columns that widen when their edge is dragged; the others keep their width. */
export const RESIZABLE_COLUMNS: readonly GridColumn[] = ['Class', 'Sub Class', 'Item', 'Description'];
export const HISTORY_COLUMNS = ['Local Office ID', 'Level', 'Name', 'Action', 'Commission', 'Use Default Commission', 'Notes', 'Modified By', 'Modified Date'] as const;
export type HistoryColumn = (typeof HISTORY_COLUMNS)[number];
/** Ids the resize handles are labelled with ("Resize column SubCategory"). */
export const COLUMN_ID: Record<string, string> = {
  'Local Office ID': 'LocationId', Category: 'Category', 'Sub Category': 'SubCategory', Class: 'Class', 'Sub Class': 'SubClass', Item: 'Item',
  Description: 'Description', Commission: 'Commission', 'Use Default Commission': 'UseDefaultCommission',
};
export const PAGE_SIZES = ['10', '20', '30', '40', '50'] as const;

/** Any Field searches → rows found on a local office (active items only). */
export const SEARCHES = { one: 'Stingers', none: 'zzzz', inactive: { term: 'Projector', active: 21, all: 32 } } as const;
/** Characters a search engine could treat as wildcards or quotes; each must be searched as text. */
export const LITERAL_SEARCHES = ['%', '_', "'"] as const;

/** Typed into Comm % → shown after leaving the field. */
export const VALID_ENTRIES: readonly [string, string][] = [['5', '5.00 %'], ['5.5', '5.50 %'], ['99.99', '99.99 %'], ['100', '100.00 %'], ['0', '0.00 %'], ['0005', '5.00 %'], ['2.555', '2.56 %']];
/** Characters a percentage cannot hold are not typed: typed → what the field holds while typing. */
export const STRIPPED_ENTRIES: readonly [string, string][] = [['abc', ''], ['-5', '5'], ['+5', '5'], [' 5', '5'], ['1e2', '12'], ['1.2.3', '1.23'], ['1,5', '15']];
/** A value below 1 is read as a fraction: typed → shown. */
export const BELOW_ONE: readonly [string, string][] = [['0.5', '50.00 %'], ['.25', '25.00 %']];
export const OVER_100 = ['100.01', '150'] as const;
export const BAD_PAGE_NUMBERS = ['0', '-1', 'abc', ''] as const;

export const EXPORT = {
  basic: /^commissions_prodcode_\d{14}\.xlsx$/,
  history: /^commissions_prodcode_history_\d{14}\.xlsx$/,
  basicColumns: ['LOCATION ID', 'Level', 'Name', 'Comm %', 'User Default Comm'],
  historyColumns: ['LOCATION ID', 'Level', 'Name', 'Action', 'Comm %', 'User Default Comm', 'Notes', 'Modified By', 'Modified On'],
} as const;

export const TEXT = {
  pageTitle: 'Product Code Commission | Navigator',
  signInTitle: 'Sign in | Navigator',
  heading: 'Product Code Commission',
  tabs: ['Basic Information', 'Product Code Commission History'],
  menuItems: ['CMP', 'Allow DPCD', 'Product Code', 'Tier/Flat'],
  info: 'Search and manage product code commission settings.',
  criteria: 'Search Criteria',
  noResults: 'No results',
  limit: 'Search Limit exceeded. Only the first 1001 items were returned.',
  pickerTitle: 'Change Local Office',
  pickerSearch: 'Search by Location Name, Number',
  allLocations: 'All Locations',
  dialogTitle: 'Product Code Commission',
  confirmTitle: 'Confirm',
  confirm: (n: number) => `You have chosen to propagate the changes to the current segment and all of its child segments - Total [${n}] child segments. Confirm to proceed?`,
  saved: 'Commission changes saved.',
  copied: (n: number) => `${n} new records were inserted`,
  copyTitle: 'Copy Product Code Commission to Location(s)',
  copySearch: 'Search...',
  exportFailed: 'Failed to export product code commission data.',
  /** What a failed list shows: after a server error, and after a dropped connection. */
  loadFailed: { 500: 'An unexpected response was received from the server.', network: 'Failed to fetch' },
  modify: 'Modify',
  copy: 'Copy',
} as const;
