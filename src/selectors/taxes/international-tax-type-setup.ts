// Selectors for Tax → International Tax Type Setup (/locations/{office}/taxes/international-tax-type-setup).
// The page carries data-testids only on Search and Reset; everything else is anchored on the authored
// Country id, aria-labels and roles, never on Radix-generated ids (radix-_r_N_), which change per render.

export const HEADER_TITLE = 'h1:text-is("International Tax Type Setup")';

export const BTN_INFO = 'main button[aria-label="More information"]';

export const TOOLTIP = '[role="tooltip"]';

// ---------------------------------------------------------------- search criteria

export const DRP_COUNTRY = '#international-tax-type-setup-country';

export const TXT_SEARCH_DATE = 'main form input[aria-label="Select date"]';

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

/** A header's resize handle, e.g. aria-label "Resize column govTaxRegNumber". */
export const COLUMN_RESIZE = 'button[aria-label^="Resize column"]';

export const ROWS = 'main tbody tr:has(td + td)';

export const SKELETON = 'main [data-slot="skeleton"]';

/** A type cell shows the type as a button; clicking the cell turns it into this picker. */
export const TYPE_PICKER = 'button[role="combobox"]';

/** Per-row validation marker in the Effective Date cell; its title carries the message. */
export const ROW_ALERT = '[role="alert"]';

export const BTN_OPEN_CALENDAR = 'button[aria-label="Open calendar"]';

export const POPOVER = '[data-slot="popover-content"]';

/** The month grid of an open calendar; aria-label is e.g. "November 2026". */
export const CALENDAR_MONTH = `${POPOVER} [role="grid"]`;

// ---------------------------------------------------------------- menus, dialogs, toasts

export const OPTION = '[role="option"]';

export const LISTBOX = '[role="listbox"]';

export const MENU = '[role="menu"]';

export const MENU_ITEM = '[role="menu"] [role="menuitem"]';

export const MENU_CHECKBOX = '[role="menu"] [role="menuitemcheckbox"]';

export const DLG_UNSAVED = '[role="alertdialog"]:has-text("Unsaved changes")';

export const BTN_DLG_STAY = `${DLG_UNSAVED} button:text-is("Stay")`;

export const BTN_DLG_DISCARD = `${DLG_UNSAVED} button:text-is("Discard")`;

export const TOAST = '[data-sonner-toast]';

// ---------------------------------------------------------------- sidebar

export const SIDEBAR_MENU_BUTTON = 'button[data-sidebar="menu-button"]';

export const SIDEBAR_TAX_LABEL = /^Tax$/;

export const sidebarPageFor = (officeNo: string): string =>
  `[role="menu"] a[href$="/locations/${officeNo}/taxes/international-tax-type-setup"]`;

export const SIDEBAR_HOME = 'a[href$="/home"]';
