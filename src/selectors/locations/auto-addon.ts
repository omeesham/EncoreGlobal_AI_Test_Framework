export const SetupAutoAddonSelectors = {
  tabAutoAddon: '[data-testid="location-settings-sub-tab-auto-add-on"]',

  contentAutoAddon: '[data-testid="location-settings-sub-tab-content-auto-add-on"]',
  formAutoAddon: '[data-testid="location-settings-form-auto-add-on"]',

  chkAutoAddonEncoreMusic: '[data-testid="location-settings-checkbox-auto-add-on-false_encore music"]',
  chkAutoAddonWirelessPresenter: '[data-testid="location-settings-checkbox-auto-add-on-false_wireless presenter"]',
  chkAutoAddonExpressContentDesignSession: '[data-testid="location-settings-checkbox-auto-add-on-false_express content design session"]',
  chkAutoAddonWordly: '[data-testid="location-settings-checkbox-auto-add-on-false_wordly"]',
  chkAutoAddonLabor: '[data-testid="location-settings-checkbox-auto-add-on-true_labor"]',

  chkAutoAddonAll: '[data-testid^="location-settings-checkbox-auto-add-on-"]',

  btnSaveChangesOk: '[role="alertdialog"]:has(h2:text-is("Save Changes")) button:has-text("Ok")',

 // This dialog uses Stay/Discard, not shared.ts's OK/Cancel; the key is prefixed to avoid
 // colliding with shared.ts dlgUnsavedChanges.
  autoAddonDlgUnsavedChanges: '[data-testid="location-settings-modal-unsaved-changes"]',
  btnUnsavedChangesStay: '[role="alertdialog"]:has(h2:text-is("Unsaved changes")) button:has-text("Stay")',
  btnUnsavedChangesDiscard: '[role="alertdialog"]:has(h2:text-is("Unsaved changes")) button:has-text("Discard")',
} as const;
