import type { SettingKind } from '../../pages/locations/location-management-history.page';

export const COLUMN_COUNT = 87;

export const FIRST_COLUMN = 'Local Office';

export const LAST_COLUMN = 'Warehouse Billing';

export const DEFAULT_ROWS_PER_PAGE = '20';

export const ROWS_PER_PAGE_OPTIONS = ['10', '20', '30', '40', '50'] as const;

// Individually true, but far from complete: only 14 of the 87 columns sort at all. Assert
// sortability against SORTABLE_COLUMNS below, never "everything except these".
export const NON_SORTABLE_COLUMNS = [
  'Active',
  'Corporate Pricing',
  'Allow DPCD',
  'Allow Production Quote',
] as const;

export const ROW_1_EXPECTED = {
  'Local Office': '1604',
  'Local Office Name': 'Parker Palm Springs',
  'Active': '✔', // Unicode checkmark ✔
  'Currency': 'USD',
} as const;

// ---------------------------------------------------------------- NM-3937 (confirmed live 2026-09-23)

/** A true boolean cell: a plain-text glyph, NOT the lucide-check SVG the Local Office grid uses. */
export const HISTORY_CHECK_GLYPH = '✔';

export const HISTORY_EMPTY_STATE_TEXT = 'No results.';

export const HISTORY_OFFICE = { no: '1604', name: 'Parker Palm Springs' } as const;

/** Read-only contrast office for cross-location isolation. Never mutated. */
export const HISTORY_CONTRAST_OFFICE = {
  no: '1606',
  name: 'Embassy Suites by Hilton Washington DC Convention Center',
} as const;

export const AUTOMATION_USER = 's-prd-clickauto@psav.com';

export const LOCATION_SETTINGS_TAB_ORDER = ['Basic Information', 'Location Management History'] as const;

/** Basic Information's own second-row tabs — hidden while the History tab is active. */
export const BASIC_INFO_SUBTABS = [
  'Local Information', 'Currency', 'Pricing', 'Account and Address', 'Legal', 'Notes',
  'Shared Setup Locations', 'Auto Add-On', 'Business Types',
] as const;

// Full header row in render order. "Currency" appears twice by design: the location's currency,
// then the price book's.
export const HISTORY_ALL_COLUMNS_IN_ORDER = [
  'Local Office', 'Local Office Name', 'Active', 'Live Date', 'Country', 'Currency', 'Tax Mode',
  'Region', 'Servicing Branch Office', 'Pay To Address', 'Union', 'Corporate Pricing', 'Billing Type',
  'Billing Cycle', 'Billing Way', 'Billing Way Active', 'Labor Pricing', 'Equip. Pricing',
  'Internal Equip. Pricing', 'Production Labor Pricing', 'Production Equip. Pricing', 'Allow DPCD',
  'Exclude Implied Discount', 'Prompt For Approval', 'Threshold', 'Enable LDW', 'LDW Percentage',
  'Calculate LDW on Net Amount', 'ETS', 'ETS Percent', 'Allow Service Charge',
  'Show Service Charge As Administrative Fee', 'Calculate Service Charge On Net Amount',
  'Service Charge Name', 'Apply Cables and Consumables Fee', 'C&C Percent', 'Calculate CAC on Net Amount',
  'Terms and Conditions', 'Allow Ticker Calc', 'Set/Strike/Support Labor Billing Goal',
  'Enable Set/Strike Labor Minutes', 'Apply Set/Strike Labor Minutes', 'Credit Memo Approval Required',
  'Display Tax', 'Company Remit Tax / GST/HST / VAT Tax', 'Remit PST Tax', 'Comm Receiver',
  'Enable IDC Billing', 'Skip Billing', 'Show SubRental', 'Inventory Only', 'Intercompany',
  'Calculate Commission Tax', 'Can Create External Customer Link', 'Venue/Branch Account Name',
  'Venue/Branch Account Phone1', 'Venue/Branch Account Phone2', 'Master Bill To Address Name',
  'Action of Shared Setup Location', 'Shared Setup Location ID', 'Shared Setup Location Name',
  'Include Service Charge in Price Guides', 'Pricing Strategy', 'Currency', 'Pricing Action',
  'Is Alternate', 'Use Effective Dates', 'Start Date', 'End Date', 'Notes', 'Modified By',
  'Modified On', 'Oracle Product Code', 'Oracle Department Code', 'Oracle Organization',
  'Allow Resort Tax', 'Resort Tax Percentage', 'Discount Reason', 'Offsite Event Location',
  'Use eSignature', 'Separate Master Bill Commission Invoice', 'Enable Product Group',
  'Allow Production Quote', 'Enable Job Costing', 'Enable Discount Guidance',
  'Internet Asset Reservation', 'Warehouse Billing',
] as const;

/** The only columns carrying a sort control — an allowlist, asserted as an exact set. */
export const SORTABLE_COLUMNS = [
  'Live Date', 'Billing Way Active', 'Modified By', 'Modified On', 'Oracle Product Code',
  'Oracle Department Code', 'Oracle Organization', 'Use eSignature',
  'Separate Master Bill Commission Invoice', 'Enable Product Group', 'Enable Job Costing',
  'Enable Discount Guidance', 'Internet Asset Reservation', 'Warehouse Billing',
] as const;

export const HISTORY_SORT_COLUMN = 'Modified On';
export const HISTORY_AUDIT_USER_COLUMN = 'Modified By';
export const HISTORY_DATE_SORT_COLUMN = 'Live Date';
/** Sortable tick-box columns, tried in turn until one varies across history (TC-LOC-MGH-030). */
export const HISTORY_BOOLEAN_SORT_COLUMNS = [
  'Enable Job Costing', 'Use eSignature', 'Warehouse Billing', 'Internet Asset Reservation',
  'Separate Master Bill Commission Invoice', 'Enable Product Group', 'Enable Discount Guidance',
] as const;

export const HISTORY_DEFAULT_SORT = { column: 'Modified On', direction: 'descending' } as const;

/** Server-side sortBy key per column — the confirmed subset. TC-LOC-MGH-031 attaches any others it sees. */
export const HISTORY_SORT_KEYS: Record<string, string> = {
  'Modified On': 'ModDate',
  'Live Date': 'LiveDate',
};

// The five price-book columns fold one value per currency into a single cell:
// "USD: <v>; CAD: <v>; MXN: <v>". Every <v> is empty on e2e although the Pricing tab and the old site show names — POTENTIAL BUG
// BUG-LOC-MGH-001 (open, awaiting triage). Tests assert the per-currency shape only, never a name.
export const COMPOSITE_CURRENCY_COLUMNS = [
  'Labor Pricing', 'Equip. Pricing', 'Internal Equip. Pricing', 'Production Labor Pricing',
  'Production Equip. Pricing',
] as const;
export const COMPOSITE_CURRENCIES = ['USD', 'CAD', 'MXN'] as const;

export const HISTORY_PLAIN_DATE_COLUMNS = ['Live Date', 'Start Date', 'End Date'] as const;

/** A sample of boolean columns, for the check-glyph rendering contract. */
export const HISTORY_BOOLEAN_COLUMNS = [
  'Active', 'Corporate Pricing', 'Allow DPCD', 'Enable LDW', 'Allow Service Charge',
  'Credit Memo Approval Required', 'Intercompany', 'Allow Ticker Calc', 'Comm Receiver',
  'Enable Job Costing',
] as const;

// NM-3937's representative field names -> the live header each renders as. Where the two differ the
// live label wins; the mapping itself is attached to the report by TC-LOC-MGH-019.
export const REPRESENTATIVE_FIELDS = {
  identity: {
    'Local Office ID': 'Local Office', 'Local Office Name': 'Local Office Name', 'Active': 'Active',
    'Live Date': 'Live Date', 'Country': 'Country', 'Currency': 'Currency', 'Region': 'Region',
  },
  billing: {
    'Billing Type': 'Billing Type', 'Billing Cycle': 'Billing Cycle', 'Billing Way': 'Billing Way',
    'Billing Way Effective Date': 'Billing Way Active',
  },
  pricing: {
    'Labor Corporate Price Book History': 'Labor Pricing',
    'Non-Labor Corporate Price Book History': 'Equip. Pricing',
    'Labor Production Price Book History': 'Production Labor Pricing',
    'Internal Equip. Pricing': 'Internal Equip. Pricing',
    'Production Equip. Pricing': 'Production Equip. Pricing',
  },
  commission: {
    'Allow DPCD': 'Allow DPCD', 'Exclude Implied Discount': 'Exclude Implied Discount',
    'Prompt for Approval': 'Prompt For Approval', 'Threshold Amount': 'Threshold',
    'Allow Service Charge': 'Allow Service Charge',
    'Calculate Service Charge on Net Amount': 'Calculate Service Charge On Net Amount',
    'Service Charge Name': 'Service Charge Name',
  },
  operational: {
    'Allow Ticker Calculation': 'Allow Ticker Calc',
    'Set Strike Labor Billing': 'Set/Strike/Support Labor Billing Goal',
    'Set Strike Minutes Enabled': 'Enable Set/Strike Labor Minutes',
    'Apply Set Strike Minutes': 'Apply Set/Strike Labor Minutes',
    'Credit Memo Approval Required': 'Credit Memo Approval Required', 'Display Tax': 'Display Tax',
    'Skip Billing': 'Skip Billing', 'Show Sub Rental': 'Show SubRental',
    'Inventory Only': 'Inventory Only', 'Intercompany': 'Intercompany',
  },
  audit: {
    'Notes': 'Notes', 'Modified User': 'Modified By', 'Modified Date': 'Modified On',
  },
  locationIntegration: {
    'Pay To': 'Pay To Address', 'Servicing Branch Office': 'Servicing Branch Office',
    'Default Venue Name': 'Venue/Branch Account Name', 'Phone 1': 'Venue/Branch Account Phone1',
    'Phone 2': 'Venue/Branch Account Phone2', 'Bill To Address Name': 'Master Bill To Address Name',
    'Oracle Product Code': 'Oracle Product Code', 'Oracle Department Code': 'Oracle Department Code',
    'Oracle Organization ID': 'Oracle Organization',
  },
} as const;

export const HISTORY_FORBIDDEN_CELL_TEXT = [
  'null', 'undefined', 'NaN', 'Invalid Date', '[object Object]',
] as const;

export const HISTORY_FORBIDDEN_BOOLEAN_TEXT = ['true', 'false', 'True', 'False'] as const;

// Confirmed live, e.g. "09/22/2026 03:20:02 PM".
export const HISTORY_MODIFIED_ON_PATTERN = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} (AM|PM)$/;
// Live Date / Start Date / End Date: a date with no time, e.g. "08/29/1971".
export const HISTORY_PLAIN_DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Two or more words run together with no separator (ModDate, liveDate). "Phone1" does not trip it.
export const RAW_FIELD_KEY_PATTERN = /^[A-Za-z]*[a-z][A-Z][A-Za-z]*$/;

export const I18N_PLACEHOLDER_PATTERNS = [/\{\{/, /\}\}/, /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+){2,}$/];

/** POST {BASE_URL}api/location/get-location-setting-history */
export const HISTORY_API_URL_PATTERN = /\/api\/location\/get-location-setting-history/;

/** Request body shape: { locationNo, isCorporate, page, pageSize, sortBy, sortDescending }. */
export interface HistoryRequestBody {
  locationNo?: string;
  isCorporate?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDescending?: boolean;
}

export const HISTORY_TYPES = {
  standard: 'Location Management History',
  legacy: 'Location Management Legacy History',
} as const;

// Legacy = the standard 87 columns minus Billing Cycle; 1 row and no paginator on office 1604.
export const HISTORY_LEGACY = {
  columnCount: 86,
  missingColumn: 'Billing Cycle',
} as const;

export const HISTORY_MOCK = {
  // 2,000 characters with no break opportunity — the worst case for a table that must scroll
  // inside its own container rather than widening the page.
  longNotes: 'N'.repeat(2000),
  specialNotes: `<script>alert(1)</script> "quotes" & 'apostrophes' <b>bold</b> \u{1F600}`,
  viewports: [
    { width: 1366, height: 768, label: '1366x768' },
    { width: 1280, height: 720, label: '1280x720' },
  ],
  defaultViewport: { width: 1920, height: 1080 },
  slowResponseMs: 4_000,
} as const;

// The page box reverts to the page ALREADY shown for these, never to a hardcoded page 1.
export const HISTORY_PAGE_INPUT_REJECTED = [
  { typed: '0', note: 'zero' },
  { typed: '-1', note: 'negative' },
  { typed: 'abc', note: 'non-numeric' },
] as const;

export const HISTORY_PAGE_INPUT_ACCEPTED = [
  { typed: '007', expected: '7', note: 'leading zeros are stripped' },
  { typed: '3', expected: '3', note: 'a plain valid page' },
] as const;

// ACCEPTED BEHAVIOUR (owner ruling 2026-09-23; BUG-LOC-MGH-003 withdrawn), same shared paginator as Local Office History: the "." is stripped and the digits
// concatenated, so a user aiming at page 2 lands on page 25.
export const HISTORY_PAGE_INPUT_DECIMAL_DEFECT = { typed: '2.5', observed: '25' } as const;

export type AppLanguage = 'en-US' | 'fr-CA' | 'es-MX';

export const LANGUAGE_OPTIONS = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'fr-CA', label: 'French (Canada)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
] as const;

export const DEFAULT_LANGUAGE: AppLanguage = 'en-US';

// A sample of confirmed translations, keyed by header INDEX so a locale's labels are compared
// column-for-column. The full header list is attached, never asserted wholesale.
export const HISTORY_TRANSLATIONS: Record<AppLanguage, { tab: string | null; headers: Record<number, string> }> = {
  'en-US': {
    tab: 'Location Management History',
    headers: { 0: 'Local Office', 1: 'Local Office Name', 2: 'Active', 3: 'Live Date', 4: 'Country' },
  },
  'fr-CA': {
    tab: 'Historique de la gestion de l’emplacement', // typographic apostrophe, as rendered
    headers: { 0: 'Bureau Local', 1: 'Nom du bureau local', 2: 'Actif', 3: 'Date de mise en service', 4: 'Pays' },
  },
  // Index 3 (Live Date) is deliberately absent: its es-MX label "Datos en Tiempo Real" reads as
  // "real-time data" — a translation-quality discrepancy recorded by TC-LOC-MGH-053, not asserted.
  'es-MX': {
    tab: null,
    headers: { 0: 'Oficina local', 1: 'Nombre de oficina local', 2: 'Activo', 4: 'País', 5: 'Moneda' },
  },
};

export const LIVE_DATE_COLUMN_INDEX = 3;

// POTENTIAL BUG (BUG-LOC-MGH-002, open, awaiting triage), pinned rather than tolerated silently: in fr-CA,
// "Enable Set/Strike Labor Minutes" and "Apply Set/Strike Labor Minutes" both render as the same
// label, so a French user cannot tell the two apart. Besides the by-design duplicate Currency pair,
// these are the ONLY duplicate headings allowed; a new one, or a fix, turns TC-LOC-MGH-054 red on
// purpose — on a fix, empty this list rather than weakening the check.
export const LOCALE_KNOWN_DUPLICATE_HEADERS: Record<AppLanguage, readonly string[]> = {
  'en-US': [],
  'fr-CA': ['Activer le temps de main-d’œuvre pour montage/démontage'],
  'es-MX': [],
};

/**
 * Save-cycle probe: Local Office Name on Basic Information — maxlength 255, not required, no
 * cross-field rule, and itself one of NM-3937's representative fields.
 */
export const SAVE_CYCLE_PROBE = {
  column: 'Local Office Name',
  suffix: ' AT',
  maxLength: 255,
} as const;

/** How recent a just-saved history row must be. Timezone-proof: the grid renders UTC text. */
export const RECENT_ROW_WINDOW_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------- Audit completeness (2026-09-25)
//
// Every Location Settings control, keyed by data-testid minus the 'location-settings-' prefix, is
// MAPPED to the History column it should write, UNTRACKED (no History column), or IGNORED (a view
// filter, not a setting). TC-LOC-MGH-073 reads the live form and fails on any control in none of
// the three, so a field added next sprint is examined rather than silently unaudited.
//
// verified: true  = proven by a save-and-check round trip on 2026-09-25 (UTC browser, office 1604).
// verified: false = matched by label only; a column exists but no save has proven it is written.

export const SETTINGS_TABS = [
  null, 'Local Information', 'Currency', 'Pricing', 'Account and Address', 'Legal', 'Notes',
  'Shared Setup Locations', 'Auto Add-On', 'Business Types',
] as const;

export const SETTING_TO_HISTORY_COLUMN: Record<string, { column: string; verified: boolean }> = {
  // Left panel
  'input-location-name': { column: 'Local Office Name', verified: true },
  'input-location-no': { column: 'Local Office', verified: false },
  'checkbox-active': { column: 'Active', verified: false },
  'select-country': { column: 'Country', verified: false },
  'select-region': { column: 'Region', verified: true },
  'select-servicing-branch': { column: 'Servicing Branch Office', verified: false },
  'input-pay-to-name': { column: 'Pay To Address', verified: false },
  'checkbox-is-union': { column: 'Union', verified: true },
  // Local Information
  'checkbox-apply-ldw': { column: 'Enable LDW', verified: false },
  'input-default-ldw-percentage': { column: 'LDW Percentage', verified: true },
  'checkbox-calc-ldw-on-net-amount': { column: 'Calculate LDW on Net Amount', verified: false },
  'checkbox-apply-cables-consumables': { column: 'Apply Cables and Consumables Fee', verified: false },
  'input-cables-consumables-percentage': { column: 'C&C Percent', verified: false },
  'checkbox-calc-cac-on-net-amount': { column: 'Calculate CAC on Net Amount', verified: false },
  'checkbox-allow-ets': { column: 'ETS', verified: false },
  'input-ets-percentage': { column: 'ETS Percent', verified: false },
  'checkbox-allow-service-charge': { column: 'Allow Service Charge', verified: false },
  'checkbox-is-administrative-fee': { column: 'Show Service Charge As Administrative Fee', verified: false },
  'checkbox-calc-service-charge-on-net': { column: 'Calculate Service Charge On Net Amount', verified: false },
  'checkbox-allow-resort-tax': { column: 'Allow Resort Tax', verified: false },
  'input-resort-tax-percent': { column: 'Resort Tax Percentage', verified: false },
  'checkbox-allow-tick-calc': { column: 'Allow Ticker Calc', verified: false },
  'input-set-strike-labor-billing': { column: 'Set/Strike/Support Labor Billing Goal', verified: false },
  'checkbox-enable-set-strike-minutes': { column: 'Enable Set/Strike Labor Minutes', verified: false },
  'checkbox-apply-set-strike-minutes': { column: 'Apply Set/Strike Labor Minutes', verified: false },
  'checkbox-allow-internet-asset-reservation': { column: 'Internet Asset Reservation', verified: false },
  'checkbox-allow-dpcd': { column: 'Allow DPCD', verified: false },
  'checkbox-exclude-implied-discount': { column: 'Exclude Implied Discount', verified: false },
  'checkbox-prompt-for-approval': { column: 'Prompt For Approval', verified: false },
  'input-threshold-amount': { column: 'Threshold', verified: false },
  'checkbox-credit-memo-approval': { column: 'Credit Memo Approval Required', verified: false },
  'checkbox-check-discount': { column: 'Discount Reason', verified: false },
  'checkbox-use-esign': { column: 'Use eSignature', verified: false },
  'checkbox-enable-product-group': { column: 'Enable Product Group', verified: false },
  'checkbox-allow-production-quote': { column: 'Allow Production Quote', verified: false },
  'input-billing-type': { column: 'Billing Type', verified: true },
  'input-billing-way': { column: 'Billing Way', verified: false },
  'btn-effective-date': { column: 'Billing Way Active', verified: false },
  'select-billing-cycle': { column: 'Billing Cycle', verified: true },
  'checkbox-warehouse-billing': { column: 'Warehouse Billing', verified: false },
  'input-oracle-product': { column: 'Oracle Product Code', verified: false },
  'input-oracle-dept': { column: 'Oracle Department Code', verified: true },
  'select-oracle-org': { column: 'Oracle Organization', verified: false },
  'checkbox-company-remit-tax': { column: 'Company Remit Tax / GST/HST / VAT Tax', verified: false },
  'checkbox-display-tax': { column: 'Display Tax', verified: false },
  'checkbox-comm-receiver': { column: 'Comm Receiver', verified: false },
  'checkbox-enable-idc-billing': { column: 'Enable IDC Billing', verified: false },
  'checkbox-skip-billing': { column: 'Skip Billing', verified: true },
  'checkbox-separate-commission-invoice': { column: 'Separate Master Bill Commission Invoice', verified: false },
  'checkbox-show-sub-rental': { column: 'Show SubRental', verified: false },
  'checkbox-inventory-only': { column: 'Inventory Only', verified: false },
  'checkbox-intercompany': { column: 'Intercompany', verified: false },
  'checkbox-calculate-commission-tax': { column: 'Calculate Commission Tax', verified: false },
  'checkbox-can-create-external-link': { column: 'Can Create External Customer Link', verified: false },
  'checkbox-offsite-event-location': { column: 'Offsite Event Location', verified: false },
  'checkbox-enable-job-costing': { column: 'Enable Job Costing', verified: false },
  'checkbox-discount-guidance': { column: 'Enable Discount Guidance', verified: false },
  // Currency: the location's default currency is the first "Currency" column (label match only)
  'checkbox-currency-USD-default': { column: 'Currency', verified: false },
  // Pricing
  'checkbox-corporate-pricing': { column: 'Corporate Pricing', verified: false },
  'checkbox-price-guide-inclusion': { column: 'Include Service Charge in Price Guides', verified: true },
  'select-primary-labor-pricing-usd': { column: 'Labor Pricing', verified: false },
  'select-primary-equipment-pricing-usd': { column: 'Equip. Pricing', verified: false },
  'select-primary-internal-equipment-pricing-usd': { column: 'Internal Equip. Pricing', verified: false },
  'select-primary-production-labor-pricing-usd': { column: 'Production Labor Pricing', verified: false },
  'select-primary-production-equipment-pricing-usd': { column: 'Production Equip. Pricing', verified: false },
  // Account and Address
  'input-venue-name': { column: 'Venue/Branch Account Name', verified: false },
  'input-contact-phone-1': { column: 'Venue/Branch Account Phone1', verified: true },
  'input-contact-phone-2': { column: 'Venue/Branch Account Phone2', verified: false },
  // Legal
  'select-legal-0-service-charge': { column: 'Service Charge Name', verified: true },
  'select-legal-0-terms': { column: 'Terms and Conditions', verified: true },
  // Notes: the add button is the control; each note is a textarea with no testid
  'btn-add-note': { column: 'Notes', verified: true },
};

/**
 * Settings with NO History column: changing them is never visible in History (observed live
 * 2026-09-25). The old site also leaves Multiday Pricing and Merchant Currency untracked
 * (OSB-ACCESS-VERIFY-2026-04-24.md §5); for the rest the old-site behaviour is unknown. Reported to the
 * client by the owner 2026-09-28; the list is pinned, not treated as a failure.
 */
export const UNTRACKED_SETTINGS: readonly RegExp[] = [
  /^input-primary-location-no$/, /^checkbox-use-ecommerce$/, /^checkbox-enable-productions-orders$/,
  /^checkbox-enable-multiday-pricing$/, /^checkbox-suppress-discount$/, /^checkbox-compass-integration$/,
  /^checkbox-exhibit-show-rate$/, /^checkbox-enable-proposal$/, /^select-product-org$/,
  /^checkbox-enable-price-escalator$/,
  /^checkbox-currency-(USD|CAD|MXN)-selected$/, /^checkbox-currency-(CAD|MXN)-default$/, /^select-currency-(USD|CAD|MXN)-merchant$/,
  /^checkbox-shared-location-\d+-(primary|shares-inventory)$/,
  /^checkbox-auto-add-on-/, /^checkbox-business-type-\d+$/,
];

/** View filters, not settings. */
export const IGNORED_CONTROLS: readonly RegExp[] = [/^select-pricing-currency$/];

export type SaveCheckField = {
  name: string;
  tab: string | null;
  selector: string;
  kind: SettingKind;
  column: string;
  /** How the recorded cell reads for a saved value; plain equality when absent. */
  expect?: 'check-glyph' | 'percent' | 'legal-prefixed' | 'note-prefixed';
};

const tid = (id: string) => `[data-testid="location-settings-${id}"]`;

export const SAVE_CHECK_LEFT_PANEL: readonly SaveCheckField[] = [
  { name: 'Union', tab: null, selector: tid('checkbox-is-union'), kind: 'checkbox', column: 'Union', expect: 'check-glyph' },
  { name: 'Region', tab: null, selector: tid('select-region'), kind: 'dropdown', column: 'Region' },
  { name: 'Tax Mode', tab: null, selector: 'div:has(> label:text-is("Tax Mode")) button[role="combobox"]', kind: 'dropdown', column: 'Tax Mode' },
];

export const SAVE_CHECK_LOCAL_INFORMATION: readonly SaveCheckField[] = [
  { name: 'Skip Billing', tab: 'Local Information', selector: tid('checkbox-skip-billing'), kind: 'checkbox', column: 'Skip Billing', expect: 'check-glyph' },
  { name: 'LDW Percentage', tab: 'Local Information', selector: tid('input-default-ldw-percentage'), kind: 'percent', column: 'LDW Percentage', expect: 'percent' },
  { name: 'Oracle Department', tab: 'Local Information', selector: tid('input-oracle-dept'), kind: 'text', column: 'Oracle Department Code' },
  { name: 'Billing Cycle', tab: 'Local Information', selector: tid('select-billing-cycle'), kind: 'dropdown', column: 'Billing Cycle' },
  { name: 'Billing Type', tab: 'Local Information', selector: tid('input-billing-type'), kind: 'radio', column: 'Billing Type' },
];

export const SAVE_CHECK_OTHER_TABS: readonly SaveCheckField[] = [
  { name: 'Phone 1', tab: 'Account and Address', selector: tid('input-contact-phone-1'), kind: 'text', column: 'Venue/Branch Account Phone1' },
  { name: 'Price Guide Inclusion', tab: 'Pricing', selector: tid('checkbox-price-guide-inclusion'), kind: 'checkbox', column: 'Include Service Charge in Price Guides', expect: 'check-glyph' },
  { name: 'Legal Service Charge', tab: 'Legal', selector: tid('select-legal-0-service-charge'), kind: 'dropdown', column: 'Service Charge Name', expect: 'legal-prefixed' },
  { name: 'Legal Terms', tab: 'Legal', selector: tid('select-legal-0-terms'), kind: 'dropdown', column: 'Terms and Conditions', expect: 'legal-prefixed' },
  { name: 'Notes', tab: 'Notes', selector: '[data-testid="location-settings-section-notes"] textarea', kind: 'note', column: 'Notes', expect: 'note-prefixed' },
];

/** Settings with no History column: their save must change no History data column. */
export const SAVE_CHECK_UNTRACKED: readonly Omit<SaveCheckField, 'column' | 'expect'>[] = [
  { name: 'Enable Proposal', tab: 'Local Information', selector: tid('checkbox-enable-proposal'), kind: 'checkbox' },
  { name: 'Shared Setup: Shares Inventory', tab: 'Shared Setup Locations', selector: tid('checkbox-shared-location-0-shares-inventory'), kind: 'checkbox' },
];

/**
 * The seven History columns that mirror the Pricing tab's pricing-strategy table. Accepted by the
 * owner 2026-09-28 (pinned, not a bug), observed 2026-09-25: saving a strategy-row change (Is Alternate on row 2; POST
 * .../pricebook/upsert-location-pricebook, 200) creates a History entry but writes none of them.
 * "Currency (2)" is the second Currency column as keyed by readNewestHistoryEntries().
 */
export const PRICING_STRATEGY_COLUMNS = [
  'Pricing Strategy', 'Currency (2)', 'Pricing Action', 'Is Alternate', 'Use Effective Dates', 'Start Date', 'End Date',
] as const;
export const PRICING_STRATEGY_PROBE_SELECTOR =
  '[data-testid="location-settings-table-secondary-pricing"] tbody tr:nth-child(2) [role="checkbox"]';

/**
 * Save-and-check scenarios run in their own UTC browser context. playwright.config.ts pins every
 * context to America/New_York, where the form's Live Date display shift moves Live Date on each save.
 */
export const SAVE_CHECK_TIMEZONE = 'UTC';
