// Selectors for Tax → Special Rate (/locations/{office}/taxes/special-rate), both tabs.
// The page carries data-testids only on Search and Reset; everything else is anchored on the authored
// filter ids, aria-labels and roles, never on Radix-generated ids (radix-_r_N_), which change per render.
import { Filter } from '../../data/taxes/special-rate';

export const HEADER_TITLE = 'h1:text-is("Special Rate")';

export const BTN_INFO = 'main button[aria-label="More information"]';

export const TOOLTIP = '[role="tooltip"]';


export const TAB_SELECTED = 'main [role="tab"][aria-selected="true"]';

// ---------------------------------------------------------------- search criteria

/** The filters have authored ids, the same on both tabs. */
export const FILTER: Record<Filter, string> = {
  state: '#special-rate-state',
  county: '#special-rate-county',
  city: '#special-rate-city',
  taxType: '#special-rate-tax-type',
  special: '#special-rate-special',
  taxable: '#special-rate-taxable',
};

/** Basic Information: the as-of Effective Date of the search panel (rows have their own date inputs). */
export const TXT_SEARCH_DATE = 'main form input[aria-label="Select date"]';

/** Special Rate History: the Date Range button; its text is "MM/DD/YYYY - MM/DD/YYYY". */
export const BTN_DATE_RANGE = 'main form button[aria-label="Open popover"]';

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

export const ROWS = 'main tbody tr:has(td + td)';

export const SKELETON = 'main [data-slot="skeleton"]';

/** Taxable and Special show Yes/No until the cell is clicked; then they hold this checkbox. */
export const CHECKBOX = '[role="checkbox"]';

/** With Special ticked, the rate of the row's own level (state, county or city) becomes this box. */
export const RATE_INPUT = 'input[type="number"]';

/** Per-row validation marker; its title carries the message. */
export const ROW_ALERT = '[role="alert"]';

export const BTN_OPEN_CALENDAR = 'button[aria-label="Open calendar"]';

export const POPOVER = '[data-slot="popover-content"]';

/** A month grid of an open calendar; aria-label is e.g. "November 2026". */
export const CALENDAR_MONTH = `${POPOVER} [role="grid"]`;

// ---------------------------------------------------------------- history paging

/** The rows-per-page box is the only combobox of the page without an authored id. */
export const DRP_PAGE_SIZE = 'main [role="combobox"]:not([id])';

export const TXT_PAGE_NUMBER = 'main input[aria-label="Current page number"]';

export const BTN_FIRST_PAGE = 'main button[aria-label="Go to first page"]';

export const BTN_PREV_PAGE = 'main button[aria-label="Go to previous page"]';

export const BTN_NEXT_PAGE = 'main button[aria-label="Go to next page"]';

export const BTN_LAST_PAGE = 'main button[aria-label="Go to last page"]';

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

export const sidebarPageFor = (officeNo: string): string => `[role="menu"] a[href$="/locations/${officeNo}/taxes/special-rate"]`;
