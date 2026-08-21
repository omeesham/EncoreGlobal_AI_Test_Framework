export const VENUE_DISPLAY_FIELDS = [
  { label: 'City', expected: 'WEST HOLLYWOOD' },
  { label: 'State', expected: 'CA' },
  { label: 'Zip', expected: '90048' },
  { label: 'Country', expected: 'United States' },
] as const;

export const MASTER_DISPLAY_FIELDS = [
  { label: 'City', expected: 'WEST HOLLYWOOD' },
  { label: 'State', expected: 'CA' },
  { label: 'Zip', expected: '90048' },
  { label: 'Country', expected: 'United States' },
] as const;

export const VENUE_NAME = 'Parker Palm Springs';

export const PHONE1_BASELINE = '760-883-1957';

export const ACCOUNT_SEARCH = { term: 'Parker', expectedResult: 'Parker Palm Springs' };

export const ACCOUNT_NUMBER_SEARCH = { number: 'AC000107', expectedResult: 'Parker Palm Springs' };

export const ADDRESS_SEARCH = { filterTerm: 'Beverly', expectedMatch: 'Beverly', totalRows: 7 };

export const TEST_PHONE2_VALUE = '555-000-0001';

export const ACCOUNT_TEST_PHONE = '111-222-3333';

/**
 * Dedicated per-test baseline value for Phone 2. Distinct from both TEST_PHONE2_VALUE and
 * ACCOUNT_TEST_PHONE and filled by no test, so the per-test reset always lands on a value that
 * every test's own fill genuinely changes (Save reliably enables — no net-zero stall). Non-empty
 * on purpose: clearing Phone 2 to empty does not persist, so the baseline never sets it empty.
 */
export const PHONE2_BASELINE = '760-000-0002';

export const ACCOUNT_LIST_FILTERS = {
  address: 'Beverly',
  addressExpected: 'Beverly',
  city: 'LOS ANGELES',
  cityExpected: 'LOS ANGELES',
} as const;

export const ALT_ADDRESS = {
  city: 'PALM SPRINGS',
  zip: '92264',
  address1: '4200 E Palm Canyon Dr',
} as const;

export const ORIGINAL_ADDRESS = {
  city: 'WEST HOLLYWOOD',
  zip: '90048',
  address1: '8899 Beverly Blvd Ste 412',
} as const;

/**
 * Master Bill To Address original (office 1604) — the restore anchor for the Master launcher
 * persistence save-cycle test. Captured BEFORE any change.
 * The Master launcher's selection PERSISTS (unlike the Venue launcher), so the save-cycle
 * test MUST restore by re-selecting this unique address row.
 * Source: live verification 2026-06-11 (API id 8ad746d8-…).
 */
export const MASTER_BILL_TO_ORIGINAL = {
  address1: '8899 Beverly Blvd Ste 412',
  city: 'WEST HOLLYWOOD',
  state: 'CA',
  postalCode: '90048',
  country: 'United States',
} as const;
