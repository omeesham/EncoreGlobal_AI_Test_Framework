// Test data for Tax → International Tax Setup (NM-4025, feature epic NM-889).
//
// The configuration history is effective-dated and insert-only: Save adds a new version, it never
// updates one, and nothing in the UI can remove a version again. So the read-side cases derive their
// boundaries from whatever history the environment holds, and the write-side cases only run against
// a disposable fixture someone has explicitly named (IST_WRITE_FIXTURE + IST_ALLOW_WRITES=true).
// Values from the reference screenshot (40 records, 55 %, 22 %, 0.16 %) are examples, never asserted.

// ---------------------------------------------------------------- route & office

/** Office shown in the reference screenshot (Corporate Office). Not proof the feature is corporate-only. */
export const IST_OFFICE = process.env.IST_OFFICE ?? '1101';

/**
 * Route template. NM-2393 documents the normalised route /taxes/international-tax-setup; the location
 * prefix follows the rest of Navigator. Override with IST_ROUTE (use {office} as the placeholder)
 * once the deployed route is confirmed — the menu-entry case records the real one in its report.
 */
export const IST_ROUTE = process.env.IST_ROUTE ?? 'locations/{office}/taxes/international-tax-setup';

export const IST_PATH = (office: string): string => IST_ROUTE.replace('{office}', office);

export const IST_PAGE_TITLE = 'International Tax Setup';

/** Grid columns in display order (the selection checkbox column has no label). */
export const IST_COLUMNS = ['Tax Type', 'Rate', 'Province', 'Effective Date', 'Is Commission Taxable', 'Apply'] as const;

export type IstColumn = (typeof IST_COLUMNS)[number];

// ---------------------------------------------------------------- search fixtures

/** A search combination. A null field means "the first option offered" — data-agnostic. */
export interface SearchCriteria {
  country: string;
  taxGroup: string | null;
  province: string | null;
  /** ISO yyyy-mm-dd; null keeps whatever the form holds (the default is business today). */
  date?: string | null;
}

/** The screenshot's combination — the primary read-side fixture. */
export const IST_MEXICO: SearchCriteria = {
  country: process.env.IST_MEXICO_COUNTRY ?? 'Mexico',
  taxGroup: process.env.IST_MEXICO_TAX_GROUP ?? 'VAT',
  province: process.env.IST_MEXICO_PROVINCE ?? 'Baja California',
};

/** Second country for the all-country selection check (NM-2395 clarification: not Canada-only). */
export const IST_CANADA: SearchCriteria = {
  country: process.env.IST_CANADA_COUNTRY ?? 'Canada',
  taxGroup: process.env.IST_CANADA_TAX_GROUP ?? null,
  province: process.env.IST_CANADA_PROVINCE ?? null,
};

/**
 * Disposable configuration the @mutating cases may write to, as JSON:
 *   {"country":"Mexico","taxGroup":"VAT","province":"…","taxTypes":["…","…"],"untouched":"…"}
 * `taxTypes` are the rows written; `untouched` is a row in the same search that must never change.
 * Unset → every write case skips. Saving the old value again is NOT cleanup (it adds a version), so
 * the fixture must be resettable outside the UI.
 */
export interface WriteFixture extends SearchCriteria {
  taxTypes: string[];
  untouched: string;
}

export const IST_WRITE_FIXTURE: WriteFixture | null = process.env.IST_WRITE_FIXTURE
  ? (JSON.parse(process.env.IST_WRITE_FIXTURE) as WriteFixture)
  : null;

export const IST_WRITES_ALLOWED = process.env.IST_ALLOW_WRITES === 'true' && IST_WRITE_FIXTURE !== null;

export const IST_WRITES_SKIP_REASON =
  'Live writes are insert-only and cannot be undone from the UI — set IST_ALLOW_WRITES=true and IST_WRITE_FIXTURE to a disposable configuration to run this case.';

// ---------------------------------------------------------------- role accounts (permission cases)

export interface RoleAccount {
  username: string;
  password: string;
}

function account(prefix: string): RoleAccount | null {
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  return username && password ? { username, password } : null;
}

/** NavigatorCloud.Taxes.ManageTaxes.Read without FullAccess. */
export const IST_READONLY_ACCOUNT = account('IST_READONLY');

/** Signed in, but no Taxes permission at all. */
export const IST_NOACCESS_ACCOUNT = account('IST_NOACCESS');

// ---------------------------------------------------------------- copy

/** Only copy NM-2395 fixes verbatim. Everything else is "confirmation required" and not asserted. */
export const IST_MESSAGES = {
  unsavedSearchWarning: 'Searching will cause you to lose unsaved changes. Continue?',
  recordsFound: /(\d+)\s+records? found/i,
} as const;

// ---------------------------------------------------------------- dates

/** Business timezone that defines "today" for the default search date (NM-4025 §6.3: to be agreed). */
export const IST_BUSINESS_TIMEZONE = process.env.IST_BUSINESS_TIMEZONE ?? 'America/New_York';

/** A UTC+ zone for the off-by-one case — midnight local there is the previous day in UTC. */
export const IST_UTC_PLUS_TIMEZONE = 'Asia/Tokyo';

/** How far ahead to search to see the latest STORED version, including future-dated ones. */
export const IST_FAR_FUTURE_YEARS = 5;

export function todayIso(timeZone = IST_BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** ISO yyyy-mm-dd ± n days, computed in UTC so no local DST shift can move the calendar date. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addYears(iso: string, years: number): string {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

/** ISO yyyy-mm-dd → MM/DD/YYYY, the format the date pickers display (screenshot). */
export function toUiDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/** MM/DD/YYYY → ISO yyyy-mm-dd; null when the text is not a date. */
export function fromUiDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

/** Calendar date carried by a wire value ("2026-10-22", "2026-10-22T00:00:00", "$D2026-10-22T…"). */
export function wireDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.replace(/^\$D/, '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : null;
}

// ---------------------------------------------------------------- input contract

/** Hostile Rate inputs — asserted only for safety (no execution, no HTML rendering), never for a rule. */
export const IST_HOSTILE_RATE_INPUTS = [
  { label: 'script tag', typed: '<script>window.__istXss=1</script>' },
  { label: 'image onerror', typed: '<img src=x onerror="window.__istXss=1">' },
] as const;

/** Impossible dates typed into the search date. */
export const IST_INVALID_DATES = ['13/45/2026', '02/30/2026', 'abc'] as const;

/** Budget for the first usable search result (no measured baseline yet — tighten after first runs). */
export const IST_LOAD_BUDGET_MS = 30_000;

export const IST_VIEWPORTS = [
  { label: 'laptop 1366×768', width: 1366, height: 768 },
  { label: 'tablet 1024×768', width: 1024, height: 768 },
] as const;
