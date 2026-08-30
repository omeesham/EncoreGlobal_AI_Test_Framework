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

// 0-based `<td>` index within a Pricing Detail row. Price is read-only text;
// only New Price and Max Discount carry editable inputs.
export const DETAIL_GRID_COLS = {
  id: 0,
  productGroupName: 1,
  price: 2,
  newPrice: 3,
  maxDiscount: 4,
} as const;
