export const SetupSharedSetupLocationsSelectors = {
  tabSharedSetupLocations: '[data-testid="location-settings-sub-tab-shared-setup-locations"]',

  tblSharedSetupLocations: '[data-testid="location-settings-table-shared-setup"]',

  colHeaderLocalOffice: '[data-testid="location-settings-table-shared-setup-col-local-office"]',
  colHeaderLocalOfficeName: '[data-testid="location-settings-table-shared-setup-col-local-office-name"]',
  colHeaderPrimaryOffice: '[data-testid="location-settings-table-shared-setup-col-primary-office"]',
  colHeaderSharesInventory: '[data-testid="location-settings-table-shared-setup-col-shares-inventory"]',
  colHeaderActions: '[data-testid="location-settings-table-shared-setup-col-actions"]',

  chkSelfPrimaryOffice: '[data-testid="location-settings-checkbox-shared-location-0-primary"]',
  chkSelfSharesInventory: '[data-testid="location-settings-checkbox-shared-location-0-shares-inventory"]',
  btnSelfDelete: '[data-testid="location-settings-btn-delete-shared-location-0"]',

 // testid suffix is the DOM row-index (row 0 = self, row 1 = Add row); shifts to -2, -3, etc. on insert/delete — unstable, use positional selector instead.
  btnSharedAdd: '[data-testid="location-settings-table-shared-setup"] tbody tr:last-child button',

  dlgChangeLocalOffice: '[data-testid="location-settings-modal-change-local-office"]',
 // No heading testid available; scoped inside container.
  dlgChangeLocalOfficeHeading: '[data-testid="location-settings-modal-change-local-office"] h2',
  txtDlgSearch: '[data-testid="location-settings-modal-change-local-office-input-search"]',
 // No results-table testid available; scoped inside container.
  tblDlgResults: '[data-testid="location-settings-modal-change-local-office"] table',
  btnDlgSelect: '[data-testid="location-settings-modal-change-local-office-btn-select"]',
  btnDlgCancel: '[data-testid="location-settings-modal-change-local-office-btn-cancel"]',
 // No Close btn testid available; last-button fallback inside container.
  btnDlgClose: '[data-testid="location-settings-modal-change-local-office"] button:last-of-type',
} as const;
