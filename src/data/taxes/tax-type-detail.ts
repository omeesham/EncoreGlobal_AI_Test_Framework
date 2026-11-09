// Test data for Tax → Tax Type Detail (NM-4024). Values were read live on 2026-11-06.
// The page lists the company's active tax types with their default taxability. The list is the same on
// every office, and it is read-only: nothing on the page edits or saves.

export interface TtdOffice {
  readonly code: string;
  readonly country: 'USA' | 'Canada' | 'Mexico';
}

/** The page opens the same way on all three canonical offices. */
export const TTD_OFFICES: readonly TtdOffice[] = [
  { code: '1606', country: 'USA' },
  { code: '2359', country: 'Canada' },
  { code: '7147', country: 'Mexico' },
];

export const officeLabel = (o: TtdOffice): string => `${o.country} ${o.code}`;

/** Office opened by the cases that do not depend on the office. */
export const OFFICE = '1606';

/** The tax types listed, in the page's default order (A to Z). Three names carry an en dash, as the page writes them. */
export const TAX_TYPES = [
  'APP Downloaded', 'App Quality Assurance', 'App Quality Assurance – M', 'App Remote Access', 'Application Development',
  'Application Development – M', 'Application Programming', 'Application Programming – M', 'Audio Conferencing',
  'Cancellation Fee', 'Concise Labor - M', 'Damage Waiver', 'Digital Services', 'Digital Services Labor', 'Freight', 'HSIA',
  'HSIA Labor', 'Installation Labor', 'Miscellaneous Services', 'Mobile Apps', 'Music Access', 'Operating Labor', 'Power',
  'Professional Services', 'Reimbursed Exp', 'Rental', 'Repair & Maintenance', 'Rigging', 'Rigging Labor', 'Sales',
  'Service Charge', 'Set & Strike Labor', 'Subrental', 'Subrented Labor', 'Technician - Support Services', 'Telecom',
  'Telecom Labor', 'Venue Equipment', 'Video Conferencing', 'Web Conferencing',
] as const;

/** The longest name, used for the cut-off name tooltip. */
export const LONG_NAME = 'Technician - Support Services';

export const COLUMNS = ['Tax Type', 'Default Taxability', 'Active'] as const;
export type Column = (typeof COLUMNS)[number];

/** The column ids the resize handles are labelled with ("Resize column TaxType"). */
export const COLUMN_ID: Record<Column, string> = { 'Tax Type': 'TaxType', 'Default Taxability': 'DefaultTaxability', Active: 'Active' };

/** Columns that can be hidden (from their header menu or Grid Options); Tax Type always shows. */
export const HIDEABLE: readonly Column[] = ['Default Taxability', 'Active'];

export const TEXT = {
  header: 'Tax Type Detail',
  pageTitle: 'Tax Type Detail | Navigator',
  signInTitle: 'Sign in | Navigator',
  /** The count line above the grid ("40 Tax type found"). */
  count: (n: number) => `${n} Tax type found`,
  empty: 'No tax type detail records found.',
  gridOptions: 'Grid Options',
} as const;

/** Where the browser keeps the grid layout between visits. */
export const LAYOUT_KEY = 'tax-type-detail-table-settings';
