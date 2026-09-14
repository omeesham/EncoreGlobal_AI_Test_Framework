export const LocalOfficeHistorySelectors = {
  secHistoryTypeSelector: '[data-testid="local-office-settings-history-type-selector"]',
  drpHistoryType: '[data-testid="local-office-settings-history-select-type"]',
  secHistoryTableContainer: '[data-testid="local-office-settings-history-table-container"]',
  tblHistory: '[data-testid="local-office-settings-history-table"]',

 // The "Location Management Legacy History" type renders its OWN grid, not the standard one:
 // different testids, 44 columns instead of 42. Confirmed live. Any code that switches history
 // type must therefore not assume which of the two grids will appear.
  secLegacyHistoryContainer: '[data-testid="local-office-settings-legacy-history-container"]',
  tblLegacyHistory: '[data-testid="local-office-settings-legacy-history-table"]',

 // Paginator controls. Scoped to the history tab content because the aria-labels are the
 // app-wide paginator's, shared verbatim with the Locations module's history grid
 // (src/selectors/locations/history.ts) — unscoped they would also match that tab's paginator
 // whenever both panels are in the DOM.
  btnHistoryFirstPage: '[data-testid="local-office-settings-tab-content-history"] button[aria-label="Go to first page"]',
  btnHistoryPrevPage: '[data-testid="local-office-settings-tab-content-history"] button[aria-label="Go to previous page"]',
  btnHistoryNextPage: '[data-testid="local-office-settings-tab-content-history"] button[aria-label="Go to next page"]',
  btnHistoryLastPage: '[data-testid="local-office-settings-tab-content-history"] button[aria-label="Go to last page"]',
  txtHistoryCurrentPage: '[data-testid="local-office-settings-tab-content-history"] input[aria-label="Current page number"]',
 // The rows-per-page trigger is the only other combobox in the panel, so it is addressed by
 // exclusion of the history-type selector — same technique as drpMgmtHistoryRowsPerPage.
  drpHistoryRowsPerPage: '[data-testid="local-office-settings-tab-content-history"] button[role="combobox"]:not([data-testid="local-office-settings-history-select-type"])',
} as const;
