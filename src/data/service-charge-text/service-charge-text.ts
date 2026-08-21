/**
 * Test data for the Service Charge Text setup page.
 *
 * Every value below was read from the live page on office 1604 on 2026-08-03, or is a
 * deliberately constructed input for a boundary or negative check.
 */

/** Office used for these tests. The page content is the same on every office checked. */
export const SCT_OFFICE = '1604';

/** Page level language filter options, in the order the list presents them. */
export const SCT_FILTER_LANGUAGES = [
  'All',
  'English (Canada)',
  'US English',
  'Spanish (Mexico)',
  'French (Canada)',
] as const;

/** The filter value the page starts on. */
export const SCT_DEFAULT_LANGUAGE = 'US English';

/**
 * Grid column headers, in display order.
 * Note the last column reads "Service Charge Text" on the page. The written requirement calls
 * that column "HTML Display Text"; the page is the source of truth for this assertion.
 */
export const SCT_COLUMN_HEADERS = [
  'Language',
  'Service Charge Name',
  'Service Charge Display Name',
  'Report Column Name',
  'Service Charge Text',
] as const;

/** Service Charge Name of the first row. Used as the source value for duplicate checks. */
export const SCT_FIRST_ROW_NAME = 'Service Charge';

/** Values used when completing a new row. Prefixed so they sort last and are easy to spot. */
export const SCT_NEW_ROW = {
  name: 'ZZ Automation Check Name',
  displayName: 'ZZ Automation Check Display',
  reportColumn: 'ZZ Automation Check Column',
} as const;

/** A name containing punctuation and accented characters, to check the value is preserved. */
export const SCT_SPECIAL_CHARS_NAME = "ZZ Café & Co. (Service) - 50%";

/** Only spaces. Should be treated the same as an empty required field. */
export const SCT_WHITESPACE_NAME = '     ';

/** 300 characters. The page enforces no maximum length, so the whole value is accepted. */
export const SCT_LONG_NAME = 'X'.repeat(300);

/**
 * The keys present in every row object that the Save request sends to the server.
 * Tests assert that the payload matches this shape.
 */
export const SCT_SAVE_PAYLOAD_ROW_KEYS = [
  'serviceChargeTextId',
  'serviceChargeName',
  'serviceChargeDisplayName',
  'reportColumnName',
  'languageId',
  'displayText',
  'htmlDisplayText',
] as const;

/**
 * Suffix appended to a field value during reversible edit tests so the modified value is
 * clearly distinct from the original and can be detected in the save payload.
 */
export const SCT_EDIT_SENTINEL_SUFFIX = ' [auto]';
