export const COLUMN_COUNT = 87;

export const FIRST_COLUMN = 'Local Office';

export const LAST_COLUMN = 'Warehouse Billing';

export const DEFAULT_ROWS_PER_PAGE = '20';

export const ROWS_PER_PAGE_OPTIONS = ['10', '20', '30', '40', '50'] as const;

export const NON_SORTABLE_COLUMNS = [
  'Active',
  'Corporate Pricing',
  'Allow DPCD',
  'Allow Production Quote',
] as const;

export const ROW_1_EXPECTED = {
  'Local Office': '1604',
  'Local Office Name': 'Parker Palm Springs',
  'Active': '\u2714', // Unicode checkmark ✔
  'Currency': 'USD',
} as const;
