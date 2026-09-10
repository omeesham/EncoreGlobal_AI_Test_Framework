export const LP_DEFAULTS = {
  office: '', // primary-location-no renders empty for 1604 (placeholder "No office available")
  localOffice: '1604',
  localOfficeName: 'Parker Palm Springs',
  active: true,
  liveDate: 'June 15th, 1990',
  taxMode: 'US',
  country: 'United States',
  region: 'Palm Springs',
  servicingBranch: 'Select Servicing Branch Office', // unselected placeholder (required, value=0)
  lineOfBusiness: 'Hotel Services Division', // read-only in edit mode (NM-831 / NM-1140)
  payToAddress: 'Encore',
  union: false,
} as const;

export const LP_BASELINE = {
  country: 'United States',
  taxMode: 'US',
  region: 'Palm Springs',
  localOfficeName: 'Parker Palm Springs',
  active: true,
  union: false,
} as const;

export const LP_DROPDOWN = {
  taxMode: ['US', 'International'] as const,
  country: ['United States', 'Mexico', 'Canada', 'Bahamas'] as const,
  // Large dropdowns — assert content + lower bound, NOT exact count. Live counts recorded
  // for the inventory only: Region 59, Servicing Branch 218.
  regionContains: 'Boston',
  regionLowerBound: 50,
  servicingBranchLowerBound: 200,
} as const;

/**
 * Pay To Address launcher constants (live 2026-06-11, office 1604).
 * The Pay To Address field is a launcher → "Pay To List" dialog. Selection persists
 * (`financial.payToId`). Restore is ID-anchored — the name "Encore" is AMBIGUOUS (IDs 1 & 4
 * both display "Encore"), so the name can never be a safe restore anchor — never name-anchor a restore.
 * Source: live field verification 2026-06-11 (launcher dialogs).
 */
export const PAY_TO_ORIGINAL = { id: 1, name: 'Encore' } as const;
export const PAY_TO_ALTERNATE = { id: 7, name: 'Encore Bahamas' } as const;

export const LP_TEST_VALUES = {
  localOfficeNameMaxLength: 255, // LIVE input maxlength (the spec doc claimed 50 — corrected against live; flagged to Encore)
  // 50 chars exactly (maxlength boundary).
  localOfficeName50: 'AAAAAAAAAABBBBBBBBBBCCCCCCCCCCDDDDDDDDDDEEEEEEEEEE',
  // ≤50, differs from default (save-persist test).
  localOfficeNamePersist: 'Parker Palm Springs QA',
  taxModeAlt: 'International', // save-persist test (US -> International -> US)
  regionAlt: 'Boston', // save-persist test (Palm Springs -> Boston -> Palm Springs)
  countryAlt: 'Canada', // cascade tests
} as const;
