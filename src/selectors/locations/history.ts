export const SetupHistorySelectors = {
  tabLocationManagementHistory: '[data-testid="location-settings-tab-management-history"]',
  tabContentMgmtHistory: '[data-testid="location-settings-tab-content-management-history"]',

  drpHistoryType: '[data-testid="location-settings-select-history-type"]',

  tblMgmtHistory: '[data-testid="location-settings-table-management-history"]',
  // The Legacy history type renders a bare table with NO data-testid of its own (the tagged wrapper
  // above leaves the DOM entirely), so both grids are reachable only through the panel's one table.
  tblAnyMgmtHistory: '[data-testid="location-settings-tab-content-management-history"] table[data-slot="table"]',

  drpMgmtHistoryRowsPerPage: '[data-testid="location-settings-tab-content-management-history"] button[role="combobox"]:not([data-testid="location-settings-select-history-type"])',
  txtMgmtHistoryCurrentPage: '[data-testid="location-settings-tab-content-management-history"] input[aria-label="Current page number"]',
  btnMgmtHistoryFirstPage: 'button[aria-label="Go to first page"]',
  btnMgmtHistoryPrevPage: 'button[aria-label="Go to previous page"]',
  btnMgmtHistoryNextPage: 'button[aria-label="Go to next page"]',
  btnMgmtHistoryLastPage: 'button[aria-label="Go to last page"]',
} as const;
