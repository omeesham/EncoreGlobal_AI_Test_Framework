export const CorporatePricingDetailGridSelectors = {
  tblDetailGrid: 'table:has(th:has-text("Product Group Name"))',
  rowDetailAny: 'table:has(th:has-text("Product Group Name")) tr',

  colDetailId: 'th:has-text("ID")',
  colDetailProductGroupName: 'th:has-text("Product Group Name")',
  colDetailPrice: 'th:has-text("Price")',
  colDetailNewPrice: 'th:has-text("New Price")',
  colDetailMaxDiscount: 'th:has-text("Max Discount")',

  itemDraggableAny: '[draggable="true"][role="button"]',
  txtSourceFilter: 'input[placeholder="Search ID or Name..."]',
} as const;

/**
 * Per-row cell column index within a Pricing Detail grid `<tr>` (0-based `<td>` order, live-verified).
 * Price (col 2) is read-only text (no input); New Price (col 3) + Max Discount (col 4) carry the
 * editable inputs. Used by the page object to anchor cell reads/edits by Product Group Name.
 */
export const DETAIL_GRID_COLS = {
  id: 0,
  productGroupName: 1,
  price: 2,
  newPrice: 3,
  maxDiscount: 4,
} as const;
