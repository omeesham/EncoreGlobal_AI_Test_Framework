// Selectors for Tax → Order Origin Tax (/locations/{office}/taxes/order-origin-tax).
// The page carries data-testids only on the search buttons and the shared Change Local Office
// dialog; everything else is anchored on authored ids, aria-labels and roles, never on
// Radix-generated ids (radix-_r_N_), which change per render.
// Both tabs swap the whole page content and reuse the same ids, so one set of selectors serves both.

export { SetupSharedSetupLocationsSelectors as LOCATION_DIALOG } from '../locations/shared-setup-locations';

// ---------------------------------------------------------------- page header and tabs

export const HEADER_TITLE = 'h1:text-is("Order Origin Tax")';

export const BTN_INFO = 'button[aria-label="More information"]';

/** The tooltip's accessible copy; the visible content repeats the same text. */
export const TOOLTIP = '[role="tooltip"]';

// ---------------------------------------------------------------- search criteria

export const BTN_LOCATION = '#order-origin-tax-location';

export const DRP_TAX_TYPE = '#order-origin-tax-tax-type';

/** Basic Information: single Effective Date input. */
export const TXT_EFFECTIVE_DATE = 'main form input[aria-label="Select date"]';

/** History: Date Range popover trigger, e.g. "10/23/2026 - 10/23/2026". */
export const BTN_DATE_RANGE = 'main #date';

export const CHK_NOT_EQUAL_ZERO = '[data-testid="e2e-checkbox"]';

export const BTN_SEARCH = '[data-testid="e2e-search-button"]';

export const BTN_RESET = '[data-testid="e2e-reset-button"]';

export const BTN_COLLAPSE_FILTERS = 'main button[aria-label="Collapse filters"]';

export const BTN_EXPAND_FILTERS = 'main button[aria-label="Expand filters"]';

// ---------------------------------------------------------------- results grid

export const RECORD_COUNT = 'main :text-matches("records? found")';

export const BTN_SAVE = 'main button:text-is("Save")';

export const BTN_GRID_OPTIONS = 'main button[aria-label="Grid Options"]';

export const HEADERS = 'main thead th';

/** Header button inside a th — opens Sort ascending / Sort descending / Hide column. */
export const HEADER_MENU_TRIGGER = 'button[data-slot="dropdown-menu-trigger"]';

/** Data rows; the virtual list also renders one-cell spacer rows, which this leaves out. */
export const ROWS = 'main tbody tr:has(td + td)';

export const SKELETON = 'main [data-slot="skeleton"]';

/** Per-row validation marker in the Effective Date cell; its aria-label carries the message. */
export const ROW_ALERT = '[role="alert"]';

export const BTN_OPEN_CALENDAR = 'button[aria-label="Open calendar"]';

export const POPOVER = '[data-slot="popover-content"]';

/** A day in an open calendar, by its data-day attribute (M/D/YYYY, no leading zeros). */
export const calendarDay = (mdyyyy: string): string => `${POPOVER} button[data-day="${mdyyyy}"]`;

export const BTN_PREVIOUS_MONTH = `${POPOVER} button[aria-label="Go to the Previous Month"]`;

export const BTN_NEXT_MONTH = `${POPOVER} button[aria-label="Go to the Next Month"]`;

/** Month grids of an open calendar; aria-label is e.g. "October 2026". */
export const CALENDAR_MONTH = `${POPOVER} [role="grid"]`;

// ---------------------------------------------------------------- History pagination

export const TXT_PAGE_NUMBER = 'main input[aria-label="Current page number"]';

export const BTN_NEXT_PAGE = 'main button[aria-label="Go to next page"]';

// ---------------------------------------------------------------- menus, dialogs, toasts

export const MENU = '[role="menu"]';

export const MENU_ITEM = '[role="menu"] [role="menuitem"]';

export const MENU_CHECKBOX = '[role="menu"] [role="menuitemcheckbox"]';

export const DLG_UNSAVED = '[role="alertdialog"]:has-text("Unsaved changes")';

export const BTN_DLG_STAY = `${DLG_UNSAVED} button:text-is("Stay")`;

export const BTN_DLG_DISCARD = `${DLG_UNSAVED} button:text-is("Discard")`;

export const TOAST = '[data-sonner-toast]';

// ---------------------------------------------------------------- sidebar

/**
 * Sidebar menu buttons; Tax is picked by its exact label (the label sits in a child span). Its
 * entries are menu items, rendered only while the menu is open.
 */
export const SIDEBAR_MENU_BUTTON = 'button[data-sidebar="menu-button"]';

export const SIDEBAR_TAX_LABEL = /^Tax$/;

export const sidebarOrderOriginTaxFor = (officeNo: string): string =>
  `[role="menu"] a[href$="/locations/${officeNo}/taxes/order-origin-tax"]`;

export const SIDEBAR_HOME = 'a[href$="/home"]';
