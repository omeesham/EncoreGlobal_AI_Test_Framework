export const CorporatePricingStrategySelectors = {
  hdgPriceStrategies: '*:text-is("Price Strategies")',
  txtSearchStrategies: 'input[placeholder="Search strategies..."]',
  lblStrategyTotal: 'text=/Total:\\s*\\d+/',

  lblStrategyNameField: '*:text-is("Pricing Strategy")',

  hdgLocationsUsingDefault: '*:text-is("Locations Using Pricing As Default")',
  tblLocationsUsingDefault: 'table:has(th:text-is("Local Office"))',

  dlgNewStrategy: '[role="dialog"]:has-text("New Pricing Strategy")',
} as const;
