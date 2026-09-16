export const CorporatePricingDetailsSelectors = {
  hdgDetails: 'h1:text-is("Corporate Pricing Details")',
  lnkBackToSearch: 'a:has-text("Corporate Pricing")',

  tabPricingStrategy: 'button:has-text("Pricing Strategy")',
  tabPricingDetail: 'button:has-text("Pricing Detail")',

  btnSaveDetails: 'button:text-is("Save")',

  hdgPricebookName: 'h2',
  lblHeaderType: 'p:text-is("Labor/Equipment") + p, *:has(> *:text-is("Labor/Equipment"))',
  lblHeaderYear: 'p:text-is("Year") + p, *:has(> *:text-is("Year"))',
  lblHeaderCurrency: '*:has(> *:text-is("Currency"))',
  lblRecordStatus: 'text=/^(Active|Inactive)$/',
} as const;
