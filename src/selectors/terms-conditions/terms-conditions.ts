// Location Settings -> Terms and Conditions (`/settings/terms-conditions`). Row testids are
// position-based and rows re-sort on edit — resolve rows by name, never by index alone.
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

  /** Bold button in the rich text editor toolbar. */
  rteBold: '[data-testid="rte-bold"]',
} as const;
