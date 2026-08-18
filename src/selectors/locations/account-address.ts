export const SetupAccountAddressSelectors = {
  tabAccountAndAddress: '[data-testid="location-settings-sub-tab-account-and-address"]',
  pnlAccountAndAddress: '[data-testid="location-settings-sub-tab-content-account-and-address"]',

  btnAccName: '[data-testid="location-settings-btn-lookup-venue"]',
  txtAccVenueName: '[data-testid="location-settings-input-venue-name"]',
  btnAccVenueAddress: '[data-testid="location-settings-btn-venue-address"]',
  txtAccPhone1: '[data-testid="location-settings-input-contact-phone-1"]',
  txtAccPhone2: '[data-testid="location-settings-input-contact-phone-2"]',

  btnSaveAccountAddress: '[data-testid="location-settings-btn-save"]',

  btnAccMasterAddress: '[data-testid="location-settings-btn-master-address"]',

  dlgAccountList: '[data-testid="location-settings-modal-account-list"]',
  txtAccListAccountNumber: '[data-testid="location-settings-input-account-number"]',
  txtAccListAccountName: '[data-testid="location-settings-input-account-name"]',
  txtAccListAddress: '[data-testid="location-settings-input-account-address"]',
  txtAccListCity: '[data-testid="location-settings-input-account-city"]',
  drpAccListState: '[data-testid="location-settings-select-account-state"]',
  drpAccListCountry: '[data-testid="location-settings-select-account-country"]',
  btnAccListSearch: '[data-testid="location-settings-btn-search-account"]',
  btnAccListReset: '[data-testid="location-settings-btn-reset-account-search"]',
  btnAccListSelect: '[data-testid="location-settings-btn-select-account"]',
  btnAccListCancel: '[data-testid="location-settings-btn-cancel-account-search"]',
 // Modal container testid present; inner Close btn still text-scoped — defensively scoped inside container.
  btnAccListClose: '[data-testid="location-settings-modal-account-list"] button:has-text("Close")',
  chkAccListRowSelect: '[data-testid="location-settings-modal-account-list"] tbody tr:first-child td:first-child button[role="checkbox"]',
  tblAccListResults: '[data-testid="location-settings-modal-account-list"] table',

 // No dialog testids are rendered (only Radix internals present); match by role+text.
 // Switch to testids if the app adds them.
  dlgSelectAddress: '[role="dialog"]:has-text("Select Customer Address")',
  txtAddrSearch: '[role="dialog"]:has-text("Select Customer Address") input[placeholder="Search..."]',
  btnAddrSelect: '[role="dialog"]:has-text("Select Customer Address") button:has-text("Select")',
  btnAddrCancel: '[role="dialog"]:has-text("Select Customer Address") button:has-text("Cancel")',
  btnAddrSave: '[role="dialog"]:has-text("Select Customer Address") button:has-text("Save")',
  btnAddrClose: '[role="dialog"]:has-text("Select Customer Address") button:has-text("Close")',
  chkAddrRow: '[role="dialog"]:has-text("Select Customer Address") tbody tr:first-child td:first-child button[role="checkbox"]',
  tblAddrResults: '[role="dialog"]:has-text("Select Customer Address") table',
  lblAddrTotal: '[role="dialog"]:has-text("Select Customer Address") :text("Total Addresses")',

 // No container testid is rendered (only Radix internals present); match by role+text.
 // Switch to a testid if the app adds one.
  txtSaveChangesMessage: '[role="alertdialog"]:has-text("Save Changes") p',
} as const;
