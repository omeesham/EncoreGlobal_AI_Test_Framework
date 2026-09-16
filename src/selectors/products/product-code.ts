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
  /** Optional identifier box shared by the add and view forms. */
  PLACEHOLDER_ORACLE_ITEM_NUMBER: 'Enter oracle item number',
  /** The add form's paired type selectors show these placeholders until chosen. */
  TEXT_SELECT_PRODUCT_TYPE: 'Select product type',
  TEXT_SELECT_SERVICE_TYPE: 'Select service type',

  // ---------------------------------------------------------------- view-dialog controls (read live 2026-09-15)
  /** Own-name boxes of the upper segments, and the Sub Class product description box. */
  PLACEHOLDER_SUB_CLASS_NAME: 'Enter sub-class name',
  PLACEHOLDER_CLASS_NAME: 'Enter class name',
  PLACEHOLDER_SUB_CATEGORY_NAME: 'Enter sub-category name',
  PLACEHOLDER_CATEGORY_NAME: 'Enter category name',
  PLACEHOLDER_PRODUCT_DESCRIPTION: 'Enter product description',
  /**
   * Every dropdown in the dialog is a button trigger with the combobox role. The Product
   * Organization triggers carry the same role plus an "Open popover" label, so the hierarchy,
   * type and service dropdowns are the triggers WITHOUT that label, in section order.
   */
  comboTrigger: 'button[role="combobox"]:not([aria-label="Open popover"])',
  btnOrgPopover: 'button[aria-label="Open popover"]',
  /** Radix popover / listbox portals, rendered on the body outside the dialog. */
  popper: '[data-radix-popper-content-wrapper]',
  listbox: '[role="listbox"]',
  option: '[role="option"]',
  /**
   * A chosen country in the organization list carries a fully opaque check mark; every
   * unchosen entry carries the same mark at zero opacity, so the mark's opacity class is
   * the only checked signal (the entries expose no checked attribute).
   */
  orgCheckedMark: 'svg.opacity-100',
  checkbox: '[role="checkbox"]',
  /** The Active confirmation prompt and its two buttons. */
  prompt: '[role="alertdialog"]',
  NAME_OK: 'Ok',
  NAME_CANCEL: 'Cancel',
  /**
   * The prompt a Sub Class organization save raises before the update goes out. It is a
   * second dialog named by its heading, not an alert like the Active prompts, so it is found
   * by that name; its answers are the No and Yes buttons and its header X closes it unanswered.
   */
  TITLE_ITEMS_PROMPT: 'Confirm',
  NAME_YES: 'Yes',
  NAME_NO: 'No',
  /** The History tab's page-number box (attribute-anchored; its implicit role varies). */
  inpHistoryPage: 'input[aria-label="Current page number"]',

  // ---------------------------------------------------------------- create / update confirmation
  /** Backend endpoint the add form posts to — filtered on so a save wait ignores the
   *  page's own render requests and keys only on the real create call. */
  CREATE_ENDPOINT: '/navigator/api/product/create',
  /** Backend endpoint the view dialog's Save sends its update to (one PUT per save). */
  UPDATE_ENDPOINT: '/navigator/api/product/update',
  /** Backend endpoint the History tab reads from — paging and sorting re-read it. */
  HISTORY_ENDPOINT: '/navigator/api/products/get-product-history',
  /** Backend endpoint every segment opener reads the product chain from. */
  HIERARCHY_ENDPOINT: '/navigator/api/products/get-product-hierarchy',
  /** A hierarchy pick fetches the chosen level by its identifier from this endpoint (GET). */
  PRODUCT_BY_IDENTIFIER: /\/navigator\/api\/product\/(\d+)$/,
  /** The confirmation toast container and its messages. */
  TOAST: '[data-sonner-toast]',
  TOAST_CODE_CREATED: 'Product created successfully.',
  TOAST_CODE_UPDATED: 'Product updated successfully.',
  /** Shown briefly when the update request is cut off before the server answers. */
  TOAST_REQUEST_ABORTED: 'Request aborted',
} as const;
