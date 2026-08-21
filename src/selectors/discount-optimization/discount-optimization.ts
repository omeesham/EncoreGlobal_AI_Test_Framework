/**
 * Selectors for the Discount Optimization setup page.
 *
 * Page: Location Settings → Discount Optimization
 * Route: `/navigator/locations/{office}/settings/discount-optimization-settings`
 *
 * The page has two tabs:
 *   Tab 1 — "Discount Optimization" — editable locations grid (2154 rows, no pagination)
 *   Tab 2 — "Special Rate Exemptions by Service Type" — editable service-type grid
 *
 * Critical facts affecting selector use:
 *
 * 1. ONLY ONE `data-testid` exists on this entire surface:
 *    `discount-optimization-settings-table-container`. Every other anchor must use
 *    accessible role + name, `aria-label`, or placeholder text.
 *
 * 2. Tab DOM ids are auto-generated Radix ids (e.g. `radix-_r_v_-trigger-…`) whose
 *    middle segment changes between renders. NEVER reference a `radix-*` id — select
 *    tabs by `[role="tab"]` + visible text only.
 *
 * 3. Per-row controls carry the location name in their `aria-label`. Row lookup is
 *    content-anchored (by location name), never by index.
 *
 * 4. The grid container (`tblContainer`) exists BEFORE data arrives. Waiting on its
 *    presence alone is the mistake that produced three false "grid is empty" findings.
 *    The ready-gate must wait for a non-zero row count.
 */

// ---------------------------------------------------------------- tab navigation

/**
 * Tab 1 trigger — "Discount Optimization".
 *
 * Uses :has-text (contains) rather than :text-is (exact) because the tab element
 * may contain additional child nodes (e.g. a badge or icon span) whose textContent
 * would cause an exact-match to silently never resolve. The text fragment
 * "Discount Optimization" is unique on this page.
 */
export const TAB_LOCATIONS = '[role="tab"]:has-text("Discount Optimization")';

/**
 * Tab 2 trigger — "Special Rate Exemptions by Service Type".
 *
 * Uses :has-text (contains) rather than :text-is (exact) because the tab element
 * may contain additional child nodes (e.g. a badge or icon span) whose textContent
 * would cause an exact-match to silently never resolve. The text fragment
 * "Special Rate Exemptions by Service Type" is unique on this page.
 */
export const TAB_EXEMPTIONS = '[role="tab"]:has-text("Special Rate Exemptions by Service Type")';

/** The tab list container. Waiting on this confirms the tab chrome is mounted. */
export const TAB_LIST = '[role="tablist"]';

// ---------------------------------------------------------------- tab 1 — grid (the ONLY testid on the page)

/**
 * The single `data-testid` on this entire surface.
 * The container is present BEFORE data arrives — do not use it as the ready-gate.
 * Use a non-zero row-count condition instead.
 */
export const TBL_CONTAINER = '[data-testid="discount-optimization-settings-table-container"]';

/** Tab 1 content panel — scoped to the container testid so it survives re-renders. */
export const PANEL_LOCATIONS = `[role="tabpanel"]:has(${TBL_CONTAINER})`;

/** Body rows inside the Tab 1 grid. Scoped to testid to avoid page-chrome contamination. */
export const ROWS_TAB1 = `${TBL_CONTAINER} tbody tr`;

/** Column header cells in Tab 1. */
export const COL_HEADERS_TAB1 = `${TBL_CONTAINER} thead th`;

/** Tab 1 Save button. Disabled at rest; enabled when a change is pending. */
export const BTN_SAVE_TAB1 = `${PANEL_LOCATIONS} button:text-is("Save")`;

/** Tab 1 Add button. Always enabled. */
export const BTN_ADD = `${PANEL_LOCATIONS} button:text-is("Add")`;

/** Tab 1 search input. Anchored by placeholder — the only input on this panel. */
export const TXT_SEARCH_TAB1 = `input[placeholder="Search by location number or location name"]`;

// ---------------------------------------------------------------- tab 1 — sort triggers (header cells)
//
// The live DOM exposes no dedicated sort button or data-testid for sorting — the only sort
// trigger, if the column sorts at all, is the header cell (`th`) itself. Whether a header
// click actually reorders rows has NOT been confirmed on this surface. Any spec asserting
// sort behaviour MUST assert that the row order changed after the click, not merely that the
// header exists or that the click did not throw.

/** Header cell for the ID column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_ID = `${TBL_CONTAINER} thead th:has-text("ID")`;

/** Header cell for the Location Name column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_NAME = `${TBL_CONTAINER} thead th:has-text("Location Name")`;

/** Header cell for the Allow Special Rate column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_DISCOUNT = `${TBL_CONTAINER} thead th:has-text("Allow Special Rate")`;

/** Header cell for the Special Rate Start Date column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_START = `${TBL_CONTAINER} thead th:has-text("Special Rate Start Date")`;

// ---------------------------------------------------------------- tab 1 — per-row controls (content-anchored)

/**
 * Per-row Remove button. Anchored by `aria-label="Remove <locationName>"`.
 * Use the exact Location Name string from the row cell.
 */
export const btnRemove = (locationName: string): string =>
  `button[aria-label="Remove ${locationName}"]`;

/**
 * Per-row Allow Special Rate toggle. Anchored by `aria-label`.
 * Read state via `aria-checked` when present; fall back to the button's `Yes`/`No` text content.
 */
export const btnToggleDiscount = (locationName: string): string =>
  `button[aria-label="Allow Special Rate for ${locationName}"]`;

/**
 * Per-row Special Rate Start Date input, scoped to a `tr`.
 * Call `.locator(inpDate())` on the row locator, not on the page.
 */
export const INP_DATE = `input[aria-label="Select date"]`;

/** Per-row calendar opener button. Scope to the row's `tr`. */
export const BTN_CALENDAR = `button[aria-label="Open calendar"]`;

// ---------------------------------------------------------------- tab 2 — Special Rate Exemptions by Service Type

/**
 * Tab 2 content panel — the tabpanel that contains the "Search by service type" input.
 *
 * This anchors the selector to Tab 2's own content rather than relying on `:visible`,
 * which would match Tab 1's panel during the tab-switch transition and cause the row-count
 * polling in `switchTab` to resolve against Tab 1's 2154 rows before Tab 2 has loaded.
 */
export const PANEL_EXEMPTIONS = `[role="tabpanel"]:has(input[placeholder="Search by service type"])`;

/** Tab 2 search input. */
export const TXT_SEARCH_TAB2 = `input[placeholder="Search by service type"]`;

/** Tab 2 Cancel button. Disabled at rest; enabled when a change is pending. */
export const BTN_CANCEL_TAB2 = `button:text-is("Cancel")`;

/** Tab 2 Save button. */
export const BTN_SAVE_TAB2 = `button:text-is("Save")`;

/** Body rows inside the Tab 2 grid, scoped to the visible panel. */
export const ROWS_TAB2 = `${PANEL_EXEMPTIONS} tbody tr`;

/** Column headers inside the Tab 2 grid. */
export const COL_HEADERS_TAB2 = `${PANEL_EXEMPTIONS} thead th`;

/**
 * Per-row Exempt checkbox in Tab 2.
 * Radix checkboxes carry `[role="checkbox"]` and `aria-checked`.
 * Anchored by aria-label containing the service type name.
 */
export const chkExempt = (serviceTypeName: string): string =>
  `[role="checkbox"][aria-label*="${serviceTypeName}"]`;

// ---- Change Local Office drawer ----

/**
 * The aside element that houses the Change Local Office drawer.
 * Tab 1's Add button opens this panel on the right side of the page.
 * It is an aside, not a [role="dialog"].
 */
export const DRAWER_CONTAINER = 'aside';

/**
 * The "Select a Location" launcher button inside the drawer.
 * Clicking this opens the nested location picker.
 * On the current office the picker contains no selectable rows — there is nothing to pick.
 */
export const BTN_SELECT_LOCATION = '#discount-optimization-location';

/**
 * The Cancel button scoped to the drawer container.
 * Scoped under DRAWER_CONTAINER to avoid matching Tab 2's Cancel button.
 */
export const BTN_DRAWER_CANCEL = `${DRAWER_CONTAINER} button:text-is("Cancel")`;

/**
 * The Update (confirm) button scoped to the drawer container.
 * Disabled when the current office is already the selected location —
 * the app disables confirm when no change has been made.
 */
export const BTN_DRAWER_UPDATE = `${DRAWER_CONTAINER} button:text-is("Update")`;
