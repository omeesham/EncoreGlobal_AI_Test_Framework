/**
 * Selectors for the Discount Matrix page — pieces shared by all three tabs.
 *
 * Page: Location Settings → Discount Matrix (`/locations/{office}/settings/discount-matrix`)
 *
 * The page carries ZERO data-testid attributes (verified on the live application 2026-08-25),
 * so anchors below are the most stable structural handles available. This object is imported
 * directly by the Discount Matrix page objects and is deliberately NOT merged into the global
 * selector registry: `Save`, `Cancel`, `Export` and `Import` appear on multiple tabs of this
 * page and on other pages, so flat-key merging would collide. Callers scope by tab panel.
 *
 * Loading: every surface paints skeleton placeholders (`[data-slot="skeleton"]`) before data
 * arrives, and grids keep their full row count while still loading — the ONLY reliable ready
 * signal is the placeholder census reaching zero, never a row count.
 */
export const discountMatrixShared = {
  /** Skeleton placeholder shown while any region of the page is still loading. */
  skeleton: '[data-slot="skeleton"]',

  /**
   * GAV Discount Threshold — the one criteria control with a stable attribute anchor.
   * Rendered as `type="text"` + `inputmode="decimal"`, so the application (not the browser)
   * owns all numeric validation. Values live in input.value.
   */
  inpGavThreshold: 'input[name="gavDiscountThreshold"]',

  /**
   * The three criteria dropdowns (Country, Currency, Business Tier), in DOM order 0/1/2.
   * They are `<button role="combobox">` with no name, no id and no testid — their accessible
   * name is their current VALUE, so name-based lookup breaks the moment a test changes the
   * selection. Position is the only stable handle. The Region Weekly Peaks tab adds two more
   * comboboxes that DO carry ids; excluding those ids keeps this selector at exactly three
   * matches on every tab.
   */
  drpCriteriaAny: 'button[role="combobox"]:not(#region-weekly-peaks-year):not(#region-weekly-peaks-region)',

  /** Radix listbox + options rendered while any dropdown is open (portaled to the body). */
  listbox: '[role="listbox"]',
  optionAny: '[role="option"]',

  /**
   * Any button whose visible text is exactly "Save". The criteria bar's own Save precedes the
   * tab panels in DOM order, so `.first()` is the criteria Save; the per-tab Saves are read
   * through their owning panel locators instead — never through this flat selector.
   */
  btnSaveAny: 'button:text-is("Save")',

  /** Header information control (icon button; anchored by its accessible name). */
  btnMoreInformation: 'button[aria-label="More information"]',

  /** Tab strip. Radix generates the ids, so tabs are located by accessible name only. */
  tabAny: '[role="tab"]',
  tabActive: '[role="tab"][aria-selected="true"]',
  TAB_COMPANY_MATRIX: 'Company Matrix',
  TAB_REGION_WEEKLY_PEAKS: 'Region Weekly Peaks',
  TAB_LOCATION_ACTIVATION: 'Location Activation',

  /**
   * Tab panels. The Radix id prefix (`radix-_r_10_`) is generated per build and must never be
   * hard-coded; the suffix is stable, so panels anchor on it.
   */
  pnlRegionWeekly: '[id$="-content-region-weekly"]',
  pnlLocationActivation: '[id$="-content-location-activation"]',
  pnlCompanyMatrix: '[id$="-content-company-matrix"]',

  /**
   * Left-panel collapse toggle. No testid; its accessible name is literally "trigger-button"
   * (read from the live page 2026-08-25). Located by role + that name.
   */
  BTN_PANEL_TOGGLE_NAME: 'trigger-button',

  /**
   * Save-confirmation dialogs. The shared Location Settings dialog is "Save Changes" with an
   * Ok button; a save on this page has never been observed to open one (no probe pressed
   * Save before the first spec run), so the page objects treat the dialog as optional and
   * confirm it only if it appears.
   */
  dlgSaveChanges: '[role="alertdialog"]:has-text("Save Changes")',
  dlgAnyAlert: '[role="alertdialog"]',
} as const;
