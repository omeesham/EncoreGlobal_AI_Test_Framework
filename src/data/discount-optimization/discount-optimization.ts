/**
 * Test data for the Discount Optimization setup page — Locations tab (Tab 1).
 *
 * Values sourced from the live walk of office 1604 on 2026-08-11.
 */

/** Office used for these tests. */
export const DOP_OFFICE = '1604';

/** Known location number that returns at least one filtered result. */
export const DOP_KNOWN_FILTER = '2050';

/** Search string guaranteed to match zero locations. */
export const DOP_NO_MATCH_FILTER = 'ZZZZNOTAPLACE';

/**
 * Stable location row used for toggle, date, and remove interactions.
 * "The Abbey Resort" is enumerated in the live grid and is unlikely to be removed.
 */
export const DOP_LOCATION_FOR_TOGGLE = 'The Abbey Resort';

/**
 * Dedicated row for the save-persistence tests (TC-DOP-OPT-050, TC-DOP-OPT-052,
 * TC-DOP-OPT-053, TC-DOP-OPT-092).
 *
 * Originally "InterContinental Chicago" (ID 1121, per the live walk on 2026-08-11), but a
 * live diagnostic probe on 2026-08-26 confirmed that row no longer exists anywhere in the
 * dataset (the full grid — confirmed by scrolling to the end — has only 50 rows, none of
 * them containing "Chicago" or ID 1121). Replaced with "Hotel del Coronado" (ID 1137),
 * confirmed present in the current dataset and not referenced by any other test constant.
 */
export const DOP_LOCATION_FOR_PERSISTENCE = 'Hotel del Coronado';

/** Lowercase fragment for case-insensitive search test. */
export const DOP_CASE_INSENSITIVE_FILTER = 'abbey';

/** Fragment that matches deactivated location rows (NM-3210). */
export const DOP_DEACTIVATED_FRAGMENT = 'Deactivat';

/** Fragment that matches the known deactivated row "Sheraton Stamford Hotel deactivat". */
export const DOP_DEACTIVATED_ROW_FRAGMENT = 'Sheraton Stamford';

/** Valid date for Special Rate Start Date field (MM/DD/YYYY). */
export const DOP_DATE_VALID = '09/09/2019';

/** Invalid date for validation boundary test. */
export const DOP_DATE_INVALID = '13/40/2019';

/** Digit sequence typed one character at a time for NM-3067 regression (pressSequentially). */
export const DOP_DATE_DIGITS = '09092019';

/** Expected field value after pressing DOP_DATE_DIGITS sequentially. */
export const DOP_DATE_DIGITS_EXPECTED = '09/09/2019';
