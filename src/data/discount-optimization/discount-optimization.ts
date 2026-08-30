// Test data for the Discount Optimization Locations tab, sourced from office 1604's live grid.

/** Office used for these tests. */
export const DOP_OFFICE = '1604';

/** Known location number that returns at least one filtered result. */
export const DOP_KNOWN_FILTER = '2050';

/** Search string guaranteed to match zero locations. */
export const DOP_NO_MATCH_FILTER = 'ZZZZNOTAPLACE';

/** Stable row for toggle, date, and remove interactions. */
export const DOP_LOCATION_FOR_TOGGLE = 'The Abbey Resort';

// Row reserved for the save-persistence tests; must stay distinct from DOP_LOCATION_FOR_TOGGLE
// and from any row those tests pick dynamically.
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
