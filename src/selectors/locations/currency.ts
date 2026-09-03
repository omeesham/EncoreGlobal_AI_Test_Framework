export const SetupCurrencySelectors = {
  btnSaveCurrency: '[data-testid="location-settings-btn-save"]',
  tblCurrencyGrid: '[data-testid="location-settings-table-currency"]',

  chkUSDSelected: '[data-testid="location-settings-checkbox-currency-USD-selected"]',
  chkUSDIsDefault: '[data-testid="location-settings-checkbox-currency-USD-default"]',
  drpUSDMerchant: '[data-testid="location-settings-select-currency-USD-merchant"]',

  chkCADSelected: '[data-testid="location-settings-checkbox-currency-CAD-selected"]',
  chkCADIsDefault: '[data-testid="location-settings-checkbox-currency-CAD-default"]',
  drpCADMerchant: '[data-testid="location-settings-select-currency-CAD-merchant"]',

  chkMXNSelected: '[data-testid="location-settings-checkbox-currency-MXN-selected"]',
  chkMXNIsDefault: '[data-testid="location-settings-checkbox-currency-MXN-default"]',
  drpMXNMerchant: '[data-testid="location-settings-select-currency-MXN-merchant"]',

  colHeaderCurrencyCode: '[data-testid="location-settings-table-currency-col-code"]',
  colHeaderSelected: '[data-testid="location-settings-table-currency-col-selected"]',
  colHeaderIsDefault: '[data-testid="location-settings-table-currency-col-is-default"]',
  colHeaderMerchant: '[data-testid="location-settings-table-currency-col-merchant"]',

  txtNoMatchesFound: '[role="listbox"]:has-text("No Matches Found")',
} as const;
