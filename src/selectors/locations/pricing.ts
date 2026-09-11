export const SetupPricingSelectors = {
  chkCorporatePricing: '[data-testid="location-settings-checkbox-corporate-pricing"]',
  chkPriceGuideInclusive: '[data-testid="location-settings-checkbox-price-guide-inclusion"]',
  drpCurrencyFilter: '[data-testid="location-settings-select-pricing-currency"]',
  btnSavePricing: '[data-testid="location-settings-btn-save"]',

 // Office 1604 default currency is USD; only USD entries enumerated until live-DOM
 // verification confirms whether CAD/MXN dropdowns render. Add per-ccy variants when
 // a spec needs them and the testid is confirmed present.
  drpPrimaryLaborPricingUSD: '[data-testid="location-settings-select-primary-labor-pricing-usd"]',
  drpPrimaryEquipmentPricingUSD: '[data-testid="location-settings-select-primary-equipment-pricing-usd"]',
  drpPrimaryInternalEquipmentPricingUSD: '[data-testid="location-settings-select-primary-internal-equipment-pricing-usd"]',
  drpPrimaryProductionLaborPricingUSD: '[data-testid="location-settings-select-primary-production-labor-pricing-usd"]',
  drpPrimaryProductionEquipmentPricingUSD: '[data-testid="location-settings-select-primary-production-equipment-pricing-usd"]',

  drpPrimaryLaborPricingCAD: '[data-testid="location-settings-select-primary-labor-pricing-cad"]',
  drpPrimaryEquipmentPricingCAD: '[data-testid="location-settings-select-primary-equipment-pricing-cad"]',
  drpPrimaryInternalEquipmentPricingCAD: '[data-testid="location-settings-select-primary-internal-equipment-pricing-cad"]',
  drpPrimaryProductionLaborPricingCAD: '[data-testid="location-settings-select-primary-production-labor-pricing-cad"]',
  drpPrimaryProductionEquipmentPricingCAD: '[data-testid="location-settings-select-primary-production-equipment-pricing-cad"]',

  drpPrimaryLaborPricingMXN: '[data-testid="location-settings-select-primary-labor-pricing-mxn"]',
  drpPrimaryEquipmentPricingMXN: '[data-testid="location-settings-select-primary-equipment-pricing-mxn"]',
  drpPrimaryInternalEquipmentPricingMXN: '[data-testid="location-settings-select-primary-internal-equipment-pricing-mxn"]',
  drpPrimaryProductionLaborPricingMXN: '[data-testid="location-settings-select-primary-production-labor-pricing-mxn"]',
  drpPrimaryProductionEquipmentPricingMXN: '[data-testid="location-settings-select-primary-production-equipment-pricing-mxn"]',

  tblSecondaryPricingGrid: '[data-testid="location-settings-table-secondary-pricing"]',

  colHeaderPricingStrategy: '[data-testid="location-settings-table-pricing-col-pricing-strategy"]',
  colHeaderPricebook: '[data-testid="location-settings-table-pricing-col-pricebook"]',
  colHeaderCurrency: '[data-testid="location-settings-table-pricing-col-currency"]',
  colHeaderIsAlternative: '[data-testid="location-settings-table-pricing-col-is-alternate"]',
  colHeaderUseEffectiveDate: '[data-testid="location-settings-table-pricing-col-use-effective-dates"]',
  colHeaderStartDate: '[data-testid="location-settings-table-pricing-col-start-date"]',
  colHeaderEndDate: '[data-testid="location-settings-table-pricing-col-end-date"]',
} as const;
