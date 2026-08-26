/**
 * Selectors for the Service Charge Text setup page.
 *
 * Page: Location Settings -> Service Charge Text (`/settings/service-charge-text`)
 *
 * The page shows a grid of service charge wording, one row per language entry, with three
 * editable text columns, a rich text column, a page level language filter, an add row control
 * and a single Save button.
 *
 * Two things about this page are easy to get wrong:
 *
 * 1. The grid renders a loading placeholder before the real table appears. Always wait for
 *    `table` below before reading anything, otherwise the placeholder is read instead.
 * 2. Each row contains BOTH a custom language control (a button that opens a list) and a plain
 *    browser dropdown. They are separate elements. Use `rowLanguageTrigger` — the plain dropdown
 *    is not the control the page actually drives.
 */
export const serviceChargeText = {
  /** The grid itself. Waiting on this is how you know the real page has finished loading. */
  table: '[data-testid="service-charge-text-table"]',

  /** Page level Save. Enabled only when every required field is filled and no name is duplicated. */
  save: '[data-testid="service-charge-text-save"]',

  /** Page level language filter. Opens a list of five options including All. */
  languageFilterTrigger: '[data-testid="service-charge-text-language-filter-trigger"]',

  /** Adds an empty row at the end of the grid. */
  addRow: '[data-testid="service-charge-text-add-row"]',

  /** Per row language control. This is a button that opens a list, not a plain dropdown. */
  rowLanguageTrigger: (row: number) => `[data-testid="service-charge-text-language-trigger-${row}"]`,

  /** Per row Service Charge Name. Required, and must be unique within a language. */
  rowName: (row: number) => `[data-testid="service-charge-text-name-${row}"]`,

  /** Per row Service Charge Display Name. Required. */
  rowDisplayName: (row: number) => `[data-testid="service-charge-text-display-name-${row}"]`,

  /** Per row Report Column Name. Required. */
  rowReportColumn: (row: number) => `[data-testid="service-charge-text-report-column-${row}"]`,

  /** Per row Service Charge Text cell. Clicking it loads that row into the rich text editor. */
  rowHtmlCell: (row: number) => `[data-testid="service-charge-text-html-cell-${row}-htmlDisplayText"]`,

  /** The editable area of the rich text editor. It is a normal editable region, not a framed editor. */
  editorContent: '[data-testid="rte-content"]',

  /** Outer wrapper of the rich text editor panel. */
  editorContainer: '[data-testid="rte-container"]',

  /** Matches every Service Charge Name cell, for counting rows or scanning values. */
  allNames: '[data-testid^="service-charge-text-name-"]',

  /** Data rows inside the grid body. */
  bodyRows: '[data-testid="service-charge-text-table"] tbody tr',

  /** Column headers. */
  headers: '[data-testid="service-charge-text-table"] thead th',
} as const;
