export const SetupHistorySelectors = {
  tabLocationManagementHistory: '[data-testid="location-settings-tab-management-history"]',

  drpHistoryType: '[data-testid="location-settings-select-history-type"]',

  tblMgmtHistory: '[data-testid="location-settings-table-management-history"]',

  drpMgmtHistoryRowsPerPage: '[data-testid="location-settings-tab-content-management-history"] button[role="combobox"]:not([data-testid="location-settings-select-history-type"])',
  btnMgmtHistoryFirstPage: 'button[aria-label="Go to first page"]',
  btnMgmtHistoryPrevPage: 'button[aria-label="Go to previous page"]',
  btnMgmtHistoryNextPage: 'button[aria-label="Go to next page"]',
  btnMgmtHistoryLastPage: 'button[aria-label="Go to last page"]',
} as const;
