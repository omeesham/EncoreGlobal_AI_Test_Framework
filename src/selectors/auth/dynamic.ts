export const DynamicSelectors = {
  lnkOfficeCode: (officeCode: string) => `a:has-text("${officeCode}")`,

 // Grid checkboxes are Radix button[role="checkbox"], not native input[type="checkbox"].
 // Date cells use input[data-slot="input"], not direct <button>.
  rowPriceBook: (priceBookName: string) => `tr:has(td:has-text("${priceBookName}"))`,
  chkIsAlternative: (priceBookName: string) => `tr:has(td:has-text("${priceBookName}")) td:nth-child(4) button[role="checkbox"]`,
  chkUseEffectiveDate: (priceBookName: string) => `tr:has(td:has-text("${priceBookName}")) td:nth-child(5) button[role="checkbox"]`,
  dtpStartDate: (priceBookName: string) => `tr:has(td:has-text("${priceBookName}")) td:nth-child(6) input[data-slot="input"]`,
  dtpEndDate: (priceBookName: string) => `tr:has(td:has-text("${priceBookName}")) td:nth-child(7) input[data-slot="input"]`,

  optCurrencyFilter: (currency: string) => `[role="listbox"] [role="option"]:has-text("${currency}")`,

 // Auto Add-On tab selectors are static (data-testid based) and live in
 // src/selectors/locations/auto-addon.ts — none are parameterized, so none belong in this file.
} as const;
