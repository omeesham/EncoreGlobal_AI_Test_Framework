/**
 * Key prefix `np`: prevents intra-module collision with the 5 other CP partitions.
 * React-controlled inputs need the native value-setter (see page object `setReactInput`) —
 * `.fill()` does not commit React state. The only usable testid is `#new-strategy-name`.
 * tabPricingStrategy, tabPricingDetail, and btnSaveDetails are NOT redefined here — reused
 * from the Details shell partition.
 */
export const CorporatePricingNewPricebookSelectors = {
  npHeading: 'h1:has-text("New Pricebook")',
  npName: 'input[placeholder="Pricebook..."]',
  npYear: 'input[placeholder="e.g. 2026"]',
  npCombobox: '[role="combobox"]',
  npOption: '[role="option"]',

  npStrategyTotal: 'text=/Total:\\s*\\d+/',
  npNoStrategies: '*:text-is("No strategies yet")',
  npNewStrategyDialog: '[role="dialog"]:has-text("New Pricing Strategy")',
  npDlgStrategyName: '#new-strategy-name',

  npSourceRow: '[draggable="true"]',
  npSearchProductGroups: 'input[placeholder="Search ID or Name..."]',
  npDetailGrid: 'table',

  npSaveDialog: '[role="alertdialog"]',
} as const;
