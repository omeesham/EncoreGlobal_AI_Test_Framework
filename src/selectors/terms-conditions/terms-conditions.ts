/**
 * Selectors for the Terms and Conditions setup page.
 *
 * Page: Location Settings -> Terms and Conditions (`/settings/terms-conditions`)
 *
 * The page shows a grid of T&C entries, one row per language entry, with a name field,
 * three rich-text columns (Left, Right, Bottom), a per-row language selector, a page-level
 * language filter, an add-row control and a single Save button.
 *
 * Key behaviours affecting selector use:
 *
 * 1. The editor panel is REBUILT on every cell switch — never cache a locator across cells.
 * 2. Row testids are position-based and rows re-sort on edit. Always look up rows by
 *    content (name text), never by index alone.
 * 3. ProseMirror ignores fill() — rich-text input must use real keyboard events.
 */
export const termsConditions = {
  /** The grid table container. Wait on this as the page-ready signal. */
  table: '[data-testid="terms-conditions-table"]',

  /** Page-level Save button. Disabled at rest; enabled on dirty + valid. */
  save: '[data-testid="terms-conditions-save"]',

  /** Page-level language filter (Radix combobox trigger). Default: US English. */
  languageFilterTrigger: '[data-testid="terms-conditions-language-filter-trigger"]',

  /** Adds an empty row at the bottom of the grid. */
  addRow: '[data-testid="terms-conditions-add-row"]',

  /** Per-row language Radix combobox trigger. 4 options (no All). */
  rowLanguageTrigger: (row: number) => `[data-testid="terms-conditions-language-trigger-${row}"]`,

  /** Per-row Terms & Conditions Name text input. Required; globally unique. */
  rowName: (row: number) => `[data-testid="terms-conditions-name-${row}"]`,

  /** Per-row Left Column cell (click-to-edit launcher for Tiptap RTE). */
  rowHtmlCellLeft: (row: number) => `[data-testid="terms-conditions-html-cell-${row}-text"]`,

  /** Per-row Right Column cell (click-to-edit launcher for Tiptap RTE). */
  rowHtmlCellRight: (row: number) => `[data-testid="terms-conditions-html-cell-${row}-text1"]`,

  /** Per-row Bottom Column cell (click-to-edit launcher for Tiptap RTE). */
  rowHtmlCellBottom: (row: number) => `[data-testid="terms-conditions-html-cell-${row}-text2"]`,

  /** The editable area of the rich text editor (Tiptap/ProseMirror contenteditable div). */
  editorContent: '[data-testid="rte-content"]',

  /** Outer wrapper of the rich text editor panel. */
  editorContainer: '[data-testid="rte-container"]',

  /** Scroll wrapper inside the editor panel. */
  editorScroll: '[data-testid="rte-content-scroll"]',

  /** Matches every Name input cell, for counting rows or scanning values. */
  allNames: '[data-testid^="terms-conditions-name-"]',

  /** Data rows inside the grid body. */
  bodyRows: '[data-testid="terms-conditions-table"] tbody tr',

  /** Column headers. */
  headers: '[data-testid="terms-conditions-table"] thead th',

  /**
   * Bold toolbar button in the rich text editor.
   * Captured live in August 2026; the terms and conditions toolbar was not covered in the
   * original selector pass — this selector was added separately when the toolbar was observed.
   */
  rteBold: '[data-testid="rte-bold"]',
} as const;
