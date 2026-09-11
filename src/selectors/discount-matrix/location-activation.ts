/**
 * Selectors for the Location Activation tab of the Discount Matrix page.
 *
 * The tab is a country-scoped location grid (columns Location, Workflow Start Date, Active)
 * with a search box, a record-count footer, and per-row editing. Data arrives ~43 seconds
 * after the tab is clicked (measured 2026-08-25): until then the grid paints textless
 * placeholder rows and the search box is disabled, so readiness must check that rendered
 * rows carry text — never the row count alone.
 *
 * The Active cell renders as a `Yes` / `No` label button that swaps to an inline checkbox
 * editor when clicked. `Save` / `Cancel` collide with other tabs — always resolve them
 * INSIDE the tab panel.
 */
export const locationActivation = {
  /** Search box — disabled while the grid is still loading, enabled once rows land. */
  inpSearch: 'input[placeholder^="Search by location number"]',

  /** Grid pieces, resolved within the tab panel. */
  gridTable: 'table',
  rowAny: 'tbody tr',
  colHeaderAny: 'th',

  /** Per-column resize handles in the header row. */
  btnResizeAny: 'button[aria-label^="Resize column"]',

  /** Footer text, e.g. `2041 matching locations`. */
  lblMatchCount: 'text=/[\\d,]+\\s+matching locations?/',

  /** The inline checkbox the Active cell swaps to while being edited. */
  chkActiveEditor: '[role="checkbox"]',

  /** Toolbar button names — resolve with getByRole inside the panel. */
  BTN_CANCEL: 'Cancel',
  BTN_SAVE: 'Save',
} as const;
