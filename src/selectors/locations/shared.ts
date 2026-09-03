export const SetupSharedSelectors = {
 // No container testid is rendered for the error dialog. Forcing several save-error and offline
 // paths fired the error (console-confirmed) but never rendered a dialog or any error/alert testid,
 // so these are a role+text fallback — revisit when the app exposes a testid or documents the trigger.
  dlgErrorDialog: '[role="alertdialog"]:has-text("Error")',
  dlgErrorMessage: '[role="alertdialog"]:has-text("Error") p',
  btnErrorOk: '[role="alertdialog"]:has-text("Error") button:has-text("Ok")',

 // No container testid is rendered (only Radix internals present); match by role+text.
 // Switch to a testid if the app adds one.
  dlgSaveChanges: '[role="alertdialog"]:has-text("Save Changes")',
  btnSaveChangesCancel: '[role="alertdialog"]:has-text("Save Changes") button:has-text("Cancel")',
  btnSaveChangesConfirm: '[role="alertdialog"]:has-text("Save Changes") button:has-text("Ok")',

  dlgUnsavedChanges: '[data-testid="location-settings-modal-unsaved-changes"]',
 // Button text is "Discard", NOT "OK". Key name kept for usage stability;
 // semantically this is the "leave / discard changes" affirmative-leave button.
  btnUnsavedChangesOk: '[data-testid="location-settings-modal-unsaved-changes"] button:has-text("Discard")',
 // Button text is "Stay", NOT "Cancel". Key name kept for usage stability;
 // semantically this is the "stay / cancel-the-leave" button.
  btnUnsavedChangesCancel: '[data-testid="location-settings-modal-unsaved-changes"] button:has-text("Stay")',
} as const;
