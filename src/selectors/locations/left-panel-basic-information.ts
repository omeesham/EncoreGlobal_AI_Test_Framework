export const SetupLeftPanelBasicInformationSelectors = {
  txtOffice: '[data-testid="location-settings-input-primary-location-no"]',
  txtLocalOffice: '[data-testid="location-settings-input-location-no"]',
  txtPayToAddress: '[data-testid="location-settings-input-pay-to-name"]',
  chkECommerceActive: '[data-testid="location-settings-checkbox-use-ecommerce"]',
  chkEnableProductionsOrders: '[data-testid="location-settings-checkbox-enable-productions-orders"]',
  /**
   * @where Setup > Location > Left Panel @el combobox @text "Line Of Business" @keys lob division disabled read-only
   * Read-only/disabled in EDIT mode by Encore design (NM-831 / NM-1140 — only selectable during
   * location CREATION). No data-testid → label-anchored.
   */
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

  // Pay To Address is a LAUNCHER: the field's <label> opens the "Pay To List" dialog, but a plain
  // Playwright .click() is BLOCKED (label `for=` points at the disabled input → "not enabled") →
  // page object drives the launcher via dispatchEvent('click') / click({force:true}).
  // No data-testid on the dialog; role+text fallback.
  /**
   * @where Setup > Location > Left Panel @el label @text "Pay To Address" @keys pay-to launcher dialog opener
   * Launcher affordance lives on the LABEL (React onClick). Drive via dispatched/forced click — a
   * standard click is blocked by the disabled-input `for=` association (`affordance: launcher → "Pay To List"`).
   */
  lblPayToAddress: 'label:has-text("Pay To Address")',
  dlgPayToList: '[role="dialog"]:has-text("Pay To List")',
  // The 5 filter inputs (Pay To ID / Pay To Name / Address / Phone / Fax) have no stable CSS
  // attribute; the page object locates them by accessible name: getByRole('textbox', { name }).
  // Not expressible as a CSS-string selector key here (getByRole is the only robust handle).
  btnPTLSearch: '[role="dialog"]:has-text("Pay To List") button:has-text("Search")',
  btnPTLReset: '[role="dialog"]:has-text("Pay To List") button:has-text("Reset")',
  btnPTLSelect: '[role="dialog"]:has-text("Pay To List") button:text-is("Select")',
  btnPTLCancel: '[role="dialog"]:has-text("Pay To List") button:has-text("Cancel")',
  btnPTLClose: '[role="dialog"]:has-text("Pay To List") button:has-text("Close")',
  tblPTLResults: '[role="dialog"]:has-text("Pay To List") table',
  chkPTLRowFirst: '[role="dialog"]:has-text("Pay To List") tbody tr:first-child td:first-child button[role="checkbox"]',
} as const;
