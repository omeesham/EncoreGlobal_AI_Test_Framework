// Selectors for Commissions → Product Code (/locations/{office}/commissions/product-code).
// The page carries few data-testids, so most anchors are ids, roles, aria-labels and data-slot attributes,
// never Radix-generated ids, which change per render.

export const ANY_FIELD = '#product-code-commission-any-field';
export const USE_DEFAULT = '#product-code-commission-use-default-commission';
export const INCLUDE_INACTIVE = '#product-code-commission-include-inactive';
export const INFO_BUTTON = 'button[aria-label="More information"]';
export const TOOLTIP = '[role="tooltip"]';
export const TOAST = '[data-sonner-toast]';
export const COPY_PANEL = '[data-testid="product-code-commission-copy-panel"]';
export const COPY_SEARCH = '[data-testid="product-code-commission-search"]';
export const HEADER_MENU_TRIGGER = 'button[data-slot="dropdown-menu-trigger"]';
export const MENU = '[role="menu"][data-state="open"]';
export const MENU_ITEM = `${MENU} [role^="menuitem"]`;
export const GRID_ROWS = 'main tbody tr';
export const resizeHandle = (id: string): string => `main button[aria-label="Resize column ${id}"]`;
export const SIDEBAR_MENU_BUTTON = 'button[data-sidebar="menu-button"]';
export const sidebarPageFor = (officeNo: string): string => `[role="menu"] a[href$="/locations/${officeNo}/commissions/product-code"]`;
