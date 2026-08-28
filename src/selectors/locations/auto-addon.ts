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

 /**
 * @where Setup > Location > Auto Add-On > Unsaved Changes dialog @el alertdialog @text "Unsaved changes" @keys unsaved changes dialog navigate away
 * NOTE: Auto Add-On uses Stay/Discard buttons (not OK/Cancel like shared.ts).
 * Prefixed to avoid collision with shared.ts dlgUnsavedChanges.
  */
  autoAddonDlgUnsavedChanges: '[data-testid="location-settings-modal-unsaved-changes"]',
  btnUnsavedChangesStay: '[role="alertdialog"]:has(h2:text-is("Unsaved changes")) button:has-text("Stay")',
  btnUnsavedChangesDiscard: '[role="alertdialog"]:has(h2:text-is("Unsaved changes")) button:has-text("Discard")',
} as const;
