// Selectors for Tax → International Tax Setup (/locations/{office}/taxes/international-tax-setup).
// Audited against e2e on 2026-10-22 (office 1101, Mexico / VAT / Baja California). The search and
// update fields carry stable ids, Search/Reset carry e2e test ids; the grid is the shared table
// component (same as Multiday Pricing) whose only column identifiers are the resize-handle labels.

// ---------------------------------------------------------------- page chrome

export const HEADING = 'main h1:text-is("International Tax Setup")';

/** The (i) icon beside the title. Behaviour is undefined by NM-4025 — located, never asserted. */
export const BTN_MORE_INFORMATION = 'main button[aria-label="More information"]';

// ---------------------------------------------------------------- search criteria (one <form>)

export const SEARCH_PANEL = 'main form';

// Radix Select triggers. Each sits next to an aria-hidden native <select> mirror — never target that.
// The visible captions are bare <span>s, so these triggers have NO accessible name (see TC-074).
export const CMB_COUNTRY = '#international-tax-setup-country';
export const CMB_TAX_GROUP = '#international-tax-setup-tax-group';
export const CMB_PROVINCE = '#international-tax-setup-province';

/** Both date inputs are aria-label="Select date"; the search one is the one inside the form. */
export const TXT_SEARCH_DATE = 'main form input[aria-label="Select date"]';

export const LISTBOX_OPTION = '[role="option"]';

export const BTN_SEARCH = '[data-testid="e2e-search-button"]';
export const BTN_RESET = '[data-testid="e2e-reset-button"]';

/** Inline validation surfaced by the search form (aria-invalid fields or form messages). */
export const SEARCH_INVALID = '[aria-invalid="true"], [role="alert"], [data-slot="form-message"]';

// ---------------------------------------------------------------- update section (outside the form)

export const TXT_RATE = '#international-tax-setup-rate-apply';

/** The update strip: the direct parent of the Rate input. */
export const UPDATE_PANEL = `main div:has(> ${TXT_RATE})`;

export const TXT_UPDATE_DATE = `${UPDATE_PANEL} input[aria-label="Select date"]`;

export const CHK_COMMISSION_TAXABLE = '#international-tax-setup-is-commission-taxable';

// data-slot="button" separates the update-section Apply from the grid's "Apply" column header,
// which is a dropdown-menu-trigger with the same text.
export const BTN_APPLY = `${UPDATE_PANEL} button[data-slot="button"]:text-is("Apply")`;

// ---------------------------------------------------------------- results

export const BTN_SAVE = 'main button[data-slot="button"]:text-is("Save")';

export const BTN_GRID_OPTIONS = 'main button[aria-label="Grid Options"]';

export const GRID = 'main table';
export const HEADER_CELLS = 'thead th';
export const BODY_ROWS = 'tbody tr';
export const ROW_CHECKBOX = 'button[role="checkbox"][aria-label="Select row"]';
export const CHK_SELECT_ALL = 'main thead button[role="checkbox"][aria-label="Select all"]';

/** Column header menu: Sort ascending / Sort descending / Hide column. */
export const MENU = '[role="menu"]';

/** Loading feedback while a search is pending; presentation is unconfirmed, so any of these counts. */
export const LOADING_INDICATOR = 'main :is([data-slot="skeleton"], [role="progressbar"], [aria-busy="true"], .animate-spin)';

// ---------------------------------------------------------------- dialogs, toasts

/** Shared location-settings "Unsaved changes" alert dialog (Stay / Discard). */
export const DLG_UNSAVED_CHANGES = '[data-testid="location-settings-modal-unsaved-changes"]';

/** Sonner toasts; data-type is "success" or "error". */
export const TOAST = '[data-sonner-toast]';
export const TOAST_ERROR = '[data-sonner-toast][data-type="error"]';
export const TOAST_SUCCESS = '[data-sonner-toast][data-type="success"]';

/** Any error surface: error toast or inline alert. */
export const ERROR_SURFACE = '[data-sonner-toast][data-type="error"], main [role="alert"]';

// ---------------------------------------------------------------- navigation

/** Sidebar Tax group trigger — a plain list button, not inside <nav>. */
export const BTN_SIDEBAR_TAX = 'li > button:text-is("Tax")';

// Office-qualified: the sidebar can render links without the office right after load (see MDP).
export const lnkInternationalTaxSetup = (office: string): string =>
  `a[href$="/locations/${office}/taxes/international-tax-setup"]`;
