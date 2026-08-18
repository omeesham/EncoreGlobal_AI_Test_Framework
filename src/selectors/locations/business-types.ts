/**
 * Setup > Location > Business Types sub-tab.
 *
 * Checkbox test ids are POSITIONAL (`...-business-type-1` .. `-10`), not label-bearing, so the id
 * alone cannot tell you which business type it points at. If the server-side catalog is ever
 * reordered or a type is inserted, a hardcoded index silently targets a different row. Two
 * defences are therefore used together:
 *   1. the index -> label pairing lives in the data file and is asserted by the render test, so a
 *      reorder fails loudly instead of testing the wrong row;
 *   2. `chkBusinessTypesAll` is a prefix locator, so the rendered count is derived from the page
 *      rather than hardcoded in a spec body.
 *
 * Save is shared by the whole Location Settings page (there is no per-tab Save button), so the
 * page-level save button and the shared confirm dialog are reused rather than redeclared here.
 */
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
