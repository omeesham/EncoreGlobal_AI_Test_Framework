// Selectors for Setup → Multiday Pricing Rules (/locations/{office}/settings/multiday-pricing-rules).
// The screen carries NO data-testid at all (audited 2026-10-07) — every anchor below is a role, an
// aria-label the app writes on purpose, or a data-slot from the shared table component. The only
// author-written test id on the whole flow is the shared Unsaved-changes modal.

// ---------------------------------------------------------------- page chrome

export const HEADING = 'main h1:text-is("Multiday Pricing")';

/** The (i) icon next to the title — opens a tooltip. */
export const BTN_MORE_INFORMATION = 'main button[aria-label="More information"]';

// Only rendered when the user can edit (canEdit = NavRevenueMgmt && corporate office 1101). Absent,
// not disabled, on a read-only office — specs must assert count 0 there, not toBeDisabled().
export const BTN_SAVE = 'main button:text-is("Save")';

export const BTN_GRID_OPTIONS = 'main button:has-text("Grid Options")';

// ---------------------------------------------------------------- grid

export const GRID = 'main table[data-slot="table"]';

export const HEADER_CELLS = `${GRID} thead th`;

export const BODY_ROWS = `${GRID} tbody tr`;

// Loading placeholder (15 × 20 skeleton bars). Ready = zero skeletons AND (rows OR empty state).
export const GRID_SKELETON = 'main [data-slot="skeleton"]';

/**
 * Column resize handle. Its aria-label carries the column ID (serviceTypeName, day1 … day14), which is
 * the only column identifier in the DOM — td cells carry none, so day cells are addressed by finding
 * the header that owns this handle and taking the td at the same index. That survives column
 * hiding and reordering, which a fixed nth() would not.
 */
export const resizeHandle = (columnId: string): string =>
  `${GRID} thead button[aria-label="Resize column ${columnId}"]`;

// Row lookup by the exact service-type name. The name renders as a <span> in both modes (read-only
// cell, and the committed name of an editable row), so text-is on the span is exact and never
// matches a numeric day cell.
export const rowByServiceType = (name: string): string =>
  `${BODY_ROWS}:has(td span:text-is("${name.replace(/"/g, '\\"')}"))`;

// ---------------------------------------------------------------- edit mode (office 1101 only)

// The Service Type Name dropdown — only on the trailing add-row (and a just-selected new row).
// Row-relative on purpose: Playwright's filter({ has }) resolves inside the row, so a tbody-scoped
// selector there would match nothing. On a read-only office specs assert it resolves to zero.
export const CMB_SERVICE_TYPE = '[role="combobox"]';

export const LISTBOX_OPTION = '[role="option"]';

/** Scope on a row locator. Rendered only for rows that already have day values. */
export const BTN_ROW_DELETE = 'button[aria-label="Delete"]';

// The app's own sr-only error span; its id is error-indicator-{rowId}-{day}, so the input's
// aria-describedby points straight at it.
export const CELL_ERROR_TEXT = (describedById: string): string => `[id="${describedById}"]`;

// ---------------------------------------------------------------- dialogs, menus, toasts

/** Delete confirmation and Unsaved-changes both render as Radix alert dialogs. */
export const ALERT_DIALOG = '[role="alertdialog"]';

/** The single author-written test id on this flow (shared location-settings component). */
export const DLG_UNSAVED_CHANGES = '[data-testid="location-settings-modal-unsaved-changes"]';

/** Column header menu (Sort ascending / Sort descending / Hide column) and Grid Options menu. */
export const MENU = '[role="menu"]';

/** Sonner toasts; data-type is "success" or "error". */
export const TOAST = '[data-sonner-toast]';

export const TOAST_ERROR = '[data-sonner-toast][data-type="error"]';

export const TOAST_SUCCESS = '[data-sonner-toast][data-type="success"]';

// ---------------------------------------------------------------- navigation

/** Sidebar Setup group trigger. */
export const BTN_SIDEBAR_SETUP = 'button:has-text("Setup")';

// Office-qualified on purpose: right after load the sidebar renders this link as
// /locations//settings/multiday-pricing-rules (no office), which bounces to Home if clicked.
export const lnkMultidayPricingRules = (office: string): string =>
  `a[href$="/locations/${office}/settings/multiday-pricing-rules"]`;

export const LNK_SIDEBAR_HOME = 'a[href$="/home"]:has-text("Home")';
