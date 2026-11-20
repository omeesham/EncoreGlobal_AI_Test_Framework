// Test data for Setup → Multiday Pricing Rules (NM-4129, feature epic NM-2413).
//
// The rules are GLOBAL — one rule set for every office (NM-2419: "must not be filtered by local
// office"). Any office shows the same grid; the office only decides whether it is editable.
// Measured on e2e 2026-10-07 with the shared automation user.

/** Corporate office: the automation user gets Save, Delete and inline editing here. */
export const MDP_EDIT_OFFICE = '1101';

/** A non-corporate office: the same user sees the grid read-only (no Save, Delete, inputs). */
export const MDP_READONLY_OFFICE = '2359';

export const MDP_PATH = (office: string): string => `locations/${office}/settings/multiday-pricing-rules`;

export const MDP_PAGE_TITLE = 'Multiday Pricing';

export const MDP_BROWSER_TITLE = 'Multiday Pricing | Navigator';

export const MDP_SERVICE_TYPE_HEADER = 'Service Type Name';

/** Day-column labels exactly as rendered — note the singular "1 Day". */
export const MDP_DAY_HEADERS: readonly string[] = Array.from({ length: 14 }, (_, i) =>
  i === 0 ? '1 Day' : `${i + 1} Days`,
);

/** Column IDs the grid uses internally (resize-handle aria-labels, localStorage settings). */
export const MDP_DAY_COLUMN_IDS: readonly string[] = Array.from({ length: 14 }, (_, i) => `day${i + 1}`);

/** localStorage key the grid persists column order / visibility / sizing under. */
export const MDP_TABLE_SETTINGS_KEY = 'multiday-pricing-rules-table-settings';

/** The fourteen job-day columns, 1 through 14. */
export const MDP_JOB_DAYS: readonly number[] = Array.from({ length: 14 }, (_, i) => i + 1);

/** What a new service type row defaults to once committed: billable = job days. */
export const MDP_NEW_ROW_DEFAULTS: readonly number[] = MDP_JOB_DAYS;

// ---------------------------------------------------------------- copy (resolved en-US i18n)

// The app's live copy differs from the NM-4129 document in several places (see the test plan's
// "Requirement vs implementation" table). Specs assert the live copy; deltas are listed there.
export const MDP_MESSAGES = {
  saveSuccess: 'Multiday pricing rules saved successfully.',
  saveFailed: 'Failed to save multiday pricing rules',
  rowDeleted: 'Row marked for deletion. It will be removed on Save.',
  emptyState: 'No multiday pricing rules found',
  itemsFound: 'items found',
  selectServiceTypeFirst: 'Select a Service Type first',
  deleteDialogTitle: 'Confirmation Notice',
  deleteDialogDescription: (serviceType: string): string => `Are you sure you want to delete ${serviceType} ?`,
  unsavedTitle: 'Unsaved changes',
  unsavedDescription: 'Are you sure you want to leave this view? Any unsaved changes will be lost.',
} as const;

/** Inline validation copy, keyed by the rule that fired. */
export const MDP_VALIDATION = {
  /** Column 1 reads "1 days" too — accepted wording (not a defect). */
  exceeds: (day: number): string => `Billable days cannot exceed ${day} days`,
  lessThanPrevious: (prev: number): string =>
    `Billable days must be greater than or equal to the previous day (${prev} days)`,
  greaterThanNext: 'Billable days must be less than or equal to the next day',
} as const;

// ---------------------------------------------------------------- dropdown eligibility

/** getAllServiceTypesAction flags that remove a service type from the Add dropdown. */
export const MDP_RESTRICTED_FLAGS = [
  'isLabor',
  'isFreight',
  'isConsumable',
  'isCableAndConsumable',
  'isServiceCharge',
  'isDamageWaiver',
] as const;

// Preferred service type for the add/delete persistence round trip — eligible and unconfigured on
// e2e at authoring time. The spec falls back to the first eligible option if it is ever configured.
export const MDP_ROUND_TRIP_SERVICE_TYPE = 'Misc Revenue';

// ---------------------------------------------------------------- input contract

/** Keystrokes the cell editor must swallow (its onChange only accepts /^\d*$/). */
export const MDP_REJECTED_INPUTS = [
  { label: 'minus sign', typed: '-' },
  { label: 'decimal point', typed: '.' },
  { label: 'letter', typed: 'a' },
  { label: 'plus sign', typed: '+' },
  { label: 'exponent', typed: 'e' },
  { label: 'space', typed: ' ' },
  { label: 'comma', typed: ',' },
  { label: 'script tag', typed: '<script>' },
] as const;

/** A digit string far past Number.MAX_SAFE_INTEGER — must be caught as "exceeds", never crash. */
export const MDP_OVERSIZED_DIGITS = '99999999999999999999';

/** Budget for first meaningful grid paint (measured ~3–12 s on e2e). */
export const MDP_LOAD_BUDGET_MS = 30_000;

/** Viewports for the layout checks. */
export const MDP_VIEWPORTS = [
  { label: 'laptop 1366×768', width: 1366, height: 768 },
  { label: 'tablet 1024×768', width: 1024, height: 768 },
] as const;
