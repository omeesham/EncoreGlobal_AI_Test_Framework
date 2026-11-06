export const SetupSharedSelectors = {
 // Role+text fallback: the error dialog renders no container testid.
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

 // Account menu in the sidebar footer. No testids; the trigger's label is the signed-in user's name,
 // so it is matched by structure. The Language item is matched by its submenu role, not its text,
 // because its label is itself translated ("Langue", "Idioma") once another locale is active.
  btnUserMenu: '[data-sidebar="footer"] button[data-slot="dropdown-menu-trigger"]',
  mnuLanguage: '[role="menu"] [role="menuitem"][aria-haspopup="menu"]',
} as const;
