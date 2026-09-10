export const SetupLegalSelectors = {
  tabLegal: '[data-testid="location-settings-sub-tab-legal"]',

  contentLegal: '[data-testid="location-settings-sub-tab-content-legal"]',

  tblLegal: '[data-testid="location-settings-table-legal"]',

  colHeaderLanguageName: '[data-testid="location-settings-table-legal-col-language-name"]',
  colHeaderServiceChargeName: '[data-testid="location-settings-table-legal-col-service-charge-name"]',
  colHeaderTermsAndConditionsName: '[data-testid="location-settings-table-legal-col-terms-and-conditions-name"]',

  drpLegalServiceCharge0: '[data-testid="location-settings-select-legal-0-service-charge"]',

  drpLegalTerms0: '[data-testid="location-settings-select-legal-0-terms"]',

  btnSaveLegal: '[data-testid="location-settings-btn-save"]',
} as const;
