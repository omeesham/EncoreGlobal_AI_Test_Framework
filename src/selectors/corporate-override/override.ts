export const CorporatePricingOverrideSelectors = {
  ovrHeading: 'h1:text-is("Product Group Override")',

  ovrTabEquipment: '[role="tab"]:has-text("Equipment")',
  ovrTabLabor: '[role="tab"]:has-text("Labor")',

  ovrSelectLocationText: 'text=Select a location',
  // Trigger text is present both before and after a location is selected, so it opens the picker in either state.
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

  // Use `:has-text`, NOT `:text-is` — each `<th>` nests a "Resize column" button, so exact text never matches.
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

  // Portal-nested, so getByRole('alertdialog') does not match and its buttons have no accessible name.
  // Must be targeted by CSS attribute + button text, not by role.
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

  // Unlike the auto-submit Location Pricing import, Upload here is manual and stays disabled until a file is attached.
  ovrImportUploadInput: '[data-testid="pg-override-upload-dialog-file-input"]',
  ovrImportUploadBtn: '[data-testid="pg-override-upload-dialog-upload"]',
  ovrImportUploadCancel: '[data-testid="pg-override-upload-dialog-cancel"]',
  // Import rejection surfaces as a toast: per-row "Error Row#:N, Msg: ..." for malformed rows,
  // "Please check the upload file format." for an empty/unparseable file.
  ovrImportAlert: '[role="alert"]',
  ovrImportNoFileText: 'text=No file selected',

  ovrLocationModalDialog: '[role="dialog"]',

  // Grid pagination controls — icon-only buttons, so aria-label is the only anchor.
  ovrPageBtnFirst: 'button[aria-label="Go to first page"]',
  ovrPageBtnPrevious: 'button[aria-label="Go to previous page"]',
  ovrPageBtnNext: 'button[aria-label="Go to next page"]',
  ovrPageBtnLast: 'button[aria-label="Go to last page"]',

  // Toggles its own aria-label between the two values below while collapsing nothing, so BOTH labels
  // must be matched to locate the control in either state.
  ovrCollapseSearchPanel: 'button[aria-label="Collapse search panel"], button[aria-label="Expand search panel"]',

  // Fires on in-app navigation away from a dirty grid. Role lookup fails as above, and a second
  // alertdialog ("Save Changes") exists on this page — hence scoping by title text.
  ovrUnsavedDialog: '[role="alertdialog"]:has-text("Unsaved changes")',
  ovrUnsavedDialogStay: '[role="alertdialog"]:has-text("Unsaved changes") button:text-is("Stay")',
  ovrUnsavedDialogDiscard: '[role="alertdialog"]:has-text("Unsaved changes") button:text-is("Discard")',

  // Currency-gated Product Group picker. Its rows are the only draggable <tr> on the page — the
  // draggable column-reorder handles are <th>, excluded by the tr scoping.
  ovrPickerSearchInput: 'input[placeholder="Search product groups..."]',
  ovrPickerDraggableRow: 'tr[draggable="true"]',

  // Active filter checkbox in the location picker: the first [role="checkbox"] in the dialog, above
  // the search box. Per-row checkboxes live in tbody, so .first() reliably picks the filter.
  ovrLocationPickerActiveCheckbox: '[role="dialog"]:has([data-testid="location-settings-modal-change-local-office-input-search"]) [role="checkbox"]',

  // Sorting is a Radix dropdown menu here, not a header-click toggle.
  ovrSortMenuItemAsc: 'role=menuitem[name="Sort ascending"]',
  ovrSortMenuItemDesc: 'role=menuitem[name="Sort descending"]',
} as const;
