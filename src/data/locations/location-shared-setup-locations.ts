export const SSL_COLUMN_HEADERS = [
  'Local Office',
  'Local Office Name',
  'Primary Office',
  'Shares Inventory',
  '',
] as const;

export const SELF_ROW = {
  localOffice: '1604',
  localOfficeName: 'Parker Palm Springs',
} as const;

export const ADD_LOCATION = {
 /** Default name-search query — Boston returns 77 rows on e2e office 1604
  *  (live-verified 2026-05-19; non-Miami query required due to app behavior).
  *  Alt-search specs use distinct per-spec literals (Chicago/Dallas/Denver/Atlanta)
  *  for query independence — see spec inline literals. */
  searchByName: 'Boston',
 /** Max expected results after name search. Guards against full 4541-row catalog leakage.
  *  Raised 400 → 600 to accommodate Dallas/Denver/Atlanta whose e2e counts were unmeasured at
  *  T7a-refactor time; 600 retains 7x headroom vs the 4541-row full catalog. Known counts:
  *  Boston=77, Chicago=123, Marriott=295. */
  searchByNameMaxResults: 600,
  searchByNumber: '990002',
  expectedName: '990002 - Test Server1',
} as const;

export const SSL_DIALOG_HEADING = 'Change Local Office';

// Non-Miami queries throughout — Miami queries are unreliable on this office due to app behavior.

export const SEARCH_BVA_1_CHAR = 'A';
export const SEARCH_BVA_LONG_200 = 'X'.repeat(200);

export const SEARCH_NEG_SPECIAL = `&"'<>`;
export const SEARCH_NEG_WHITESPACE = '   ';
export const SEARCH_NEG_LEADING_TRAILING_ATLANTA = '  Atlanta  ';

export const SEARCH_EDIT_QUERY_1 = 'Atlanta';
export const SEARCH_EDIT_QUERY_2 = 'Boston';

export const SEARCH_DELETE_MIDDLE_QUERIES = ['Chicago', 'Dallas', 'Denver'] as const;
export const SEARCH_DELETE_ALL_QUERIES = ['Atlanta', 'Boston'] as const;

export const SEARCH_FIVE_ROW_QUERIES = ['Chicago', 'Boston', 'Dallas', 'Denver', 'Atlanta'] as const;

export const SEARCH_CROSS_ROW_QUERY = 'Atlanta';
