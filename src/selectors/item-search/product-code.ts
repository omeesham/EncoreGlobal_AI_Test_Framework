/**
 * Selectors for the product-code layer of the Products page — the row-selection toolbar
 * and the "Product Code Details" dialogs (view + add flows).
 *
 * None of these controls carries a data-testid (verified live 2026-08-31), so anchors are
 * accessible names plus two structural handles for the split-button carets. Kept separate
 * from the search-panel selectors because the toolbar exists only with a selected row and
 * its names ("Save", "Close") repeat inside other dialogs of the app.
 */
export const itemSearchProductCode = {
  // ---------------------------------------------------------------- row toolbar
  NAME_VIEW_PRODUCT_CODE: 'View Product Code',
  NAME_ADD_PRODUCT_CODE: 'Add Product Code',
  NAME_VIEW_AVAILABILITY: 'View Availability',
  NAME_PRODUCT_GROUP: 'Product Group',
  /**
   * Each split button is a DIV wrapping the named button plus an unnamed caret button
   * with aria-haspopup="menu" (structure read live 2026-09-01). The caret opens the
   * five-segment menu for its flow.
   */
  btnViewCaret: 'div:has(> button:text-is("View Product Code")) > button[aria-haspopup="menu"]',
  btnAddCaret: 'div:has(> button:text-is("Add Product Code")) > button[aria-haspopup="menu"]',

  // ---------------------------------------------------------------- dialog
  dialog: '[role="dialog"]',
  TITLE_DIALOG: 'Product Code Details',
  tabAny: '[role="tab"]',
  tabActive: '[role="tab"][aria-selected="true"]',
  NAME_SAVE: 'Save',
  NAME_CLOSE: 'Close',
  /** Editable name box in both dialogs (placeholder is stable across view and add). */
  PLACEHOLDER_NAME: 'Enter name',
  /** The add form's required item description box. */
  PLACEHOLDER_ITEM_DESCRIPTION: 'Enter item description',
  /** The add form's paired type selectors show these placeholders until chosen. */
  TEXT_SELECT_PRODUCT_TYPE: 'Select product type',
  TEXT_SELECT_SERVICE_TYPE: 'Select service type',

  // ---------------------------------------------------------------- create confirmation
  /** Backend endpoint the add form posts to — filtered on so a save wait ignores the
   *  page's own render requests and keys only on the real create call. */
  CREATE_ENDPOINT: '/navigator/api/product/create',
  /** The confirmation toast container and its message after a successful create. */
  TOAST: '[data-sonner-toast]',
  TOAST_CODE_CREATED: 'Product created successfully.',
} as const;
