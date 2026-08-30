// Selectors for Location Settings → Discount Optimization. Only one data-testid exists here
// (the table container); everything else anchors on role, aria-label, or placeholder text.

// ---------------------------------------------------------------- tab navigation

// :has-text, not :text-is — the tab may wrap extra child nodes (badge/icon) that would make
// an exact match never resolve. Radix tab ids change between renders and must not be used.
export const TAB_LOCATIONS = '[role="tab"]:has-text("Discount Optimization")';

// :has-text, not :text-is — see TAB_LOCATIONS.
export const TAB_EXEMPTIONS = '[role="tab"]:has-text("Special Rate Exemptions by Service Type")';

/** The tab list container. Waiting on this confirms the tab chrome is mounted. */
export const TAB_LIST = '[role="tablist"]';

// ---------------------------------------------------------------- tab 1 — grid (the ONLY testid on the page)

// Present BEFORE data arrives — never use this as the ready-gate; wait on a non-zero row count.
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
// No sort button or testid exists; specs asserting sort must assert row order changed.

/** Header cell for the ID column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_ID = `${TBL_CONTAINER} thead th:has-text("ID")`;

/** Header cell for the Location Name column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_NAME = `${TBL_CONTAINER} thead th:has-text("Location Name")`;

/** Header cell for the Allow Special Rate column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_DISCOUNT = `${TBL_CONTAINER} thead th:has-text("Allow Special Rate")`;

/** Header cell for the Special Rate Start Date column. Clicking may trigger a sort; confirm row-order change in specs. */
export const TH_SORT_START = `${TBL_CONTAINER} thead th:has-text("Special Rate Start Date")`;

// ---------------------------------------------------------------- tab 1 — per-row controls (content-anchored)

/** Per-row Remove button; pass the exact Location Name string from the row cell. */
export const btnRemove = (locationName: string): string =>
  `button[aria-label="Remove ${locationName}"]`;

// Per-row Allow Special Rate toggle. Read state via `aria-checked` when present, else fall
// back to the button's `Yes`/`No` text.
export const btnToggleDiscount = (locationName: string): string =>
  `button[aria-label="Allow Special Rate for ${locationName}"]`;

/** Per-row Special Rate Start Date input — scope it to a row locator, never to the page. */
export const INP_DATE = `input[aria-label="Select date"]`;

/** Per-row calendar opener button. Scope to the row's `tr`. */
export const BTN_CALENDAR = `button[aria-label="Open calendar"]`;

// ---------------------------------------------------------------- tab 2 — Special Rate Exemptions by Service Type

// Anchored to Tab 2's own search input rather than `:visible`, which matches Tab 1's panel
// mid-transition and lets switchTab's row-count poll resolve against Tab 1's rows.
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

/** Per-row Exempt checkbox in Tab 2; state lives on `aria-checked`, not on text content. */
export const chkExempt = (serviceTypeName: string): string =>
  `[role="checkbox"][aria-label*="${serviceTypeName}"]`;

// ---- Change Local Office drawer ----

/** Change Local Office drawer opened by Tab 1's Add — an `aside`, not a `[role="dialog"]`. */
export const DRAWER_CONTAINER = 'aside';

// Opens the nested location picker. On offices tried so far the picker lists no selectable
// rows, so the Add flow cannot be completed end to end.
export const BTN_SELECT_LOCATION = '#discount-optimization-location';

/** Drawer Cancel — scoped to the drawer so it cannot match Tab 2's Cancel button. */
export const BTN_DRAWER_CANCEL = `${DRAWER_CONTAINER} button:text-is("Cancel")`;

/** Drawer Update (confirm) — disabled until the selected location actually changes. */
export const BTN_DRAWER_UPDATE = `${DRAWER_CONTAINER} button:text-is("Update")`;
