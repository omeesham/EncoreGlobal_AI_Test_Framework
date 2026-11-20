// Selectors for Setup → Commissions → Tier/Flat (/locations/{office}/commissions/tiers), both tabs. Read from the
// live page on e2e (2026-11-12, user s-prd-clickauto). The toolbar, grid cells, Copy and Import dialogs carry
// data-testids; the search panel has authored ids and plain Search / Reset buttons. Radix ids (radix-_r_N_) are never
// used — they change per render.

export const HEADER_TITLE = 'h1:text-is("Commission Tier/Flat")';

export const BTN_INFO = 'main button[aria-label="More information"]';

export const TOOLTIP = '[role="tooltip"]';

export const TAB_SELECTED = 'main [role="tab"][aria-selected="true"]';

/** Shown above the tabs when the office has product-code commissions (NM-3384). */
export const PRODUCT_CODE_BANNER = 'main [role="alert"]:has-text("Product Code Commissions")';

// ---------------------------------------------------------------- search criteria

export const SEARCH_FORM = 'main form';

/** The search dropdowns have authored ids. */
export const FILTER = {
  Currency: '#commission-tiers-currency',
  'Business Type': '#commission-tiers-business-type',
} as const;

/** The block of the Local Office field: read-only text on a local office, a picker button on the corporate office. */
export const LOCAL_OFFICE_BLOCK = 'xpath=.//label[normalize-space(text())="Local Office"]/parent::*';

/** Read-only "Id - Name" text of a local office. */
export const LOCAL_OFFICE_TEXT = /^\s*\d{3,5}\s+-\s+\S/;

export const BTN_SEARCH = 'main form button:text-is("Search")';

export const BTN_RESET = 'main form button:text-is("Reset")';

export const BTN_COLLAPSE_FILTERS = 'main button[aria-label="Collapse search panel"]';

export const BTN_EXPAND_FILTERS = 'main button[aria-label^="Expand search panel"]';

/** Change Local Office dialog of the corporate office's Location picker. */
export const DLG_LOCATION = '[role="dialog"]:has-text("Change Local Office")';
export const TXT_LOCATION_SEARCH = '[data-testid="location-settings-modal-change-local-office-input-search"]';

// ---------------------------------------------------------------- results grid

/** "45 items found". */
export const ITEM_COUNT = 'main :text-matches("items? found", "i")';

/** History of an office with no business type shows this prompt instead of a count and grid. */
export const SELECT_BUSINESS_TYPE = 'main :text-is("Select a business type to view commission tier history.")';

export const BTN_GRID_OPTIONS = 'main button[aria-label="Grid Options"]';

export const HEADERS = 'main thead th';

export const HEADER_MENU_TRIGGER = 'button[data-slot="dropdown-menu-trigger"]';

/** Data rows: at least two cells, so the "No results" placeholder row is never counted. */
export const ROWS = 'main tbody tr:has(td + td)';

export const SKELETON = 'main [data-slot="skeleton"]';

/** Editable office only: the toolbar above the grid. */
export const TOOLBAR = '[data-testid="commission-tiers-toolbar-actions"]';
export const BTN_ADD_ROW = '[data-testid="commission-tiers-add-row"]';
export const BTN_COPY_MENU = '[data-testid="commission-tiers-copy-menu"]';

/** Toolbar buttons by accessible name (Export also appears on History, outside the Basic toolbar). */
export const BTN_NAME = {
  save: /^Save$/,
  addRow: /^Add Row$/,
  export: /^Export$/,
  import: /^Import$/,
  copy: /^Copy$/,
  resetDates: /^Reset Dates$/,
} as const;

/**
 * Grid cell testids: `commission-tier-<field>-<row key>`, where the key is the record id of a saved row or `new-N`
 * of an added one. A number cell shows a `div[role=button]`; clicking it swaps in `<input type=number>` whose testid
 * ends in `-input`.
 */
export const CELL_KEY: Record<string, string> = {
  'Service Type': 'service-type',
  'Lower Tier Boundary': 'lower-tier',
  'Upper Tier Boundary': 'upper-tier',
  'Comm %': 'commission',
  'Profit Only': 'profit-only',
  'SC Comm %': 'sc-commission',
  'Is SC Comm Calculated On Net?': 'sc-on-net',
  'ETS Comm %': 'ets-commission',
};
export const cellDisplay = (key: string): string => `[data-testid^="commission-tier-${key}-"]:not([data-testid$="-input"])`;
export const cellInput = (key: string): string => `[data-testid^="commission-tier-${key}-"][data-testid$="-input"]`;
export const ROW_DELETE = '[data-testid^="commission-tier-delete-"]';
export const NEW_ROW_DELETE = '[data-testid^="commission-tier-delete-new-"]';
export const rowByKey = (key: string): string => `main tbody tr:has([data-testid="commission-tier-delete-${key}"])`;

export const CHECKBOX = '[role="checkbox"]';

/** Validation markers in the grid. */
export const INVALID_MARK = '[aria-invalid="true"]';
export const ROW_ALERT = '[role="alert"]';

/** A boundary pair out of order: the value turns red and a warning icon (tooltip trigger with an svg) appears beside it. */
export const WARNING_ICON = 'div[data-slot="tooltip-trigger"]:has(svg)';
export const BOUNDARY_ERROR = `[data-testid^="commission-tier-"].text-destructive, ${WARNING_ICON}`;

// ---------------------------------------------------------------- paging (both tabs)

export const ROWS_PER_PAGE = 'xpath=//*[normalize-space(text())="rows per page"]/preceding::button[1]';

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

export const DIALOG = '[role="dialog"], [role="alertdialog"]';

/** Reset Dates modal: twelve selects labelled January … December; Save, Cancel, Close. */
export const DLG_RESET_DATES = '[role="dialog"]:has-text("Commission Tier Reset")';
export const monthCombo = (_short: string, long: string): string =>
  `xpath=.//label[normalize-space(text())="${long}"]/following::*[@role="combobox"][1]`;

/** Copy panels ("Tier/Flat Within Location Copy", "Tier/Flat Location To Location Copy"). */
export const DLG_COPY = '[role="dialog"]:has-text("Copy")';
export const COPY_SOURCE_SERVICE_TYPE = '[data-testid="commission-tier-copy-within-location-service-type-selector"]';
export const COPY_TARGET_ROW = 'tbody tr';

export const DLG_CONFLICTS = '[role="dialog"]:has-text("Conflict"), [role="alertdialog"]:has-text("Conflict")';

/** Import Commission Tiers dialog. */
export const IMPORT_FILE_INPUT = '[data-testid="commission-tiers-import-dialog-file-input"]';
export const BTN_IMPORT_UPLOAD = '[data-testid="commission-tiers-import-dialog-upload"]';
export const BTN_IMPORT_CANCEL = '[data-testid="commission-tiers-import-dialog-cancel"]';
export const DLG_IMPORT = '[role="dialog"]:has-text("Import Commission Tiers")';

export const TOAST = '[data-sonner-toast]';

export const FILE_INPUT = 'input[type="file"]';

export const SIDEBAR_MENU_BUTTON = 'button[data-sidebar="menu-button"]';
