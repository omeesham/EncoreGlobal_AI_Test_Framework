// Selectors for Discount Matrix → Company Matrix tab.
// Radix regenerates tab ids per render — never anchor on them, use [role="tab"] + text.

// ---------------------------------------------------------------- tab navigation

// :has-text, not :text-is — the tab may wrap extra child nodes (badge, icon) that
// would make an exact textContent match never resolve.
export const TAB_COMPANY_MATRIX = '[role="tab"]:has-text("Company Matrix")';

export const TAB_REGION_WEEKLY_PEAKS = '[role="tab"]:has-text("Region Weekly Peaks")';

export const TAB_LOCATION_ACTIVATION = '[role="tab"]:has-text("Location Activation")';

/** The tab list container. Waiting on this confirms the tab chrome is mounted. */
export const TAB_LIST = '[role="tablist"]';

// ---------------------------------------------------------------- criteria bar (shared above all tabs)

// Label adjacent-sibling anchors: a `:near()` proximity selector bled across the three
// comboboxes and matched two elements in strict mode. Displayed values vary by office.
export const CMB_COUNTRY = 'label:text-is("Country:") + [role="combobox"]';

export const CMB_CURRENCY = 'label:text-is("Currency:") + [role="combobox"]';

export const CMB_BUSINESS_TIER = 'label:text-is("Business Tier:") + [role="combobox"]';

// Anchored on `name`, not the placeholder — a placeholder is presentational and shared far
// more easily than a name.
export const INP_GAV_DISCOUNT_THRESHOLD = 'input[name="gavDiscountThreshold"]';

/** Overlay Radix renders while a combobox dropdown is open. */
export const LISTBOX = '[role="listbox"]';

// Elements that would carry a validation message if one rendered; this surface renders none,
// so any non-empty result is a behaviour change worth reporting.
export const VALIDATION_MESSAGE_CANDIDATES =
  '[aria-live],[class*="error"],[class*="Error"],[class*="invalid"],[role="alert"]';

// ---------------------------------------------------------------- Company Matrix tab — grid

// Scoped by the "Add Tier" button, unique to this panel, so it never resolves to a sibling
// tab's panel mid-transition.
export const PANEL_COMPANY_MATRIX = '[role="tabpanel"]:has(button:text-is("Add Tier"))';

/** Grid body rows, panel-scoped so other tab panels' rows never match. */
export const ROWS = `${PANEL_COMPANY_MATRIX} tbody tr`;

// Loading placeholder. Row count alone is not a readiness signal — the skeleton rows satisfy
// it in ~12 ms; the grid is ready only when rows exist AND zero skeletons remain.
export const GRID_SKELETON = `${PANEL_COMPANY_MATRIX} [data-slot="skeleton"]`;

/** Both thead rows: 4 group headers + 23 day-bucket headers = 27 th, not 22. */
export const COL_HEADERS = `${PANEL_COMPANY_MATRIX} thead th`;

// Exact td match, not :has-text — has-text is a substring match on the whole row, so on a grid
// of numbers one label eventually matches the wrong row, silently.
export const rowByTierRange = (tierRange: string): string =>
  `${PANEL_COMPANY_MATRIX} tbody tr:has(td:text-is("${tierRange}"))`;

/** Scope this on the row locator from rowByTierRange, not on the page. */
export const BTN_ROW_DELETE = 'button[title="Delete"]';

/** Scope this on the row locator from rowByTierRange, not on the page. */
export const BTN_ROW_EDIT = 'button[title="Edit"]';

// ---------------------------------------------------------------- Company Matrix tab — toolbar

/** Panel-scoped so it never matches a same-named button on another tab. */
export const BTN_ADD_TIER = `${PANEL_COMPANY_MATRIX} button:text-is("Add Tier")`;

// Downloads `DiscountMatrix-{country}-{currency}-{tier}.xlsx`, which varies with the criteria
// bar — do not hardcode a filename in specs.
export const BTN_EXPORT = `${PANEL_COMPANY_MATRIX} button:text-is("Export")`;

// Deliberately unscoped: Save is a page-level header control living outside every
// [role="tabpanel"], so a panel-scoped selector matches zero elements.
export const BTN_SAVE = 'button:text-is("Save")';

// ---------------------------------------------------------------- Edit Tier dialog

// Anchored on "Editing" alone so it resolves whichever tier row opened it — the full title
// is "Editing {tierRange}".
export const DLG_EDIT_TIER = '[role="dialog"]:has-text("Editing")';

// The 21 percentage inputs carry no id or data-testid — address them positionally with
// .nth(columnIndex), 0-based left to right across the 3 groups × 7 buckets.
export const DLG_EDIT_TIER_INPUTS = `${DLG_EDIT_TIER} input[inputmode="decimal"]`;

export const BTN_EDIT_CANCEL = `${DLG_EDIT_TIER} button:text-is("Cancel")`;

export const BTN_EDIT_UPDATE = `${DLG_EDIT_TIER} button:text-is("Update")`;

// ---------------------------------------------------------------- Add Tier dialog

/** Exact title text so it never matches the Edit Tier dialog. */
export const DLG_ADD_TIER = '[role="dialog"]:has-text("Adding Tier")';

// Author-written semantic id, not a Radix-generated one, so it is stable across renders.
// This is the dialog's only input — there is no Start Tier field.
export const INP_ADD_TIER_END = '#discount-matrix-tier-end';

export const BTN_ADD_CANCEL = `${DLG_ADD_TIER} button:text-is("Cancel")`;

// Dialog-scoped and exact-matched to separate it from the toolbar's "Add Tier" button.
// Disabled on open; enabled once INP_ADD_TIER_END holds a value.
export const BTN_ADD_TIER_CONFIRM = `${DLG_ADD_TIER} button:text-is("Add Tier")`;
