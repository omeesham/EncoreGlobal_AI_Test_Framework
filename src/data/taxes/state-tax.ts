// Test data for Tax → State Tax (NM-4023, feature epic NM-889).
//
// State tax configurations are effective-dated and insert-only: Save adds a version, nothing in the UI can
// remove one, and they feed live tax calculation. So the suite never lets a save reach the server (every Save
// is held at the network), and the as-of / range cases derive their boundaries from the stored history.
// Live layout audited on e2e 2026-11-05 (office 1101).

// The calendar helpers are shared with Sales Tax — same pickers, same wire format, same business timezone.
export { todayIso, addDays, toUiDate, fromUiDate, toUiDateTime, wireDate } from './sales-tax';

// ---------------------------------------------------------------- route & office

export const STX_OFFICE = process.env.STX_OFFICE ?? '1101';

export const STX_PATH = (office: string): string => `locations/${office}/taxes/state-tax`;

export const STX_PAGE_TITLE = 'State Tax';

export const STX_TABS = { basic: 'Basic Information', history: 'State Tax History' } as const;

/** Grid columns in display order — identical on both tabs (NM-4023 §3.2, §4.2). */
export const STX_COLUMNS = [
  'State', 'Tax Type', 'Flat Rate', 'Taxable Percentage', 'Effective Date', 'End Date', 'Notes', 'Modified By', 'Modified On',
] as const;

export type StxColumn = (typeof STX_COLUMNS)[number];

export const STX_READONLY_COLUMNS: StxColumn[] = ['State', 'Tax Type', 'Modified By', 'Modified On'];
export const STX_EDITABLE_COLUMNS: StxColumn[] = ['Flat Rate', 'Taxable Percentage', 'Effective Date', 'Notes'];

/** The Rate/Percentage filter options. NM-4023 §3.1 also lists "Either"; the build has none (BUG-TAX-STX-005 dropped 2026-11-05). */
export const STX_RATE_FILTER_OPTIONS = ['All', 'Flat Rate', 'Taxable Percentage'] as const;

// ---------------------------------------------------------------- search fixtures (e2e 2026-11-05)

/**
 * A state whose 40 configurations all sit on the 2000-01-01 baseline with zero rates and no End Date — the edit
 * fixture. IN, not IL: a manual save on 2026-11-05 gave IL / APP Downloaded a new version with an End Date.
 */
export const STX_EDIT_STATE = process.env.STX_EDIT_STATE ?? 'IN';

/** The state holding every Flat Rate record (10 × 0.01, versions 2018-12-01 and 2019-02-28). */
export const STX_FLAT_STATE = process.env.STX_FLAT_STATE ?? 'CT';

/** The only Taxable Percentage record (0.8, effective 2018-12-01). */
export const STX_PCT_RECORD = { state: process.env.STX_PCT_STATE ?? 'TX', taxType: process.env.STX_PCT_TAX_TYPE ?? 'App Remote Access' } as const;

/** A CT configuration with a later version (2019-02-28) over the baseline — the as-of fixture. */
export const STX_VERSIONED = { state: STX_FLAT_STATE, taxType: process.env.STX_VERSIONED_TAX_TYPE ?? 'App Quality Assurance' } as const;

export const STX_TAX_TYPE = process.env.STX_TAX_TYPE ?? 'Rental';

/** A History range around the CT versions — wide enough for several rows, narrow enough for one page. */
export const STX_HISTORY_RANGE = { start: '2018-11-01', end: '2019-03-31' } as const;

/** Before the earliest version any configuration holds. */
export const STX_BEFORE_ALL_VERSIONS = '1999-06-01';

// ---------------------------------------------------------------- copy

export const STX_MESSAGES = {
  recordsFound: /(\d+)\s+records? found/i,
  promptBasic: 'Select criteria and click Search to view state tax records.',
  promptHistory: 'Select criteria and click Search to view state tax history records.',
  emptyHistory: 'No state tax history records found',
  saveFailed: 'Failed to save state tax',
  // The shared location-settings dialog — accepted in place of NM-2374's "Searching will cause you to lose
  // unsaved changes. Continue?" (same decision as International Tax Setup, BUG-TAX-IST-002 dropped 2026-10-26).
  unsavedChangesTitle: 'Unsaved changes',
} as const;

// ---------------------------------------------------------------- input contract

/** Notes length bound. NM-4023 §3.2 says 250; the build allows 500 (BUG-TAX-STX-007 dropped 2026-11-05). */
export const STX_NOTES_MAX = 500;

/** Rate inputs and what the cell must show after leaving it. Rates are stored as fractions to 6 places. */
export const STX_RATE_BOUNDARIES = [
  { label: 'negative Flat Rate is not accepted', column: 'Flat Rate', typed: '-1', shown: '0.000000' },
  { label: 'negative Taxable Percentage is not accepted', column: 'Taxable Percentage', typed: '-1', shown: '0.000000' },
  { label: 'Taxable Percentage above 100% is capped', column: 'Taxable Percentage', typed: '101', shown: '1.000000' },
  { label: 'letters are not accepted', column: 'Flat Rate', typed: 'abc', shown: '0.000000' },
  { label: 'more than 6 decimals are rounded', column: 'Flat Rate', typed: '0.123456789', shown: '0.123457' },
] as const;

export const STX_HOSTILE_NOTES = [
  { label: 'script tag', typed: '<script>window.__stxXss=1</script>' },
  { label: 'image onerror', typed: '<img src=x onerror="window.__stxXss=1">' },
] as const;

export const STX_INVALID_DATES = ['13/45/2026', '02/30/2026', 'abc'] as const;

export const STX_LOAD_BUDGET_MS = 30_000;

export const STX_VIEWPORTS = [
  { label: 'laptop 1366×768', width: 1366, height: 768 },
  { label: 'tablet 1024×768', width: 1024, height: 768 },
] as const;
