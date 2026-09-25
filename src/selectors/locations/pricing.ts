export const SetupPricingSelectors = {
  chkCorporatePricing: '[data-testid="location-settings-checkbox-corporate-pricing"]',
  chkPriceGuideInclusive: '[data-testid="location-settings-checkbox-price-guide-inclusion"]',
 // Net-new since the 2026-06-19 baseline; first observed live 2026-09-23. Standalone boolean —
 // no cascade, and NOT gated by Corporate Pricing.
  chkEnablePriceEscalator: '[data-testid="location-settings-checkbox-enable-price-escalator"]',
  drpCurrencyFilter: '[data-testid="location-settings-select-pricing-currency"]',
  btnSavePricing: '[data-testid="location-settings-btn-save"]',

 // Net-new since baseline. Collapses the settings region; pure view state, never dirties the form.
  btnToggleSettingsPanel: '[data-testid="location-settings-btn-toggle-settings-panel"]',
 // Net-new since baseline. No data-testid on the trigger, so anchor it inside the Pricing panel —
 // a bare text match would also hit other tabs' grids.
  btnPricingGridOptions: '[data-testid="location-settings-sub-tab-content-pricing"] button:has-text("Grid Options")',
 // The Pricing tabpanel itself — needed to scope panel-local reads away from the sibling
 // Basic Information tabpanel, which is simultaneously data-state="active".
  pnlPricingContent: '[data-testid="location-settings-sub-tab-content-pricing"]',

 // Office 1604 defaults to USD; the CAD/MXN keys below are unverified against the live DOM.
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
