// Test data for Tax → Sales Tax (NM-4021, feature epic NM-889).
//
// Sales tax tables are effective-dated and insert-only: an import adds versions, nothing in the UI can
// remove one, and they feed live tax calculation. So the suite never lets a valid import reach the server;
// the as-of cases derive their boundaries from whatever history the environment holds.
// Live layout audited on e2e 2026-11-04 (office 1101).

// ---------------------------------------------------------------- route & office

export const ST_OFFICE = process.env.ST_OFFICE ?? '1101';

export const ST_PATH = (office: string): string => `locations/${office}/taxes/sales-tax`;

export const ST_PAGE_TITLE = 'Sales Tax';

export const ST_TABS = { basic: 'Basic Information', history: 'Sales Tax History' } as const;

/** Basic Information grid columns in display order (NM-4021 §4.1). */
export const ST_BASIC_COLUMNS = [
  'Zip Code', 'Geo Code', 'State', 'County', 'City',
  'State Tax', 'County Tax', 'County Local Tax', 'City Tax', 'City Local Tax', 'Combined Tax', 'Effective Date',
] as const;

/** Columns the History grid must carry (NM-4021 §4.2) — order there is not specified. */
export const ST_HISTORY_STANDARD_COLUMNS = ST_BASIC_COLUMNS;

/** Audit columns the live History grid adds. */
export const ST_HISTORY_AUDIT_COLUMNS = ['Modified By', 'Modified On'] as const;

/** The five tiers that add up to Combined Tax, as grid headers. */
export const ST_TAX_TIERS = ['State Tax', 'County Tax', 'County Local Tax', 'City Tax', 'City Local Tax'] as const;

// ---------------------------------------------------------------- search fixtures

/** A known zip with more than one stored version (2017-10-01 and 2025-04-01 on e2e). */
export const ST_ZIP = process.env.ST_ZIP ?? '90210';

/** Start of the wide History range — far enough back to hold several versions on e2e. */
export const ST_HISTORY_FROM = process.env.ST_HISTORY_FROM ?? '2017-01-01';

/** A zip that matches nothing (NM-4021 §10). */
export const ST_EMPTY_ZIP = '00000';

/** Second zip, for "typing over a selection" cases. */
export const ST_OTHER_ZIP = '30301';

/** A county with many cities — the NM-3996 regression fixture (NM-4021 §10). */
export const ST_MULTI_CITY = {
  state: process.env.ST_MULTI_CITY_STATE ?? 'AK',
  county: process.env.ST_MULTI_CITY_COUNTY ?? 'MATANUSKA-SUSITNA',
  city: process.env.ST_MULTI_CITY_CITY ?? 'WASILLA',
} as const;

/** A state other than the default one, for the state-change cases. */
export const ST_OTHER_STATE = 'CA';

// ---------------------------------------------------------------- copy

export const ST_MESSAGES = {
  recordsFound: /(\d+)\s+records? found/i,
  promptBeforeSearch: 'Select criteria and click Search to view sales tax records.',
  emptyBasic: 'No sales tax records found',
  emptyHistory: 'No sales tax history records found',
  invalidFileType: 'Invalid file type. Only .txt files are supported.',
  importFailed: 'Unable to import data.',
} as const;

// ---------------------------------------------------------------- dates

/** Business timezone that defines "today" for the default search date. */
export const ST_BUSINESS_TIMEZONE = process.env.ST_BUSINESS_TIMEZONE ?? 'America/New_York';

export function todayIso(timeZone = ST_BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** ISO yyyy-mm-dd ± n days, computed in UTC so no local DST shift can move the calendar date. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO yyyy-mm-dd → MM/DD/YYYY, the format the pickers and the grid display. */
export function toUiDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/** MM/DD/YYYY → ISO yyyy-mm-dd; null when the text is not a date. */
export function fromUiDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

/** A UTC timestamp as the History grid's Modified On shows it: MM/DD/YYYY hh:mm:ss AM in the business timezone. */
export function toUiDateTime(utc: string, timeZone = ST_BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date(utc)).replace(',', '');
}

/** Calendar date carried by a wire value ("2025-04-01T00:00:00.000Z", "$D2025-04-01T…"). */
export function wireDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.replace(/^\$D/, '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : null;
}

// ---------------------------------------------------------------- input contract

export const ST_INVALID_DATES = ['13/45/2026', '02/30/2026', 'abc'] as const;

/** Over-long or non-numeric Zip Code input; the field takes at most 5 digits (NM-4021 §6.1). */
export const ST_BAD_ZIP_INPUT = 'ab902105';

export const ST_HOSTILE_ZIP_INPUTS = [
  { label: 'script tag', typed: '<script>window.__stXss=1</script>' },
  { label: 'image onerror', typed: '<img src=x onerror="window.__stXss=1">' },
] as const;

/** Files the import must refuse before upload (NM-4021 §7.1). */
export const ST_NON_TXT_FILES = [
  { name: 'rates.csv', mimeType: 'text/csv' },
  { name: 'rates.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { name: 'rates.pdf', mimeType: 'application/pdf' },
] as const;

export const ST_LOAD_BUDGET_MS = 30_000;

export const ST_VIEWPORTS = [
  { label: 'laptop 1366×768', width: 1366, height: 768 },
  { label: 'tablet 1024×768', width: 1024, height: 768 },
] as const;

// ---------------------------------------------------------------- flat-file fixtures (NM-4021 §7.2)

/** Fixed-width import row; every field is padded or cut to its bound, so a row is always 181 chars. */
export interface FlatFileRow {
  zip: string;
  city: string;
  county: string;
  state: string;
  stateTax: string;
  countyTax: string;
  countyLocalTax: string;
  cityTax: string;
  cityLocalTax: string;
  combinedTax: string;
  /** YYYYMMDD */
  effDate: string;
  geoCode: string;
}

const FLAT_FILE_BOUNDS: [keyof FlatFileRow, number, number][] = [
  ['zip', 0, 5], ['city', 5, 28], ['county', 33, 25], ['state', 58, 2],
  ['stateTax', 67, 8], ['countyTax', 75, 8], ['countyLocalTax', 83, 8], ['cityTax', 91, 8],
  ['cityLocalTax', 99, 8], ['combinedTax', 107, 8], ['effDate', 163, 8], ['geoCode', 171, 10],
];

export const FLAT_FILE_ROW_LENGTH = 181;

export function flatFileRow(row: FlatFileRow): string {
  const chars = Array<string>(FLAT_FILE_ROW_LENGTH).fill(' ');
  for (const [key, start, length] of FLAT_FILE_BOUNDS) {
    [...row[key].padEnd(length).slice(0, length)].forEach((c, i) => (chars[start + i] = c));
  }
  return chars.join('');
}

/**
 * The server skips the first line of an import as a header (e2e 2026-11-04: a 2-line file reported
 * totalRows 1 and numbered its error "Row 2"). NM-4021 §7.2 does not mention a header — open question.
 */
export const ST_IMPORT_HEADER = 'ZIP  CITY                        COUNTY                   ST';

export function flatFile(rows: FlatFileRow[]): Buffer {
  return Buffer.from([ST_IMPORT_HEADER, ...rows.map(flatFileRow)].join('\r\n') + '\r\n', 'utf-8');
}

/** A well-formed row — only ever sent to a mocked import endpoint. */
export const ST_VALID_IMPORT_ROW: FlatFileRow = {
  zip: '90210', city: 'BEVERLY HILLS', county: 'LOS ANGELES', state: 'CA',
  stateTax: '0.060000', countyTax: '0.025000', countyLocalTax: '0.012500', cityTax: '0.000000',
  cityLocalTax: '0.000000', combinedTax: '0.097500', effDate: '20991231', geoCode: '0603706308',
};

/**
 * Rows the server must refuse, sent to the REAL import endpoint. Every row carries a non-numeric rate and
 * a zip that matches no jurisdiction, so nothing in the file can be stored even if validation were broken.
 */
const NOWHERE = { zip: ST_EMPTY_ZIP, city: 'NOWHERE', county: 'NOWHERE', state: 'ZZ' };
export const ST_INVALID_IMPORT_ROWS: FlatFileRow[] = [
  { ...ST_VALID_IMPORT_ROW, ...NOWHERE, countyTax: 'XYZ12345' },
  { ...ST_VALID_IMPORT_ROW, ...NOWHERE, stateTax: 'ABCDEFGH' },
];

/** What the server must report for ST_INVALID_IMPORT_ROWS: file line (header = line 1), column and value. */
export const ST_INVALID_IMPORT_ERRORS = [
  { row: '2', column: 'CountyTax', value: 'XYZ12345' },
  { row: '3', column: 'StateTax', value: 'ABCDEFGH' },
] as const;
