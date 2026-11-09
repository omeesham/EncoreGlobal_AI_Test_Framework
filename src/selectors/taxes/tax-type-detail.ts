// Selectors for Tax → Tax Type Detail (/locations/{office}/taxes/tax-type-detail).
// The page carries no data-testids, so everything is anchored on headings, aria-labels, data-slot
// attributes and roles, never on Radix-generated ids (radix-_r_N_), which change per render.

export const HEADER_TITLE = 'main h1:text-is("Tax Type Detail")';

export const RECORD_COUNT = 'main :text-matches("Tax types? found")';

export const BTN_GRID_OPTIONS = 'main button[aria-label="Grid Options"]';

export const HEADERS = 'main thead th';

/** Header button inside a th: opens Sort ascending / Sort descending (and Hide column on the optional columns). */
export const HEADER_MENU_TRIGGER = 'button[data-slot="dropdown-menu-trigger"]';

export const resizeHandle = (columnId: string): string => `main button[aria-label="Resize column ${columnId}"]`;

export const ROWS = 'main tbody tr:has(td + td)';

/** A ticked Default Taxability or Active cell holds this icon; an unticked one is empty. */
export const CHECK_ICON = 'svg.lucide-check';

/** The tax type name; when the column is too narrow it is cut off and opens a tooltip on hover. */
export const NAME_CELL = 'td span[data-slot="tooltip-trigger"]';

export const SKELETON = 'main [data-slot="skeleton"]';

/** The open menu. A closing one stays in the page for about 300 ms with data-state="closed". */
export const MENU = '[role="menu"][data-state="open"]';

/** Any menu, open or still closing; a menu button clicked before it has gone does not open. */
export const ANY_MENU = '[role="menu"]';

export const MENU_ITEM = `${MENU} [role="menuitem"]`;

export const MENU_CHECKBOX = `${MENU} [role="menuitemcheckbox"]`;

export const TOOLTIP = '[role="tooltip"]';

export const TOAST = '[data-sonner-toast]';

export const SIDEBAR_MENU_BUTTON = 'button[data-sidebar="menu-button"]';

export const SIDEBAR_TAX_LABEL = /^Tax$/;

export const sidebarPageFor = (officeNo: string): string => `[role="menu"] a[href$="/locations/${officeNo}/taxes/tax-type-detail"]`;
