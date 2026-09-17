/**
 * Test data for the Products pages: the Products search page, its filters, and the
 * product-code dialogs behind its row toolbar. The Product Groups pages carry their own
 * data module at `data/product-groups/product-groups.ts`.
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

/** Reference search word for the Products page — 376 of 15,874 rows at verification. */
export const ISR_SEARCH_WORD = 'Amp';

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

/** Rows-per-page option set on the Products page; 50 is the default there. */
export const ISR_PAGE_SIZES = ['10', '20', '30', '40', '50'] as const;
export const ISR_DEFAULT_PAGE_SIZE = '50';

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

// ---------------------------------------------------------------- View Product Code dialog (NM-2255)

/**
 * The product code the View dialog cases edit and restore. It was created through the Add
 * dialog on 2026-08-31 and sits under a real Audio chain whose class holds several sub
 * classes (the re-parent case needs a second sub class to move to); its history already
 * spans several pages (the paging case needs more than one page). Every case that saves
 * puts these values back before it ends, so the values here are the resting state.
 */
export const ISR_AUTOMATION_ITEM = {
  name: 'ZZ E2E Code 1788335881306',
  description: 'Automated create check 1788335881306',
  productCodeId: '102186',
  productType: 'EQUIPMENT',
  serviceType: 'Equipment Rental',
} as const;

/**
 * A real catalog item on office 1101 that has no Category: a Labor item whose row shows an
 * empty Category cell (read live 2026-09-15). The only item of the office's default search
 * in that state, so it is the one row on which the segment menu's Category entry can be
 * exercised for an item that has no category. The case never edits or saves it.
 */
export const ISR_CATEGORYLESS_ITEM = {
  name: 'Abstracts - Project Management',
  productCodeId: '73753',
  subClass: 'Content1 Labor',
} as const;

/**
 * The self-produced hierarchy the level-rename cases work on, so no real catalog node is
 * ever renamed. The automation creates it through the Add caret's Category form when the
 * item is not found, and the fixed names let later runs find it again. A run that stops
 * between a rename and its restore leaves the rename suffix on that level, which the next
 * run reports as a failed precondition rather than renaming on top of it.
 */
export const ISR_ZZ_CHAIN = {
  category: 'ZZ E2E Chain Category',
  subCategory: 'ZZ E2E Chain Sub Category',
  className: 'ZZ E2E Chain Class',
  subClass: 'ZZ E2E Chain Sub Class',
  subClassDescription: 'ZZ E2E Chain Sub Class',
  item: 'ZZ E2E Chain Item',
  itemDescription: 'ZZ E2E Chain Item',
  productType: 'EQUIPMENT',
  serviceType: 'Equipment Rental',
} as const;

/** A search word that matches only the chain's rows. */
export const ISR_ZZ_CHAIN_SEARCH_WORD = 'ZZ E2E Chain';

/** The suffix the rename cases append to a level name and remove again. */
export const ISR_RENAME_SUFFIX = ' R';

/** The five hierarchy sections of the Item segment, in the order the dialog shows them. */
export const ISR_DIALOG_SECTIONS = ['Category', 'Sub Category', 'Class', 'Sub Class', 'Item'] as const;

/**
 * The Product Organization entries as the DIALOG lists them (the page's search-panel popover
 * orders the same five entries differently). Membership is asserted, never sequence.
 */
export const ISR_DIALOG_ORG_ENTRIES = ['Select All', 'None', 'Canada', 'Mexico', 'United States'] as const;
export const ISR_ORG_COUNTRIES = ['Canada', 'Mexico', 'United States'] as const;
/** The country the organization cases choose and clear again. */
export const ISR_ORG_PICK = 'Canada';
/** The second country the Sub Class prompt cases add and remove again. */
export const ISR_ORG_SECOND_PICK = 'Mexico';
/**
 * The refusal shown when No is answered on the Sub Class organization prompt while an item
 * under the sub class still has no organization (read live 2026-09-15).
 */
/**
 * The refusal shown when No is answered while the sub class drops a country an item under it
 * still carries (read live 2026-09-15).
 */
export const ISR_ORG_REFUSAL_ITEM_KEEPS =
  `You cannot remove ${ISR_ORG_PICK} from the SubClass ProductOrgs because some Items are still assigned to it. Please update those Items first.`;
export const ISR_ORG_REFUSAL_ITEM_NONE =
  'Removing None Organizations would leave some Items in this SubClass with Product Organization set to None. ' +
  'You can assign another Product Organization to the affected Items before removing this one from the SubClass.';

/** The labor pairing the type-cascade case switches the item to and back from. */
export const ISR_LABOR_PAIR = { productType: 'LABOR', serviceType: 'Application Development' } as const;
/** Service samples per type for the filter case (all read live from the Item dropdowns). */
export const ISR_EQUIPMENT_SERVICE_SAMPLES = ['Equipment Rental', 'Computer Rental', 'Lighting'] as const;
export const ISR_LABOR_SERVICE_SAMPLES_VIEW = ['Application Development', 'Production Labor', 'Rigging Labor'] as const;

/** The message every successful save shows. */
export const ISR_UPDATE_MESSAGE = 'Product updated successfully.';

/** The two Active prompts, verbatim. */
export const ISR_PROMPT_DEACTIVATE = {
  title: 'Confirm De-activation',
  text: 'De-activating this product code will de-activate all the child product codes.',
} as const;
/**
 * The prompt a Sub Class organization save raises before the update goes out (read live
 * 2026-09-15). Its text is asserted as a whole because both answers are spelled out in it.
 */
export const ISR_PROMPT_SUBCLASS_ORG = {
  title: 'Confirm',
  text:
    'The Product Organizations for this SubClass have been changed. Do you want to update all existing Items with these changes? ' +
    'Yes: Apply the SubClass ORG changes to all existing Items. Existing Items will be updated according to the added or removed ORGs. ' +
    'No: Existing Items will not be changed. Only the SubClass ORG settings will be updated. You may need to manually update affected Items before saving.',
  buttons: ['No', 'Yes'],
} as const;
export const ISR_PROMPT_ACTIVATE = {
  title: 'Confirm Activation',
  text: 'Activating this product code will activate the parent product codes.',
} as const;

/** The 15 history-grid columns, verbatim and in order (read live 2026-09-15). */
export const ISR_HISTORY_COLUMNS = [
  'Action',
  'Parent Name',
  'Product Name',
  'Product Description',
  'Product Type',
  'Service Type Name',
  'Product Group',
  'Barcodeable',
  'Weight',
  'Eligible',
  'Oracle Item Number',
  'Active',
  'Product Organization',
  'Modified By',
  'Modified Date',
] as const;
export const ISR_HISTORY_DEFAULT_PAGE_SIZE = '20';
export const ISR_HISTORY_SMALL_PAGE_SIZE = '10';
/** The column the History hide-and-restore cycle runs on, and the one that only sorts. */
export const ISR_HISTORY_HIDE_COLUMN = 'Weight';
export const ISR_HISTORY_SORT_COLUMN = 'Modified Date';
export const ISR_HISTORY_NAME_COLUMN = 'Product Name';
export const ISR_HISTORY_SORT_ONLY_MENU_ITEMS = ['Sort ascending', 'Sort descending'] as const;
export const ISR_HISTORY_ACTION_UPDATE = 'Update';
export const ISR_HISTORY_ACTION_ADD = 'Add';
/** Booleans in the History grid render as this word or an empty cell. */
export const ISR_HISTORY_YES = 'Yes';
/**
 * History dates render as MM/DD/YYYY hh:mm:ss AM/PM in the runner's pinned zone; a row
 * written by a save is accepted when it falls within this window of the save click.
 */
export const ISR_HISTORY_TIME_ZONE = 'America/New_York';
export const ISR_HISTORY_SAVE_WINDOW_MINUTES = 10;

/** The Translations grid columns, the cap per box, and the sample texts the cases type. */
export const ISR_TRANSLATION_COLUMNS = ['Language', 'Name', 'Description'] as const;
export const ISR_TRANSLATION_MAX_LENGTH = 256;
export const ISR_TRANSLATION_TEXTS = {
  spanishName: 'Nombre de prueba',
  frenchName: 'Essai',
  usNameWithItemEdit: 'F5 us name',
  usNameAlone: 'G4 trans',
} as const;
export const ISR_LANGUAGE_US = 'US English';
export const ISR_LANGUAGE_SPANISH = 'Spanish (Mexico)';
export const ISR_LANGUAGE_FRENCH = 'French (Canada)';

/** Markup and symbols the content cases append (accepted and shown as plain text). */
export const ISR_SPECIAL_NAME_SUFFIX = '<b>x</b>&%"é🙂';
export const ISR_SPECIAL_DESCRIPTION_SUFFIX = '<i>y</i>&%\'"#';

/** Over-length probe sizes for the typing limits, and the positive-control size. */
export const ISR_OVERLONG = { name: 60, description: 70, oracle: 15, bypass: 60, control: 20 } as const;
