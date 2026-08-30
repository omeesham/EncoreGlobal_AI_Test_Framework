// Checkbox testids are positional, not label-bearing, so a catalog reorder would silently point
// these at different rows — the index-to-label pairing is asserted by the render test.
export const SetupBusinessTypesSelectors = {
  tabBusinessTypes: '[data-testid="location-settings-sub-tab-business-types"]',

  contentBusinessTypes: '[data-testid="location-settings-sub-tab-content-business-types"]',
  formBusinessTypes: '[data-testid="location-settings-form-business-types"]',

  chkBusinessTypeAudioVisual: '[data-testid="location-settings-checkbox-business-type-1"]',
  chkBusinessTypeBusinessCenterRentals: '[data-testid="location-settings-checkbox-business-type-2"]',
  chkBusinessTypeBusinessCenterServices: '[data-testid="location-settings-checkbox-business-type-3"]',
  chkBusinessTypeElectricalServices: '[data-testid="location-settings-checkbox-business-type-4"]',
  chkBusinessTypeProduction: '[data-testid="location-settings-checkbox-business-type-5"]',
  chkBusinessTypeExpoServices: '[data-testid="location-settings-checkbox-business-type-6"]',
  chkBusinessTypeInHouse: '[data-testid="location-settings-checkbox-business-type-7"]',
  chkBusinessTypeIntegratedSolutions: '[data-testid="location-settings-checkbox-business-type-8"]',
  chkBusinessTypeInternetServices: '[data-testid="location-settings-checkbox-business-type-9"]',
  chkBusinessTypeRiggingServices: '[data-testid="location-settings-checkbox-business-type-10"]',

  /** Prefix locator — count comes from the page, never from a literal in a spec. */
  chkBusinessTypesAll: '[data-testid^="location-settings-checkbox-business-type-"]',
} as const;
