export const CorporatePricingOverrideSelectors = {
  ovrHeading: 'h1:text-is("Product Group Override")',

  ovrTabEquipment: '[role="tab"]:has-text("Equipment")',
  ovrTabLabor: '[role="tab"]:has-text("Labor")',

  ovrSelectLocationText: 'text=Select a location',
  ovrLocationPickerSearch: 'input[placeholder="Search by Location Name, Number"]',
  ovrLocationPickerRowAny: 'tbody tr',
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

  ovrLocationModalDialog: '[role="dialog"]',
} as const;
