export const SetupLeftPanelBasicInformationSelectors = {
  txtOffice: '[data-testid="location-settings-input-primary-location-no"]',
  txtLocalOffice: '[data-testid="location-settings-input-location-no"]',
  txtPayToAddress: '[data-testid="location-settings-input-pay-to-name"]',
  chkECommerceActive: '[data-testid="location-settings-checkbox-use-ecommerce"]',
  chkEnableProductionsOrders: '[data-testid="location-settings-checkbox-enable-productions-orders"]',
  // Disabled in edit mode by design (NM-831 / NM-1140) — selectable only during creation.
  // No data-testid, so label-anchored.
  drpLineOfBusiness: 'div:has(> label:text-is("Line Of Business")) button[role="combobox"]',

  txtLocalOfficeName: '[data-testid="location-settings-input-location-name"]',
  chkActive: '[data-testid="location-settings-checkbox-active"]',
  // btnLiveDate, drpTaxMode: no data-testid; label-anchored via :has(> label:text-is(...)).
  btnLiveDate: 'div:has(> label:text-is("Live Date")) button',
  drpTaxMode: 'div:has(> label:text-is("Tax Mode")) button[role="combobox"]',
  drpCountry: '[data-testid="location-settings-select-country"]',
  drpRegion: '[data-testid="location-settings-select-region"]',
  drpServicingBranch: '[data-testid="location-settings-select-servicing-branch"]',
  chkUnion: '[data-testid="location-settings-checkbox-is-union"]',

  tabBasicInformation: '[data-testid="location-settings-tab-basic-information"]',
  tabLocalInformation: '[data-testid="location-settings-sub-tab-local-information"]',
  tabCurrency: '[data-testid="location-settings-sub-tab-currency"]',
  tabPricing: '[data-testid="location-settings-sub-tab-pricing"]',

  btnSave: '[data-testid="location-settings-btn-save"]',

  // This label opens the Pay To List dialog, but its `for=` points at a disabled input, so a plain
  // click is blocked — the page object dispatches or forces the click instead.
  lblPayToAddress: 'label:has-text("Pay To Address")',
  dlgPayToList: '[role="dialog"]:has-text("Pay To List")',
  // The dialog's 5 filter inputs have no stable CSS attribute, so they are absent here — the page
  // object reaches them by accessible name instead.
  btnPTLSearch: '[role="dialog"]:has-text("Pay To List") button:has-text("Search")',
  btnPTLReset: '[role="dialog"]:has-text("Pay To List") button:has-text("Reset")',
  btnPTLSelect: '[role="dialog"]:has-text("Pay To List") button:text-is("Select")',
  btnPTLCancel: '[role="dialog"]:has-text("Pay To List") button:has-text("Cancel")',
  btnPTLClose: '[role="dialog"]:has-text("Pay To List") button:has-text("Close")',
  tblPTLResults: '[role="dialog"]:has-text("Pay To List") table',
  chkPTLRowFirst: '[role="dialog"]:has-text("Pay To List") tbody tr:first-child td:first-child button[role="checkbox"]',
} as const;
