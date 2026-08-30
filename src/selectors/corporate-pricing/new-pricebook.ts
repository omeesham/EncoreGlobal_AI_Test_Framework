// Key prefix `np` avoids collision with the other Corporate Pricing partitions.
// Tabs and btnSaveDetails are not redefined here — reused from the Details shell partition.
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
