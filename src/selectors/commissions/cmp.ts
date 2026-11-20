// Selectors for Commissions → CMP (/locations/{office}/commissions/cmp).
// The page carries no data-testids, so everything is anchored on roles, labels, aria-labels and
// data-slot attributes, never on Radix-generated ids, which change per render.

export const HEADING = ':text-is("CMP Commissions")';
export const INFO_BUTTON = 'button[aria-label="More information"]';
export const TOOLTIP = '[role="tooltip"]';
export const TOAST = '[data-sonner-toast]';

/** The Local Office card's button ("1102 - Corporate Office - Long Beach"); it opens Change Local Office. */
export const OFFICE_BUTTON = /^\d{4} - /;
export const COMMISSION_INPUT = 'main input[inputmode="decimal"]';

export const PICKER_ROWS = 'tbody tr';
export const CHECKED = '[role="checkbox"][data-state="checked"]';

export const HEADER_MENU_TRIGGER = 'button[data-slot="dropdown-menu-trigger"]';
export const MENU_ITEM = '[role="menu"][data-state="open"] [role="menuitem"]';
export const resizeHandle = (columnId: string): string => `main button[aria-label="Resize column ${columnId}"]`;
export const GRID_ROWS = 'main tbody tr';

export const SIDEBAR_MENU_BUTTON = 'button[data-sidebar="menu-button"]';
export const sidebarPageFor = (officeNo: string): string => `[role="menu"] a[href$="/locations/${officeNo}/commissions/cmp"]`;
