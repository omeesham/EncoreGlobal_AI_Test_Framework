export const CorporatePricingOverrideSelectors = {
  ovrHeading: 'h1:text-is("Product Group Override")',

  ovrTabEquipment: '[role="tab"]:has-text("Equipment")',
  ovrTabLabor: '[role="tab"]:has-text("Labor")',

  ovrSelectLocationText: 'text=Select a location',
  // Persistent trigger that opens the Change Local Office picker dialog in both states:
  // before any location is selected (shows "Change Local Office Select a location") and
  // after a location is loaded (shows "Change Local Office <location name>").
  // Verified: trigger text 'Change Local Office' is present in both states (ref=e173).
  ovrChangeLocationTrigger: 'text=Change Local Office',
  ovrLocationPickerSearch: 'input[placeholder="Search by Location Name, Number"]',
  ovrLocationPickerRowAny: '[role="dialog"] tbody tr',
  ovrLocationPickerRowCheckbox: '[role="checkbox"]',
  ovrLocationPickerSelect: 'button:text-is("Select")',
  ovrLocationPickerCancel: 'button:text-is("Cancel")',
  ovrLocationPickerClose: 'button:text-is("Close")',

  ovrCurrencyDropdown: 'button[role="combobox"]:has-text("ALL")',
  ovrActiveOnlyCheckbox: 'div:has(> *:text-is("Active only")) [role="checkbox"]',
  ovrFilterInput: 'input[placeholder="Filter Product Groups Override..."]',

  // NOTE: use `:has-text` (substring), NOT `:text-is` (exact) — each grid `<th>` nests a "Resize column"
  // button, so the header's full text is e.g. "Override Price Resize column price"; an exact match misses it.
  ovrGrid: 'table:has(th:has-text("Override Price"))',
  ovrGridRowAny: 'table:has(th:has-text("Override Price")) tbody tr',
  ovrColHeaderAny: 'table:has(th:has-text("Override Price")) th',

  ovrCellOverridePrice: 'td:nth-child(6) [role="button"]',
  ovrCellMaxDiscount: 'td:nth-child(7) [role="button"]',
  ovrCellActiveCheckbox: 'td:nth-child(8) [role="checkbox"]',

  ovrBtnSave: 'button:text-is("Save")',
  ovrBtnExport: 'button:text-is("Export")',
  ovrBtnImport: 'button:text-is("Import")',
  // sr-only icon button (label in visually-hidden span, not text node) — :text-is won't resolve; anchor on aria-label.
  ovrBtnGridOptions: 'button[aria-label="Grid Options"]',

  ovrRowsPerPage: 'button[role="combobox"]:has-text("20")',
  ovrNoResults: 'text=No results.',
  ovrItemsFound: 'text=/\\d[\\d,]*\\s+items found/',

  // Live finding (2026-06-09): the dialog is `<div role="alertdialog">` but Playwright's
  // `getByRole('alertdialog')` does NOT match it (shadow/portal-nested → excluded from the a11y-role
  // engine), and its buttons carry no computed accessible NAME. Target via the CSS attribute selector
  // + button TEXT (NOT getByRole, NOT the base `confirmSaveDialogIfPresent` which is getByRole-based).
  ovrSaveDialog: '[role="alertdialog"]',
  ovrSaveDialogConfirm: '[role="alertdialog"] button:text-is("Save")',
  ovrSaveDialogCancel: '[role="alertdialog"] button:text-is("Cancel")',

  ovrNavFromSearch: 'button:has-text("Pricing Override")',

  ovrGridOptionsMenuItem: '[role="menuitemcheckbox"]',
  ovrGridOptionsReset: 'text=/reset to default/i',

  ovrImportDialog: '[role="dialog"]:has-text("Import All Pricing Overrides")',
  ovrImportFileInput: 'input[type="file"]',
  ovrImportCancel: '[role="dialog"] button:text-is("Cancel")',
  ovrImportClose: '[role="dialog"] button:text-is("Close")',

  // Import upload dialog controls (live-verified 2026-07-23, office 4107). The Override import has a
  // MANUAL Upload button that stays disabled until a file is attached — unlike the auto-submit Location
  // Pricing import. The app exposes stable testids for the file input and the Upload/Cancel buttons;
  // these are preferred over CSS for stability.
  ovrImportUploadInput: '[data-testid="pg-override-upload-dialog-file-input"]',
  ovrImportUploadBtn: '[data-testid="pg-override-upload-dialog-upload"]',
  ovrImportUploadCancel: '[data-testid="pg-override-upload-dialog-cancel"]',
  // Import rejection surfaces as an ARIA alert (toast). Two distinct messages: a per-row
  // "Error Row#:N, Msg: ..." for a required-field/malformed failure, and "Please check the upload file
  // format." for an empty/unparseable file.
  ovrImportAlert: '[role="alert"]',
  ovrImportNoFileText: 'text=No file selected',

  ovrLocationModalDialog: '[role="dialog"]',

  // Grid pagination controls — icon buttons identified by aria-label (verified live 2026-07-20).
  ovrPageBtnFirst: 'button[aria-label="Go to first page"]',
  ovrPageBtnPrevious: 'button[aria-label="Go to previous page"]',
  ovrPageBtnNext: 'button[aria-label="Go to next page"]',
  ovrPageBtnLast: 'button[aria-label="Go to last page"]',

  // Toggles its own aria-label between the two values below while collapsing nothing, so BOTH labels
  // must be matched to locate the control in either state.
  ovrCollapseSearchPanel: 'button[aria-label="Collapse search panel"], button[aria-label="Expand search panel"]',

  // Unsaved-changes guard dialog (fires on in-app navigation away from a dirty grid). Same
  // alertdialog CSS-selector caveat as the save dialog: role-based lookup does not match it, and a
  // second alertdialog ("Save Changes") exists on this page — scope by the dialog's own title text.
  ovrUnsavedDialog: '[role="alertdialog"]:has-text("Unsaved changes")',
  ovrUnsavedDialogStay: '[role="alertdialog"]:has-text("Unsaved changes") button:text-is("Stay")',
  ovrUnsavedDialogDiscard: '[role="alertdialog"]:has-text("Unsaved changes") button:text-is("Discard")',

  // Currency-gated Product Group picker (add-override affordance, verified live 2026-07-20).
  // Picker rows are the only draggable <tr> elements on the page (grid header cells are draggable
  // <th> column-reorder handles — excluded by the tr scoping).
  ovrPickerSearchInput: 'input[placeholder="Search product groups..."]',
  ovrPickerDraggableRow: 'tr[draggable="true"]',

  // Active filter checkbox inside the Change Local Office picker dialog.
  // This is the first [role="checkbox"] in the dialog, appearing above the search textbox and the
  // table rows. The per-row selection checkboxes are inside tbody — using .first() in the page object selects the filter.
  ovrLocationPickerActiveCheckbox: '[role="dialog"]:has([data-testid="location-settings-modal-change-local-office-input-search"]) [role="checkbox"]',

  // Column sort dropdown menu items (Radix dropdown, not header-click toggle — verified 2026-07-17).
  ovrSortMenuItemAsc: 'role=menuitem[name="Sort ascending"]',
  ovrSortMenuItemDesc: 'role=menuitem[name="Sort descending"]',
} as const;
