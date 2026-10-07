// Selectors for Setup → Price Guide (/locations/{office}/settings/price-guide).
// The page carries almost no data-testids: panels are anchored on the one authored id and on
// data-slot attributes, never on Radix-generated ids (radix-_r_N_), which change per render.

// ---------------------------------------------------------------- page header

export const HEADER_TITLE = 'h1:text-is("Price Guide")';

/** The page's own error screen (bad office id, or a failed load). */
export const APP_ERROR = 'main :text("Unexpected error")';

export const BTN_INFO = 'button[aria-label="More information"]';

export const TOOLTIP = '[role="tooltip"]';

/** Sidebar control between the two panels; its label flips to "Expand search panel" once collapsed. */
export const BTN_COLLAPSE_PANEL = 'button[aria-label="Collapse search panel"]';

export const BTN_EXPAND_PANEL = 'button[aria-label="Expand search panel"]';

// ---------------------------------------------------------------- left panel: Local Office card

export const LOCAL_OFFICE_CARD = 'main [data-slot="card"]:has(:text-is("Local Office"))';

// ---------------------------------------------------------------- left panel: Packages / Product Groups

export const TAB = (name: 'Packages' | 'Product Groups'): string =>
  // :has-text, not :text-is - the label sits in a child node, so an exact match never resolves.
  `main [data-slot="underlined-tabs-list"] [role="tab"]:has-text("${name}")`;

// Only the active panel is mounted with rows; the inactive one is hidden, so scoping on
// data-state keeps every left-list locator on the tab the user is looking at.
export const LEFT_PANEL = 'main [data-slot="underlined-tabs-content"][role="tabpanel"][data-state="active"]';

export const LEFT_SEARCH = `${LEFT_PANEL} input[data-slot="input"]`;

export const LEFT_ROWS = `${LEFT_PANEL} tbody tr[draggable="true"]`;

export const LEFT_HEADERS = `${LEFT_PANEL} thead th`;

// ---------------------------------------------------------------- right panel: Price Guide Recommendations

// `main`-scoped: Print clones this panel (id and all) into a print-only section outside main,
// and an unscoped id then matches twice.
export const RIGHT_PANEL = 'main #price-guide-recommendations-print';

export const RIGHT_TOOLBAR = `${RIGHT_PANEL} [data-testid="price-guide-recommendations-toolbar-actions"]`;

export const BTN_PRINT = `${RIGHT_PANEL} button:text-is("Print")`;

export const BTN_SAVE = `${RIGHT_PANEL} button:text-is("Save")`;

export const RIGHT_SEARCH = `${RIGHT_PANEL} input[data-slot="input"]`;

export const BTN_GRID_OPTIONS = `${RIGHT_PANEL} button[aria-label="Grid Options"]`;

// Recommendation rows are not draggable (only the left list rows are); each carries a Delete
// button, which also keeps the empty-state row out.
export const RIGHT_ROWS = `${RIGHT_PANEL} tbody tr:has(button[aria-label="Delete"])`;

export const RIGHT_HEADERS = `${RIGHT_PANEL} thead th`;

// The whole grid area accepts drops; an empty grid has no body rows to aim at.
export const RIGHT_DROP_ZONE = `${RIGHT_PANEL} [data-slot="table-container"]`;

/** Scope on a right-grid row. The testid carries `price-guide-remove-<type>:<type>-<index>`. */
export const BTN_ROW_DELETE = 'button[aria-label="Delete"]';

export const EMPTY_STATE_TITLE = `${RIGHT_PANEL} :text-is("No recommendations yet")`;

// ---------------------------------------------------------------- shared grid chrome

/** Column header button inside a th — opens Sort ascending / Sort descending / Hide column. */
export const HEADER_MENU_TRIGGER = 'button[data-slot="dropdown-menu-trigger"]';

export const MENU = '[role="menu"]';

export const MENU_ITEM = '[role="menu"] [role="menuitem"]';

export const MENU_CHECKBOX = '[role="menu"] [role="menuitemcheckbox"]';

export const resizeHandle = (columnId: string): string => `button[aria-label="Resize column ${columnId}"]`;

// ---------------------------------------------------------------- unsaved-changes guard

export const DLG_UNSAVED = '[role="alertdialog"]:has-text("Unsaved changes")';

export const BTN_DLG_STAY = `${DLG_UNSAVED} button:text-is("Stay")`;

export const BTN_DLG_DISCARD = `${DLG_UNSAVED} button:text-is("Discard")`;

// ---------------------------------------------------------------- sidebar

/** Setup is a dropdown menu in the sidebar; its entries are menu items, rendered only while open. */
export const SIDEBAR_SETUP = 'button[data-sidebar="menu-button"]:has-text("Setup")';

export const SIDEBAR_PRICE_GUIDE = '[role="menuitem"][href$="/settings/price-guide"], a[href$="/settings/price-guide"]';

/** The Price Guide entry once it points at the office; until the office loads it reads "locations//settings/…". */
export const sidebarPriceGuideFor = (officeNo: string): string =>
  `[role="menuitem"][href$="/locations/${officeNo}/settings/price-guide"], a[href$="/locations/${officeNo}/settings/price-guide"]`;

export const SIDEBAR_HOME = 'a[href$="/home"]';

/** Location switcher at the top of the sidebar; shows the current office name. */
export const LOCATION_SWITCHER = '[data-sidebar="header"] button[data-sidebar="menu-button"]';

/** Search box of the open location switcher; it finds any office, not just the recent ones listed. */
export const SWITCHER_SEARCH = '[role="menu"] input[data-slot="input"]';

/** Office entries in the open location switcher, e.g. "2359 Toronto Hilton". */
export const switcherOffice = (code: string): string => `[role="menu"] [role="menuitem"]:has-text("${code}")`;

// ---------------------------------------------------------------- user menu: theme

/** User menu trigger at the bottom of the sidebar (shows the user's name). */
export const USER_MENU = '[data-sidebar="footer"] [data-sidebar="menu-button"]';

/** Theme switch in the user menu: radio inputs system / light / dark, each with an icon label. */
export const themeOption = (value: 'system' | 'light' | 'dark'): string => `label[for="theme-switch-${value}"]`;

export const THEME_SELECTED = 'input[id^="theme-switch-"]:checked';

/** The copy of the recommendations panel the page builds for printing; it sits outside main. */
export const PRINT_COPY = '#price-guide-recommendations-print:not(main #price-guide-recommendations-print)';
