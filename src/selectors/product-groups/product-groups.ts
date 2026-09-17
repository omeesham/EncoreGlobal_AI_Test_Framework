/**
 * Selectors for the Product Groups page and its Add page.
 *
 * Page: `/locations/{office}/products/product-groups` (+ `/add` — a route, not a dialog).
 *
 * Only the Active checkbox carries a testid here (verified live 2026-08-31); everything
 * else anchors on placeholders, visible text, or accessible names. Kept separate from the
 * Products-page selectors per the different-URL partition rule — "Search"/"Reset" exist
 * on both pages and must never merge into one flat object.
 */
export const itemSearchProductGroups = {
  /** Skeleton placeholder shown while any region is still loading. */
  skeleton: '[data-slot="skeleton"]',

  // ---------------------------------------------------------------- list page
  PLACEHOLDER_SEARCH: 'Search Product Groups...',
  chkActive: '[data-testid="e2e-checkbox"]',
  TEXT_RESET: 'Reset',
  TEXT_SEARCH: 'Search',
  TEXT_ADD: 'Add',
  LINK_PRODUCTS: 'Products',
  gridHeaderCells: 'thead th',
  gridRows: 'tbody tr',
  NAME_NEXT_PAGE: 'Go to next page',
  NAME_FIRST_PAGE: 'Go to first page',
  NAME_PREV_PAGE: 'Go to previous page',
  NAME_LAST_PAGE: 'Go to last page',
  NAME_PAGE_NUMBER: 'Current page number',
  /** The × inside the search box — an unlabeled button that exists only while the box holds text
   *  (verified live 2026-09-09); the icon class is the only stable anchor. */
  searchClearButton: 'main form button:has(svg.lucide-x)',
  /** The spinner the search panel shows while a search is in flight (present ~0.4s on 22 rows). */
  searchLoader: 'main form svg.lucide-loader-circle',
  /** The empty-state text the grid shows at rest and after a no-match search. */
  TEXT_NO_RESULTS: 'No results',
  /** The Grid Options trigger carries its name as screen-reader text; the header menu triggers are
   *  named after their columns. Both are Radix menus whose ids change on every render. */
  NAME_GRID_OPTIONS: 'Grid Options',
  MENU_RESET_VIEW: 'Reset to Default View',
  MENU_SORT_ASCENDING: 'Sort ascending',
  MENU_SORT_DESCENDING: 'Sort descending',
  MENU_HIDE_COLUMN: 'Hide column',
  menu: '[role="menu"]',
  listbox: '[role="listbox"]',
  /** The result grid's table — its left edge and width move when the search panel collapses. */
  gridTable: 'main table',
  /** Each header cell carries a drag grip (reorder) and an edge handle (resize); the handle is named
   *  "Resize column <field>" after the column's field key. */
  headerGrip: 'svg.lucide-grip-vertical',
  RESIZE_HANDLE_PREFIX: 'Resize column ',
  /** Sort markers drawn in a header cell: ascending, descending, or the neutral marker of a
   *  sortable-but-unsorted column (Status draws none — it cannot be sorted). */
  sortMarkerAscending: 'svg.lucide-arrow-up',
  sortMarkerDescending: 'svg.lucide-arrow-down',
  sortMarkerNeutral: 'svg.lucide-arrow-up-down',
  /** A result row opens the group's Edit page at this address. */
  EDIT_URL_PATTERN: /\/products\/product-groups\/edit\/\d+/,
  TEXT_EDIT_HEADING: 'Edit',
  /** The Priced / Not Priced badge beside the Edit form's Active checkbox. */
  PRICE_BADGE_PATTERN: /^(Not )?Priced$/,
  NAME_TRANSLATIONS: 'Click to show translations popup',

  // ---------------------------------------------------------------- add page
  PLACEHOLDER_ADD_NAME: 'Enter Product Group Name',
  PLACEHOLDER_ADD_DESC: 'Enter Product Group Description',
  TEXT_CANCEL: 'Cancel',
  TEXT_SAVE: 'Save',
  /** The breadcrumb crumb above the form that leads back to the group list — a plain link,
   *  so it leaves the page without any unsaved-changes prompt (verified live 2026-09-09). */
  LINK_PRODUCT_GROUPS: 'Product Groups',
  /** The required Service Type selector shows this label until a type is chosen. */
  TEXT_SERVICE_TYPE: 'Service Type',
  /** The Service Type selector itself — the only combobox on the Add page without a testid
   *  (the picker's sort-order selector carries one), so it stays addressable after a value
   *  replaces its placeholder text. */
  addServiceTypeCombo: 'button[role="combobox"]:not([data-testid])',
  /** The sub-class picker: a search box over a list of draggable item rows. A row is
   *  added to the group by double-clicking it or by dragging it onto the Sub Classes area. */
  PLACEHOLDER_SUBCLASS_SEARCH: 'Search',
  subClassItem: '[draggable="true"]',
  /** The form's two text boxes, anchored on their form field names (no testids; verified
   *  live 2026-09-09). Both carry a maxlength the browser enforces silently. */
  addNameInput: 'input[name="productGroupName"]',
  addDescriptionInput: 'input[name="productGroupDescription"]',
  /** The form's Active checkbox is the only checkbox on the page without a testid; the
   *  picker's Labor checkbox carries the shared `e2e-checkbox` testid instead. */
  chkAddActive: 'button[role="checkbox"]:not([data-testid])',
  chkPickerLabor: 'button[role="checkbox"][data-testid="e2e-checkbox"]',
  /** The picker's sort-order selector. Its testid is a copy-paste from the currency
   *  selector (verified live 2026-09-09) — stable, but misleading; kept as the anchor
   *  because it is the only testid on the control. */
  pickerSortCombo: 'button[role="combobox"][data-testid="select-currency"]',
  TEXT_SORT_ASCENDING: 'Ascending',
  TEXT_SORT_DESCENDING: 'Descending',
  /** The picker's own Reset — the list page has a Reset too, so the text is scoped to the
   *  Add page by the page object. */
  TEXT_PICKER_RESET: 'Reset',
  /** The × control on an added sub-class row has no accessible name; this class pair is
   *  unique to those rows on the page (verified live 2026-09-09). */
  addedSubClassRemove: 'button.text-xs.cursor-pointer',
  /** The instruction shown in the Sub Classes area while it is empty. Rendered with
   *  non-breaking hyphens, so it is matched hyphen-agnostically. */
  SUBCLASS_INSTRUCTION: /Drag or double.click items from the left to add sub.classes/,
  /** The divider toggle between the picker and the form; its label flips with the state. */
  NAME_COLLAPSE_PANEL: 'Collapse search panel',
  NAME_EXPAND_PANEL: 'Expand search panel',

  // ---------------------------------------------------------------- create confirmation
  /** Backend endpoint the add form posts to — filtered on so the save wait keys only on
   *  the real create call, never the page's own render requests. */
  CREATE_ENDPOINT: '/navigator/api/location/add-update-product-group',
  /** The confirmation toast container and its message after a successful create. */
  TOAST: '[data-sonner-toast]',
  TOAST_GROUP_CREATED: 'Product Group created successfully',
} as const;
