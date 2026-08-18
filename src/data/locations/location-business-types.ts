/**
 * Business Types reference data for Setup > Location.
 *
 * The label list (order and text) is catalog-driven and identical across offices — confirmed by
 * reading a second office, which rendered the same ten labels in the same order. The CHECKED
 * state, by contrast, is per-office, so the defaults below are scoped to office 1604 and must not
 * be reused for another office without re-reading that office.
 *
 * Each entry pairs the positional checkbox key with the label rendered beside it. The render test
 * asserts that pairing, so a server-side catalog reorder fails loudly instead of quietly moving
 * every later assertion onto the wrong row.
 */
export const BUSINESS_TYPES_DEFAULTS = [
  { key: 'chkBusinessTypeAudioVisual', name: 'Audio Visual', checked: true },
  { key: 'chkBusinessTypeBusinessCenterRentals', name: 'Business Center Rentals', checked: true },
  { key: 'chkBusinessTypeBusinessCenterServices', name: 'Business Center Services', checked: true },
  { key: 'chkBusinessTypeElectricalServices', name: 'Electrical Services', checked: true },
  { key: 'chkBusinessTypeProduction', name: 'Production', checked: true },
  { key: 'chkBusinessTypeExpoServices', name: 'Expo Services', checked: false },
  { key: 'chkBusinessTypeInHouse', name: 'In-House', checked: false },
  { key: 'chkBusinessTypeIntegratedSolutions', name: 'Integrated Solutions', checked: false },
  { key: 'chkBusinessTypeInternetServices', name: 'Internet Services', checked: false },
  { key: 'chkBusinessTypeRiggingServices', name: 'Rigging Services', checked: false },
] as const;

/**
 * Builds the backend path the Save button hits for this tab. Save assertions filter on THIS path.
 *
 * Filtering on the page address instead would produce false positives: a single save was observed
 * firing four additional POST requests to the page address itself (framework render traffic), any
 * of which a page-address match would read as a successful save. Observed live for office 1604 as
 * `/navigator/api/location/1604/businesstypes`; parameterised by office so another office does not
 * silently match nothing.
 */
export const businessTypesSaveEndpoint = (officeNo: string): string =>
  `/navigator/api/location/${officeNo}/businesstypes`;

/**
 * Per-checkbox save-cycle cases: toggle away from the office default, save, reload, verify, restore.
 * Driven as one data loop rather than ten copied test bodies.
 */
export const BUSINESS_TYPES_SAVE_CYCLE_CASES = [
  { key: 'chkBusinessTypeAudioVisual', name: 'Audio Visual', tc: 'TC-LOC-BTY-003' },
  { key: 'chkBusinessTypeBusinessCenterRentals', name: 'Business Center Rentals', tc: 'TC-LOC-BTY-004' },
  { key: 'chkBusinessTypeBusinessCenterServices', name: 'Business Center Services', tc: 'TC-LOC-BTY-005' },
  { key: 'chkBusinessTypeElectricalServices', name: 'Electrical Services', tc: 'TC-LOC-BTY-006' },
  { key: 'chkBusinessTypeProduction', name: 'Production', tc: 'TC-LOC-BTY-007' },
  { key: 'chkBusinessTypeExpoServices', name: 'Expo Services', tc: 'TC-LOC-BTY-008' },
  { key: 'chkBusinessTypeInHouse', name: 'In-House', tc: 'TC-LOC-BTY-009' },
  { key: 'chkBusinessTypeIntegratedSolutions', name: 'Integrated Solutions', tc: 'TC-LOC-BTY-010' },
  { key: 'chkBusinessTypeInternetServices', name: 'Internet Services', tc: 'TC-LOC-BTY-011' },
  { key: 'chkBusinessTypeRiggingServices', name: 'Rigging Services', tc: 'TC-LOC-BTY-012' },
] as const;
