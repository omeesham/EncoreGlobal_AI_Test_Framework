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
  // Must not be a Miami query — those are unreliable on this office.
  searchByName: 'Boston',
  // Upper bound guarding against the full ~4541-row catalog leaking through an unfiltered search.
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
