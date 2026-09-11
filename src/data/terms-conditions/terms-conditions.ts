/**
 * Test data for the Terms and Conditions setup page.
 *
 * Values read from live page on office 1604 (2026-08-06) or constructed for boundary checks.
 */

/** Office used for these tests. */
export const TNC_OFFICE = '1604';

/** Page-level language filter options, in display order (5 items including All). */
export const TNC_FILTER_LANGUAGES = [
  'All',
  'English (Canada)',
  'US English',
  'Spanish (Mexico)',
  'French (Canada)',
] as const;

/** Per-row language options (4 items, no All). */
export const TNC_ROW_LANGUAGES = [
  'English (Canada)',
  'US English',
  'Spanish (Mexico)',
  'French (Canada)',
] as const;

/** The default filter value on page load. */
export const TNC_DEFAULT_LANGUAGE = 'US English';

/**
 * Automation-owned fixture row for Terms and Conditions tests.
 *
 * Resolved by lookup-or-create: if the row is missing (renamed, re-languaged, deleted
 * upstream), the page object recreates it and verifies persistence after reload.
 * The name is stable across runs — no clock or random component — so a failed cleanup
 * never strands an unsearchable row.
 */
export const TNC_FIXTURE_ROW_NAME = 'ZZ-QA-TNC-Fixture';

/** Sentinel suffix appended to edits for traceability. */
export const TNC_EDIT_SENTINEL = '-AUTOTEST-' + Date.now().toString(36).slice(-6);

/** Special characters string proven to persist byte-exact. */
export const TNC_SPECIAL_CHARS_NAME = '< > & " \' / \\ % # Café Ñoño 中文';

/** A 260-character name (proven upper boundary). */
export const TNC_LONG_NAME_260 = 'A'.repeat(260);

/** A 50-character mid-length name. */
export const TNC_MID_NAME_50 = 'TNC-MidLength-' + 'X'.repeat(36);

/** Whitespace-only name (rejected by validation). */
export const TNC_WHITESPACE_NAME = '   ';

/** Greppable automation residue marker for rich-text round-trip verification. */
export const TNC_RTE_SENTINEL_PREFIX = 'ZZ-QA-TNC-RTE-RESIDUE-';

/** HTML entity test string typed into RTE. */
export const TNC_RTE_ENTITY_STRING = '&nbsp; &amp; < > <b>bold</b>';
