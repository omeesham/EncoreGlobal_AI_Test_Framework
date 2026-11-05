// Selectors for Tax → State Tax (/locations/{office}/taxes/state-tax).
// Audited against e2e on 2026-11-05 (office 1101). The NM-4023 §5 data-testid catalogue is not implemented:
// only Search/Reset carry e2e test ids, the three filters carry stable ids, and the grid is the shared table
// component whose editable cells are bare <input>s. Columns are therefore resolved by header text.

// ---------------------------------------------------------------- page chrome

export const HEADING = 'main h1:text-is("State Tax")';

export const TAB_BASIC = '[role="tab"][id$="-trigger-state-tax-table"]';
export const TAB_HISTORY = '[role="tab"][id$="-trigger-state-tax-history"]';

// ---------------------------------------------------------------- search criteria (one <form> per tab)

export const SEARCH_PANEL = 'main form';

// Radix Select triggers; each sits next to an aria-hidden native <select> mirror — never target that.
export const CMB_STATE = '#state-tax-state';
export const CMB_TAX_TYPE = '#state-tax-type';
export const CMB_RATE = '#state-tax-taxable-percentage';

export const LISTBOX_OPTION = '[role="option"]';

/** Basic Information: the single as-of date. */
export const TXT_SEARCH_DATE = 'main form input[aria-label="Select date"]';
export const BTN_OPEN_CALENDAR = 'main form button[aria-label="Open calendar"]';

/** History: the range trigger ("MM/DD/YYYY - MM/DD/YYYY") and its two-month calendar. */
export const BTN_DATE_RANGE = 'main form button#date';
export const DATE_POPOVER = '[data-slot="popover-content"]:has([data-slot="calendar"])';
export const calendarDay = (iso: string): string => `td[data-day="${iso}"] button`;

export const BTN_SEARCH = 'main [data-testid="e2e-search-button"]';
export const BTN_RESET = 'main [data-testid="e2e-reset-button"]';

/** Inline validation surfaced by the search form. */
export const SEARCH_INVALID = '[aria-invalid="true"], [role="alert"], [data-slot="form-message"]';

// ---------------------------------------------------------------- results

export const BTN_SAVE = 'main button[data-slot="button"]:text-is("Save")';
export const BTN_GRID_OPTIONS = 'main button[aria-label="Grid Options"]';

export const GRID = 'main table';
export const HEADER_CELLS = 'thead th';
export const BODY_ROWS = 'tbody tr';
export const MENU = '[role="menu"]';

/** History pager. */
export const BTN_NEXT_PAGE = 'main button[aria-label="Go to next page"]';
export const SEL_PAGE_SIZE = 'main button[data-slot="select-trigger"]:not([id^="state-tax-"])';

export const LOADING_INDICATOR = 'main :is([data-slot="skeleton"], [role="progressbar"], [aria-busy="true"], .animate-spin, .animate-pulse)';

// ---------------------------------------------------------------- dialogs, toasts

/** Shared location-settings "Unsaved changes" alert dialog (Stay / Discard). */
export const DLG_UNSAVED_CHANGES = '[data-testid="location-settings-modal-unsaved-changes"]';

export const TOAST = '[data-sonner-toast]';
export const TOAST_ERROR = '[data-sonner-toast][data-type="error"]';
export const TOAST_SUCCESS = '[data-sonner-toast][data-type="success"]';
export const ERROR_SURFACE = '[data-sonner-toast][data-type="error"], main [role="alert"]';

// ---------------------------------------------------------------- navigation

export const lnkStateTax = (office: string): string => `a[href$="/locations/${office}/taxes/state-tax"]`;
