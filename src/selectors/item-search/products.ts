/**
 * Selectors for the Products (Item Search) page — search panel, result grid, pagination.
 *
 * Page: Products (`/locations/{office}/products`), office 1101 (admin-only surface).
 *
 * The SEARCH PANEL carries a real `e2e-*` data-testid set (verified live 2026-08-31 and
 * re-checked 2026-09-01); the grid, toolbar and pagination carry none, so those anchor on
 * accessible names, which were read from the live page the same days. This object is
 * deliberately NOT merged into the global selector registry: "Search", "Reset" and the
 * pagination names repeat on sibling pages, so flat-key merging would collide.
 *
 * Loading: the page paints `[data-slot="skeleton"]` placeholders while hydrating (up to
 * ~20s on a cold load, ~11s per unfiltered search). The ONLY reliable ready signal is the
 * placeholder census reaching zero — never a row count.
 */
export const itemSearchProducts = {
  /** Skeleton placeholder shown while any region of the page is still loading. */
  skeleton: '[data-slot="skeleton"]',

  // ---------------------------------------------------------------- search panel (testids)
  inpAnyField: '[data-testid="e2e-search-input"]',
  inpBarcode: '[data-testid="e2e-barcode-input"]',
  radKeyword: '[data-testid="e2e-toggle-keyword"]',
  /**
   * The two filter checkboxes share ONE testid; DOM order is stable:
   * instance 0 = Quantity Greater Than Zero, instance 1 = Active.
   */
  chkFilterAny: '[data-testid="e2e-checkbox"]',
  btnSearch: '[data-testid="e2e-search-button"]',
  btnReset: '[data-testid="e2e-reset-button"]',
  btnSearchHelp: '[data-testid="e2e-popover-trigger"]',

  // ---------------------------------------------------------------- panel controls (no testid)
  /** Location / Region comboboxes keep these accessible names regardless of value. */
  NAME_LOCATION: 'Select Location',
  NAME_REGION: 'Select Region',
  /**
   * Three popover trigger buttons share this aria-label, in stable DOM order:
   * 0 = Product Organization, 1 = Prep Date Time, 2 = Return Date Time.
   * Matched by ATTRIBUTE, not by role name — the organization trigger's computed
   * accessible role/name differs (a role query finds only the two date buttons,
   * proven live 2026-09-01), while the attribute match sees all three.
   */
  btnOpenPopoverAny: 'button[aria-label="Open popover"]',
  btnMoreInformation: 'button[aria-label="More information"]',
  NAME_COLLAPSE_PANEL: 'Collapse search panel',

  // ---------------------------------------------------------------- grid + chrome
  NAME_GRID_OPTIONS: 'Grid Options',
  MENU_RESET_VIEW: 'Reset to Default View',
  gridHeaderCells: 'thead th',
  gridRows: 'tbody tr',
  /** Radix menu / listbox / tooltip portals (rendered on the body). */
  menu: '[role="menu"]',
  menuItemAny: '[role="menuitem"], [role="menuitemcheckbox"]',
  listbox: '[role="listbox"]',
  optionAny: '[role="option"]',
  tooltip: '[role="tooltip"]',

  // ---------------------------------------------------------------- pagination cluster
  NAME_FIRST_PAGE: 'Go to first page',
  NAME_PREV_PAGE: 'Go to previous page',
  NAME_NEXT_PAGE: 'Go to next page',
  NAME_LAST_PAGE: 'Go to last page',
  NAME_PAGE_NUMBER: 'Current page number',
} as const;
