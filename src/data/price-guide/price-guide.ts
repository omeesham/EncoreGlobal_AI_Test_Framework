// Test data for Setup → Price Guide (NM-4128). Values were read live on 2026-10-06.

export interface PriceGuideOffice {
  readonly code: string;
  readonly country: 'USA' | 'Canada' | 'Mexico';
  readonly name: string;
}

/** Every Price Guide case runs on all three canonical offices. */
export const PRICE_GUIDE_OFFICES: readonly PriceGuideOffice[] = [
  { code: '1606', country: 'USA', name: 'Embassy Suites by Hilton Washington DC Convention Center' },
  { code: '2359', country: 'Canada', name: 'Toronto Hilton' },
  { code: '7147', country: 'Mexico', name: 'Barcelo Monterrey Valle' },
];

export const officeLabel = (o: PriceGuideOffice): string => `${o.country} ${o.code}`;

export const TEXT = {
  pageTitle: 'Price Guide | Navigator',
  header: 'Price Guide',
  info: 'Manage price guide recommendations for packages and product groups.',
  localOffice: 'Local Office',
  rightTitle: 'Price Guide Recommendations',
  emptyTitle: 'No recommendations yet',
  emptyBody: 'Double-click or drag and drop packages or product groups from the left to create price guide recommendations.',
  noResults: 'No results',
  unsavedTitle: 'Unsaved changes',
  unsavedBody: 'Are you sure you want to leave this view? Any unsaved changes will be lost.',
  headerMenu: ['Sort ascending', 'Sort descending', 'Hide column'],
  gridOptionsReset: 'Reset to Default View',
} as const;

export const ITEM_TYPE = { package: 'Package', productGroup: 'Product Group' } as const;

export const LEFT_COLUMNS = ['Name', 'Price'] as const;

export const RIGHT_COLUMNS = ['Name', 'Price', 'Item Type'] as const;

/** Grid Options labels; the menu spells the third one without a space. */
export const GRID_OPTION_COLUMNS = ['Name', 'Price', 'ItemType'] as const;

/** Resize handles are labelled with the column id, not the header text. */
export const COLUMN_ID = { Name: 'name', Price: 'price', 'Item Type': 'itemType' } as const;

// Searches whose expected matches were read on all three offices. Counts are kept as
// observations only — assertions check that every row matches, not a fixed number.
export const SEARCH = {
  partial: 'screen',
  partialUpper: 'SCREEN',
  phrase: 'Screen Kit - Rear',
  price: '850',
  quote: `10'6"`,
  noMatch: 'zzqqxx',
  special: ['%', '_', "' OR 1=1 --", '<script>alert(1)</script>'],
  long: 'a'.repeat(300),
  productGroup: 'design',
} as const;

export const INVALID_OFFICES = ['9999', 'abc'] as const;

/** Recommendations added in ADD-010: more than the 50 a Sales List allows, as recommendations have no limit. */
export const MANY_ITEMS = 55;

/**
 * Texts the team accepts below the 4.5:1 contrast minimum in the dark theme: white on the purple
 * primary buttons measures 3.98:1 and was checked and accepted as working (2026-10-06).
 */
export const DARK_THEME_ACCEPTED_CONTRAST = ['Save', 'Discard'] as const;

/** Packages are shared by every office; 4,000 is the real count (client, 2026-10-06). */
export const PACKAGE_COUNT = 4000;

/** Signed-in browser state of a second test account, for the two-user save case (SAV-007). */
export const SECOND_USER_STATE = process.env.PRICE_GUIDE_SECOND_USER_STATE ?? '.auth/price-guide-second-user.json';

/** Signed-in browser state of a test account without Price Guide rights, for SEC-001. */
export const NO_ACCESS_USER_STATE = process.env.PRICE_GUIDE_NO_ACCESS_USER_STATE ?? '.auth/price-guide-no-access-user.json';

/**
 * A location that has price books, for the save cases (SAV-001..008). 1606, 2359 and 7147 have none,
 * so saving cannot work there; the save cases skip until this is set, e.g. PRICE_GUIDE_SAVE_OFFICE=1234.
 */
export const SAVE_OFFICE = process.env.PRICE_GUIDE_SAVE_OFFICE ?? '';
