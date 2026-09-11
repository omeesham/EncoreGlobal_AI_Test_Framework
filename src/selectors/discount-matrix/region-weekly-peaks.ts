/**
 * Selectors for the Region Weekly Peaks tab of the Discount Matrix page.
 *
 * The tab holds a Year and a Region selector over a 52-week grid (columns Week, Start Date,
 * Non-Peak, Standard, Peak) and a five-button toolbar. The two selectors are the only
 * controls on the whole page with clean ids.
 *
 * Loading trap (measured 2026-08-25): at tab click the grid renders its full 52 rows as
 * placeholders with ZERO checkboxes and a footer of `Count: 0`; real data arrives ~40s later
 * (156 checkboxes, `Count: 52`). Row count is therefore useless as a ready signal — gate on
 * checkboxes existing and placeholders clearing.
 *
 * Toolbar names (`Save`, `Cancel`, `Export`, `Import`) collide with other tabs and with the
 * criteria bar — always resolve them INSIDE the owning tab panel.
 */
export const regionWeeklyPeaks = {
  /** Year selector (Radix combobox with a real id). */
  drpYear: '#region-weekly-peaks-year',

  /** Region selector (Radix combobox with a real id). 28 options as of 2026-08-25. */
  drpRegion: '#region-weekly-peaks-region',

  /** Grid pieces, resolved within the tab panel. */
  gridTable: 'table',
  rowAny: 'tbody tr',
  colHeaderAny: 'th',
  chkAny: '[role="checkbox"]',

  /** Footer count, e.g. `Count: 52`. Reads `Count: 0` for the entire loading window. */
  lblCount: 'text=/Count:\\s*\\d+/',

  /** Create Year window (opened by Add Year). Its controls sit disabled until the window
   *  finishes loading its own data — a tracked performance issue (NM-3074), so ready gates
   *  poll the year selector for enablement rather than assuming it. */
  drpCreateYear: '#region-weekly-peaks-create-year',
  chkInitPrevYear: '#region-weekly-peaks-init-prev-year',
  CREATE_YEAR_TITLE: 'Create Year',

  /** Toolbar button names — resolve with getByRole inside the panel. */
  BTN_ADD_YEAR: 'Add Year',
  BTN_EXPORT: 'Export',
  BTN_IMPORT: 'Import',
  BTN_CANCEL: 'Cancel',
  BTN_SAVE: 'Save',
} as const;
