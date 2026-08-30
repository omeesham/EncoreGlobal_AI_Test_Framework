export const CorporatePricingSearchSelectors = {
  hdgCorporatePricing: 'h1:text-is("Corporate Pricing")',

  txtFilterPricebook: 'input[placeholder="Enter name"]',
  txtFilterStrategy: 'input[placeholder="Enter strategy"]',

  drpFilterLocation: 'button[role="combobox"]:has-text("All Locations")',
  drpFilterCurrency: 'button[role="combobox"]:has-text("All Currencies")',

  chkFilterIsInternal: 'label:has-text("Is Internal") [role="checkbox"], div:has(> *:text-is("Is Internal")) [role="checkbox"]',
  chkFilterIsLabor: 'div:has(> *:text-is("Is Labor")) [role="checkbox"]',
  chkFilterActiveOnly: 'div:has(> *:text-is("Active Only")) [role="checkbox"]',

  btnSearch: 'button:text-is("Search")',
  btnReset: 'button:text-is("Reset")',

  btnNew: 'button:text-is("New")',
  mnuNewEquipmentPricing: '[role="menuitem"]:text-is("Equipment Pricing")',
  mnuNewLaborPricing: '[role="menuitem"]:text-is("Labor Pricing")',
  btnPricingOverride: 'button:text-is("Pricing Override")',
  btnLocPricingExport: 'button:text-is("Loc Pricing Export")',
  btnLocPricingImport: 'button:text-is("Loc Pricing Import")',
  btnExport: 'button:text-is("Export")',
  btnImport: 'button:text-is("Import")',
  // sr-only icon button — :text-is("Grid Options") matches no visible text; anchor on aria-label.
  btnGridOptions: 'button[aria-label="Grid Options"]',

  mnuToolbarVariant: '[role="menuitem"]',
  mnuGridColumn: '[role="menuitemcheckbox"]',
  // matches role="dialog" or "alertdialog" (portaled dialogs vary); callers scope by prompt text to disambiguate.
  dlgImport: '[role="dialog"], [role="alertdialog"]',
  btnImportBrowse: 'button:text-is("Browse")',
  btnImportUpload: 'button:text-is("Upload")',
  inputImportFile: 'input[type="file"]',

  // base role selector; scoped by unique prompt text in the PO to avoid collision with import dialogs.
  dlgExport: '[role="dialog"]',
  cmbExportField: 'button[role="combobox"]',
  optExportListItem: '[role="option"]',

  // base role selector; scoped by prompt AND "Import" title in the PO — Export dialog carries identical prompt.
  dlgImportAll: '[role="dialog"]',
  cmbImportAllField: 'button[role="combobox"]',
  optImportAllListItem: '[role="option"]',
  dlgPublishItems: '[role="dialog"]',
  chkPublishRow: '[role="checkbox"]',
  btnPublish: 'button:text-is("Publish")',

  // Tag selectors, not roles: the shadcn/TanStack DataTable exposes no
  // role="grid"/"row"/"columnheader", so role-based selectors resolve to nothing.
  gridResults: 'table',
  rowGridAny: 'tbody tr',
  colHeaderAny: 'th',
  colResizeHandleAny: 'button[aria-label^="Resize column "]',
  rowNameButton: 'tbody tr td button.cursor-pointer',
  cellBooleanTrue: 'td span.text-primary',
  lblItemsFound: 'text=/\\d[\\d,]*\\s+items found/',
  lblNoResults: 'text="No results."',

  btnPageFirst: 'button[aria-label="Go to first page"]',
  btnPagePrev: 'button[aria-label="Go to previous page"]',
  btnPageNext: 'button[aria-label="Go to next page"]',
  btnPageLast: 'button[aria-label="Go to last page"]',
  // only combobox showing a pure digit; location/currency filters show words — bare role selector matches those too.
  drpPageSizeRole: '[role="combobox"]',
} as const;
