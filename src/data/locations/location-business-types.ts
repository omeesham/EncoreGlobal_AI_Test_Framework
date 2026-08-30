// Labels are catalog-driven and the same for every office, but `checked` is per-office: these
// values are office 1604's and must be re-read before being used for another office.
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

// Save assertions must filter on this path: one save also fires several framework POSTs to the
// page address itself, any of which a page-address match would read as a successful save.
export const businessTypesSaveEndpoint = (officeNo: string): string =>
  `/navigator/api/location/${officeNo}/businesstypes`;

/** Per-checkbox save-cycle cases: toggle away from the office default, save, reload, verify, restore. */
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
