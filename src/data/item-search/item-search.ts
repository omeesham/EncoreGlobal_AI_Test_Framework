/**
 * Test data for the Item Search module (NM-2253): the Products search page, the
 * product-code dialogs behind its row toolbar, and the Product Groups sibling page.
 *
 * Every constant below was read from the live application on office 1101 during the
 * 2026-08-31 verification session (re-spot-checked 2026-09-01). Counts that are
 * data-driven (office list size, result totals, page counts) are asserted relatively
 * in the specs — the constants here carry only the thresholds and fixed sets.
 */

/** The one office this feature is exercised on — an admin-only surface pinned by the plan. */
export const ISR_OFFICE = '1101';

/** URL path builders. */
export const ISR_ROUTE = (office: string) => `/locations/${office}/products`;
export const ISR_PGR_ROUTE = (office: string) => `/locations/${office}/products/product-groups`;

/** Reference search word for the Products page — 376 of 15,874 rows at verification. */
export const ISR_SEARCH_WORD = 'Amp';

/** Reference search word for the Product Groups page — 82 groups at verification. */
export const ISR_PGR_SEARCH_WORD = 'Audio';

/** A barcode that matches nothing — drives the empty state deterministically. */
export const ISR_NO_MATCH_BARCODE = 'ZZNOBARCODE99';

/**
 * Barcodes the product owner supplied on 2026-09-01, each resolved live on office 1101.
 *
 * A barcode belongs to one physical asset and every asset is scanned under one product,
 * so a valid barcode returns exactly one row. Several assets share a product, which is
 * why some of these different barcodes resolve to the same product code. The expected
 * product travels with each constant so a case can assert which product came back, not
 * merely that one row did.
 *
 * Twelve barcodes were supplied and all twelve were resolved; the five below are the ones
 * the cases need. The other seven land on products these five already cover, so casing them
 * would repeat coverage rather than add any. The full twelve-to-product mapping is recorded
 * in the product search test-case document's verification log.
 */
export const ISR_BARCODE_NUMERIC = { code: '5052320', item: 'Allen & Heath ZED24', productCodeId: '28592' } as const;
export const ISR_BARCODE_NUMERIC_ALT = { code: '1013104', item: 'Shure SCM268', productCodeId: '627' } as const;
export const ISR_BARCODE_LETTERED = { code: 'DFW0082529', item: 'Shure ULXD1 Bodypack - G50', productCodeId: '71154' } as const;

/**
 * Three barcodes on ONE product (71154) — two in the site-prefixed form and one in plain
 * digits, so the printed form is shown to have no bearing on which product is returned.
 */
export const ISR_BARCODES_SHARING_A_PRODUCT = ['DFW0082529', 'DFW0082517', '5189939'] as const;
export const ISR_SHARED_PRODUCT_CODE_ID = '71154';

/** The first six digits of ISR_BARCODE_NUMERIC — a prefix, which must not match. */
export const ISR_BARCODE_PREFIX = '505232';

/** The barcode box's character ceiling, and a value comfortably past it. */
export const ISR_BARCODE_MAX_LENGTH = 42;
export const ISR_BARCODE_OVERLONG = '1'.repeat(50);

/** The 13 result-grid columns, verbatim and in order. */
export const ISR_COLUMNS = [
  'Category',
  'Sub Category',
  'Class',
  'Product Group',
  'Sub Class',
  'Item',
  'Product Code ID',
  'Description',
  'Available',
  'Owned',
  'Out of Service',
  'In Sequence',
  'Location Name',
] as const;

/** The Product Groups grid columns, verbatim and in order. */
export const ISR_PGR_COLUMNS = ['Name', 'Description', 'Service Type', 'Status'] as const;

/** Rows-per-page option set on the Products page; 50 is the default there. */
export const ISR_PAGE_SIZES = ['10', '20', '30', '40', '50'] as const;
export const ISR_DEFAULT_PAGE_SIZE = '50';

/** The Product Groups page turns a smaller page — 20 rows — by design difference. */
export const ISR_PGR_DEFAULT_PAGE_SIZE = '20';

/** The current-office entry as the Location dropdown and its resting value render it. */
export const ISR_OFFICE_OPTION = '1101 - Corporate Office Encore USA SGA';

/** Dropdown placeholders — the accessible names stay fixed while the values change. */
export const ISR_LOCATION_PLACEHOLDER = 'Select Location';
export const ISR_REGION_PLACEHOLDER = 'Select Region';

/** A region known to exist in the Region list (106 entries at verification). */
export const ISR_REGION_SAMPLE = 'Boston';

/** Relative-size floors for the two data-driven dropdowns. */
export const ISR_LOCATION_LIST_FLOOR = 1_000;
export const ISR_REGION_LIST_FLOOR = 50;

/** The Product Organization popover entries, verbatim. */
export const ISR_ORG_ENTRIES = ['Select All', 'None', 'United States', 'Canada', 'Mexico'] as const;

/** Page-chrome tooltip texts, verbatim from the live page. */
export const ISR_TOOLTIP_INFO = 'This is the future products page for the location.';
export const ISR_TOOLTIP_COLLAPSE = 'Hide search';
export const ISR_TOOLTIP_GRID_OPTIONS = 'Grid Options';

/** Column-header menu entries — sorting is menu-driven on every column. */
export const ISR_COLUMN_MENU_ITEMS = ['Sort ascending', 'Sort descending', 'Hide column'] as const;

/** The column the hide/restore cycle runs on (proven live 2026-08-31). */
export const ISR_HIDE_COLUMN = 'Owned';

/** The column the sort-flip case runs on (default sort column, ascending at rest). */
export const ISR_SORT_COLUMN = 'Category';

/** Floor for the unfiltered page count at 50 rows per page (318 pages at verification). */
export const ISR_PAGE_COUNT_FLOOR = 100;

/** Product Code Details dialog facts (the dialog's title anchor lives with the selectors). */
export const ISR_DIALOG_TABS = ['Item', 'Product Code History', 'Translations'] as const;
export const ISR_SEGMENTS = ['Item', 'Sub Class', 'Class', 'Sub Category', 'Category'] as const;

/**
 * The full product-type set offered by the Add dialog (10 entries). The SET is fixed;
 * the rendered order is not — it differed between two live reads a day apart, so
 * assertions compare membership, never sequence.
 */
export const ISR_PRODUCT_TYPES = [
  'EQUIPMENT',
  'CONSUMABLE',
  'FREIGHT',
  'LABOR',
  'EXPENSE',
  'SERVICE CHARGE',
  'DAMAGE WAIVER',
  'EVENT TECHNOLOGY SUPPORT',
  'FEE',
  'CABLES AND CONSUMABLE',
] as const;

/** Sample services that appear once LABOR is chosen (the filtered list is labor-only). */
export const ISR_LABOR_SERVICE_SAMPLES = ['Operator Labor', 'Rigging Labor', 'Setup Charges'] as const;

/** The four translation languages listed on the Translations tab, verbatim. */
export const ISR_TRANSLATION_LANGUAGES = [
  'English (Canada)',
  'US English',
  'Spanish (Mexico)',
  'French (Canada)',
] as const;

/** A sample of the 15 history-grid columns asserted present on the History tab. */
export const ISR_HISTORY_COLUMN_SAMPLES = [
  'Action',
  'Parent Name',
  'Product Name',
  'Product Type',
  'Modified By',
  'Modified Date',
] as const;

/**
 * A search word whose result set includes deactivated products, so unchecking the Active
 * filter grows it. At verification SM58 returned 39 active products and 45 with inactive
 * ones included — both on a single page, the six extra rows being inactive. The case
 * asserts the superset relationship (every active row still present, plus at least one
 * inactive), never the exact counts, so ordinary catalog changes cannot make it lie.
 */
export const ISR_ACTIVE_FILTER_WORD = 'SM58';

/**
 * Values for creating a product code from the Add dialog. Product Type and Service Type
 * are a paired selector — the service list is filtered to the chosen type, and Equipment
 * Rental belongs to the EQUIPMENT list. A per-run unique name is appended in the test so
 * repeated runs never collide; the created record is proven by searching the name back.
 */
export const ISR_ADD_CODE = {
  productType: 'EQUIPMENT',
  serviceType: 'Equipment Rental',
  namePrefix: 'ZZ E2E Code',
  descriptionPrefix: 'Automated create check',
} as const;

/**
 * The most characters each product code text box accepts.
 *
 * Name and Item Description are capped at 50 by NM-1742, which shrank the product Name and
 * Description database columns to 50 characters so they stay consistent with the legacy sizes
 * the Oracle integration and the product sync expect. The older "256 characters" line in
 * NM-1386 is out of date: QA raised the 50-character behaviour as NM-1835 and it was closed as
 * working as intended. Use these numbers, not that line.
 *
 * The Oracle Item Number cap was measured on the live form; no ticket sets it.
 *
 * Both dialogs (Add Product Code and View Product Code) enforce the same three limits.
 */
export const ISR_CODE_FIELD_LIMITS = {
  name: 50,
  itemDescription: 50,
  oracleItemNumber: 10,
} as const;

/**
 * Values for creating a product group from the Add page. A group needs a name, a
 * description, a service type and at least one sub-class (added by double-clicking any
 * item in the picker's list). A per-run unique name is appended in the test so repeated
 * runs never collide; the created group is proven by searching the name back.
 */
export const ISR_ADD_GROUP = {
  serviceType: 'Equipment Rental',
  namePrefix: 'ZZ E2E Group',
  descriptionPrefix: 'Automated group create check',
} as const;

