// Location Settings History tab (NM-854). Every value below is CONFIRMED LIVE against office
// 1604 - Parker Palm Springs on the E2E environment with account s-prd-clickauto@psav.com.

export const HISTORY_COMBOBOX = {
  default: 'Location Management History',
  options: ['Location Management History', 'Location Management Legacy History'] as const,
} as const;

// Tab strip order for Local Office Settings, confirmed live.
export const LOCAL_OFFICE_TAB_ORDER = [
  'Basic Information',
  'Location Settings History',
  'ECT Settings',
] as const;

// The empty-state copy the grid renders when the API returns no records.
export const HISTORY_EMPTY_STATE_TEXT = 'No results.';

export const HISTORY_SORT_COLUMN = 'Modified On';
export const HISTORY_AUDIT_USER_COLUMN = 'Modified By';

/**
 * The grid's confirmed DEFAULT sort on a fresh load: Modified On, descending (newest first).
 *
 * This answers the requirement doc's open question 4, which NM-854 left unspecified. Confirmed by
 * reading the pristine header icons - exactly one column carried a directional arrow before any
 * sort was applied, and it was Modified On with `lucide-arrow-down`; re-applying "Sort descending"
 * to that column changed nothing.
 */
export const HISTORY_DEFAULT_SORT = { column: 'Modified On', direction: 'descending' } as const;

/**
 * How the grid communicates sort state: a lucide icon inside the header's sort button.
 *
 * IMPORTANT - these are matched as EXACT class tokens, never as substrings: the neutral token
 * `lucide-arrow-up-down` CONTAINS the string `lucide-arrow-up`, so substring matching would report
 * every unsorted column as sorted ascending.
 *
 * A non-sortable column's header carries no svg at all (4 of the 42 columns).
 */
export const HISTORY_SORT_ICONS = {
  ascending: 'lucide-arrow-up',
  descending: 'lucide-arrow-down',
  neutral: 'lucide-arrow-up-down',
} as const;

/**
 * The complete, ordered live column set for office 1604 - all 42 headers, in render order.
 *
 * This replaces the case-insensitive subset matching the plan originally shipped with: the first
 * live run recorded the exact translated labels, so column coverage is now asserted as an exact
 * ordered equality, which is strictly stronger. NM-854's raw field keys map onto these labels with
 * several shortenings ("Print Desc" for PrintDescription, "Use Sect." for UseDefaultSection,
 * "Use On Rental" for UseOnRODRO, "Action" for LocSettingsAction) and two DELIBERATE FOLDS noted in
 * HISTORY_FOLDED_FIELDS below.
 */
export const HISTORY_ALL_COLUMNS_IN_ORDER = [
  'Local Office',
  'Prep Date Offset',
  'Return Date Offset',
  'Set Date Offset',
  'Strike Date Offset',
  'Pickup Date Offset',
  'Delivery Date Offset',
  'Use Fulfillment',
  'Use Availability',
  'Use Equipment QC',
  'Print Desc',
  'Use Subrent',
  'Phone1',
  'Phone2',
  'Use Sect.',
  'Section Name',
  'Sect. Action',
  'Logo Name',
  'Use On Quote',
  'Use On Rental',
  'Service Type - Exempt',
  'ST Action',
  'Action',
  'Notes',
  'Marriott PMS Account Enabled',
  'Default Job to 1 day for Event Orders',
  'Default Job to 1 day for Outside Orders',
  'Default Job to 1 day for Internal Orders',
  'Default Labor to Hourly',
  'Allow tentative and confirmed Status to have the same priority',
  'Items Filled from Requests Return to Availability',
  'Default Order Type',
  'Regular Hours',
  'Regular Hours Multiplier',
  'Over Time Hours',
  'OverTime Hours Multiplier',
  'Double Time Hours',
  'DoubleTime Hours Multiplier',
  'Holiday Multiplier',
  'Recalc Labor Hours',
  'Modified By',
  'Modified On',
] as const;

/**
 * NM-854 fields that have NO column of their own because the grid folds them into a
 * pipe-delimited composite cell. Confirmed live, and recorded here so the column-coverage
 * scenarios do not chase a column that is not missing - it simply is not separate.
 *
 *   SectionIsActive  -> folded into "Section Name"          e.g. "AV Services - true | Hybrid Meeting - true | ..."
 *   ServiceTypeName  -> folded into "Service Type - Exempt" e.g. "APP Downloaded - true | App Quality Assurance - false | ..."
 *   STExempt         -> folded into "Service Type - Exempt" (the boolean half of each pair)
 */
export const HISTORY_FOLDED_FIELDS = {
  'Section Name': ['SectionName', 'SectionIsActive'],
  'Service Type - Exempt': ['ServiceTypeName', 'STExempt'],
} as const;

/** NM-854's tracked dataset, grouped exactly as the acceptance criteria group it, using the
 *  CONFIRMED LIVE labels. The six groups together are exactly HISTORY_ALL_COLUMNS_IN_ORDER. */
export const HISTORY_EXPECTED_COLUMNS = {
  identifiersAndOffsets: [
    'Local Office', 'Prep Date Offset', 'Return Date Offset', 'Set Date Offset',
    'Strike Date Offset', 'Pickup Date Offset', 'Delivery Date Offset',
  ],
  // All 16 of NM-854's booleans are present; every one renders as a check glyph or a blank.
  featureToggles: [
    'Use Fulfillment', 'Use Availability', 'Use Equipment QC', 'Print Desc', 'Use Subrent',
    'Use Sect.', 'Use On Quote', 'Use On Rental', 'Marriott PMS Account Enabled',
    'Default Job to 1 day for Event Orders', 'Default Job to 1 day for Outside Orders',
    'Default Job to 1 day for Internal Orders', 'Default Labor to Hourly',
    'Allow tentative and confirmed Status to have the same priority',
    'Items Filled from Requests Return to Availability', 'Recalc Labor Hours',
  ],
  // SectionIsActive is folded into Section Name — see HISTORY_FOLDED_FIELDS.
  contactAndSection: ['Phone1', 'Phone2', 'Section Name', 'Sect. Action'],
  // ServiceTypeName and STExempt are folded into "Service Type - Exempt".
  serviceAndTax: ['Service Type - Exempt', 'ST Action', 'Default Order Type'],
  brandingAndAudit: ['Logo Name', 'Action', 'Notes', 'Modified By', 'Modified On'],
  laborSettings: [
    'Regular Hours', 'Regular Hours Multiplier', 'Over Time Hours', 'OverTime Hours Multiplier',
    'Double Time Hours', 'DoubleTime Hours Multiplier', 'Holiday Multiplier',
  ],
} as const;

/**
 * Columns CONFIRMED to vary across the FULL history, established by sorting each one both ways and
 * reading the top cell — which yields its min and max over all records, not just page 1.
 *
 * This matters because page 1 is uniform by nature: consecutive history rows are near-identical
 * configuration snapshots, so a scenario that looks for variation BEFORE sorting finds none and
 * skips. Sorting first is what surfaces the extremes.
 *
 * Confirmed constant across all history (unusable for an ordering assertion): Prep Date Offset (0),
 * Regular Hours (24), Regular Hours Multiplier (1), OverTime Hours Multiplier (1.5),
 * Holiday Multiplier (0), Recalc Labor Hours (always unset).
 */
export const HISTORY_NUMERIC_SORT_COLUMN = { column: 'Return Date Offset', min: 0, max: 2 } as const;
export const HISTORY_BOOLEAN_SORT_COLUMN = { column: 'Use Fulfillment' } as const;

// The NM-854 defect this suite exists to guard. Confirmed PRESENT live (value "0" on office 1604).
export const HISTORY_HOLIDAY_MULTIPLIER_COLUMN = 'Holiday Multiplier';

// Live count is 42. Kept as a floor for the "collapsed header row" case rather than an equality,
// because HISTORY_ALL_COLUMNS_IN_ORDER now carries the exact assertion.
export const HISTORY_MIN_COLUMN_COUNT = 20;

// Confirmed live: 20 data rows per page by default, 135 pages for office 1604.
export const HISTORY_DEFAULT_PAGE_SIZE = 20;

// Strings that must never reach a rendered cell — a leaked placeholder for a missing value.
export const HISTORY_FORBIDDEN_CELL_TEXT = [
  'null', 'undefined', 'NaN', 'Invalid Date', '[object Object]',
] as const;

// A boolean column renders a lucide-check SVG for true and nothing for false, so any of these
// as literal cell text is a formatting regression.
export const HISTORY_FORBIDDEN_BOOLEAN_TEXT = ['true', 'false', 'True', 'False'] as const;

// Confirmed live format, e.g. "09/08/2026 04:38:35 PM".
export const HISTORY_MODIFIED_ON_PATTERN = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} (AM|PM)$/;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A raw, untranslated field key: two or more words run together with no separator
// (HolidayMultiplier, modUser). Deliberately requires a lower-to-upper transition across the
// WHOLE string, so the live labels "Phone1" (digit), "OverTime Hours Multiplier" (spaced) and
// "DoubleTime Hours Multiplier" (spaced) correctly do NOT trip it.
export const RAW_FIELD_KEY_PATTERN = /^[A-Za-z]*[a-z][A-Z][A-Za-z]*$/;

// Untranslated i18n output: a surviving interpolation or a dotted key path.
export const I18N_PLACEHOLDER_PATTERNS = [/\{\{/, /\}\}/, /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+){2,}$/];

// Matched by regex, not an exact path: NM-854 does not publish the endpoint. Narrow this once
// TC-LOE-HIST-020's attached request URLs identify the real route.
export const HISTORY_API_URL_PATTERN = /histor/i;

export const HISTORY_MOCK = {
  // 2,000 characters with no break opportunity — the worst case for a table that must scroll
  // inside its own container rather than widening the page.
  longNotes: 'N'.repeat(2000),
  viewports: [
    { width: 1366, height: 768, label: '1366x768' },
    { width: 1280, height: 720, label: '1280x720' },
  ],
  defaultViewport: { width: 1920, height: 1080 },
} as const;

// The Basic Information field the integration scenario dirties. Phone 2 is the safest choice in
// the whole form: NM-1715 confirmed it is optional, unvalidated free text with no cross-field
// rule, so an edit can never be rejected and a restore can never be blocked. NOTE the history
// grid labels the column "Phone2" (no space), unlike the form's "Phone 2" label.
export const HISTORY_INTEGRATION_FIELD = {
  key: 'txtPhone2',
  column: 'Phone2',
  probeValue: '555-000-2222',
  altProbeValue: '555-000-3333',
} as const;

/**
 * The exact 4 columns with no sort control, confirmed live. NM-854 requires every column "marked
 * sortable" to sort, so the durable assertion is the SET of exceptions, not a count bound: three
 * are unsortable for a structural reason (the two pipe-delimited composites and free-text Notes)
 * and Local Office is constant for a single office.
 */
export const HISTORY_NON_SORTABLE_COLUMNS = [
  'Local Office', 'Section Name', 'Service Type - Exempt', 'Notes',
] as const;

/** Confirmed live: default 20, options 10/20/30/40/50. */
export const HISTORY_ROWS_PER_PAGE = {
  default: '20',
  options: ['10', '20', '30', '40', '50'] as const,
} as const;

/** The two composite columns and the shape of their folded values. */
export const HISTORY_COMPOSITE_COLUMNS = ['Section Name', 'Service Type - Exempt'] as const;

/**
 * The Legacy history type renders a SEPARATE grid, confirmed live: its own container and table
 * testids, 44 columns rather than the standard view's 42, and 1 row for office 1604.
 */
export const HISTORY_LEGACY = {
  type: 'Location Management Legacy History',
  standardType: 'Location Management History',
  columnCount: 44,
} as const;
export const HISTORY_COMPOSITE_FLAGS = ['true', 'false'] as const;

/**
 * Page-box behaviour, CONFIRMED LIVE.
 *
 * The contract is REVERT TO THE CURRENT PAGE, not "reset to page 1". Every probe in the first
 * discovery pass happened to start from page 1, which made revert-to-current look like
 * reset-to-1; typing 136 while on page 135 reverts to 135, which is what corrected the model.
 * The box is type="text" with inputmode="numeric" and pattern="[0-9]*" and declares no min, max
 * or maxLength, so digits-only filtering is native and all range handling is app logic.
 */
export const HISTORY_PAGE_INPUT_REJECTED = [
  { typed: '0', note: 'zero is not a valid page' },
  { typed: '-1', note: 'the minus sign is filtered by pattern="[0-9]*"' },
  { typed: 'abc', note: 'non-numeric text is filtered by pattern="[0-9]*"' },
  { typed: '99999', note: 'far beyond the last page' },
] as const;

/**
 * One-past-the-last-page is NOT a literal here on purpose.
 *
 * The scenarios derive it from the live page count at runtime. A hardcoded "136" is only out of
 * range while the grid is in its default state, and the first full sequential run proved the
 * hazard: with the panel left in the legacy view by a failing TC-036, 136 was reachable, so the
 * value navigated and TC-037 failed with Expected "1", Received "136".
 */
export const HISTORY_PAGE_ONE_PAST_END_NOTE = 'one past the last page, derived from the live total';

/** Values the box accepts and navigates to. */
export const HISTORY_PAGE_INPUT_ACCEPTED = [
  { typed: '007', expected: '7', note: 'leading zeros are normalised' },
  { typed: '3', expected: '3', note: 'a plain valid page number' },
] as const;

/**
 * DEFECT: a decimal has its separator stripped and its digits concatenated, so "2.5" navigates to
 * page 25 rather than page 2 or a rejection. Asserted against the live behaviour on purpose so a
 * fix flips the test red and the expectation is updated rather than the case deleted.
 */
export const HISTORY_PAGE_INPUT_DECIMAL_DEFECT = { typed: '2.5', observed: '25' } as const;

export const AUTOMATION_USER = 's-prd-clickauto@psav.com';
