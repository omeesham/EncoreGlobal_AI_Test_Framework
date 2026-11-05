// Selectors for Tax → Sales Tax (/locations/{office}/taxes/sales-tax).
// Audited against e2e on 2026-11-04 (office 1101). Both tabs render the same search form: Zip Code, State,
// County and City carry stable ids, Search/Reset carry e2e test ids. The grid is the shared table component;
// its column headers are dropdown-menu triggers (Sort ascending / Sort descending / Hide column).

// ---------------------------------------------------------------- page chrome

export const HEADING = 'main h1:text-is("Sales Tax")';

export const TAB_BASIC = '[role="tab"][id$="-trigger-sales-tax-table"]';
export const TAB_HISTORY = '[role="tab"][id$="-trigger-sales-tax-history"]';

// ---------------------------------------------------------------- search criteria (one <form> per tab)

export const SEARCH_PANEL = 'main form';

export const TXT_ZIP = '#sales-tax-zip-code';

// Radix Select triggers; each sits next to an aria-hidden native <select> mirror — never target that.
export const CMB_STATE = '#sales-tax-state';
export const CMB_COUNTY = '#sales-tax-county';
export const CMB_CITY = '#sales-tax-city';

export const LISTBOX_OPTION = '[role="option"]';

/** Basic Information: the single as-of date. */
export const TXT_SEARCH_DATE = 'main form input[aria-label="Select date"]';
export const BTN_OPEN_CALENDAR = 'main form button[aria-label="Open calendar"]';

/** History: the range trigger ("MM/DD/YYYY - MM/DD/YYYY") and its two-month calendar. */
export const BTN_DATE_RANGE = 'main form button#date';
export const DATE_RANGE_POPOVER = '[data-slot="popover-content"]:has([data-slot="calendar"])';
export const calendarDay = (iso: string): string => `td[data-day="${iso}"] button`;

export const BTN_SEARCH = 'main [data-testid="e2e-search-button"]';
export const BTN_RESET = 'main [data-testid="e2e-reset-button"]';

/** Inline validation surfaced by the search form. */
export const SEARCH_INVALID = '[aria-invalid="true"], [role="alert"], [data-slot="form-message"]';

// ---------------------------------------------------------------- results

export const GRID = 'main table';
export const HEADER_CELLS = 'thead th';
export const BODY_ROWS = 'tbody tr';
export const MENU = '[role="menu"]';

export const BTN_IMPORT = 'main button[data-slot="button"]:text-is("Import")';
export const FILE_INPUT = 'main input[type="file"]';

export const BTN_NEXT_PAGE = 'main button[aria-label="Go to next page"]';
export const TXT_PAGE_NUMBER = 'main input[aria-label="Current page number"]';

/** Rows-per-page select in the pager — the only select trigger without a sales-tax-* id. */
export const SEL_PAGE_SIZE = 'main button[data-slot="select-trigger"]:not([id^="sales-tax-"])';

export const BTN_GRID_OPTIONS = 'main button[aria-label="Grid Options"]';

/** Grid skeleton or any busy marker while a search is pending. */
export const LOADING_INDICATOR = 'main :is([data-slot="skeleton"], [role="progressbar"], [aria-busy="true"], .animate-spin, .animate-pulse)';

// ---------------------------------------------------------------- toasts

export const TOAST = '[data-sonner-toast]';
export const TOAST_ERROR = '[data-sonner-toast][data-type="error"]';
export const TOAST_SUCCESS = '[data-sonner-toast][data-type="success"]';
export const ERROR_SURFACE = '[data-sonner-toast][data-type="error"], main [role="alert"]';

// ---------------------------------------------------------------- navigation

export const lnkSalesTax = (office: string): string => `a[href$="/locations/${office}/taxes/sales-tax"]`;
