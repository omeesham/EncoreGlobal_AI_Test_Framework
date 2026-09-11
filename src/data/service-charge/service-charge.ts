/**
 * Test data for the Service Charge setup page.
 *
 * Service-type labels sourced verbatim from the live application, observed on 2026-08-10.
 *
 * Office 1604 (Parker Palm Springs) is the primary test entity per NM-3344.
 */

/** Primary test office. */
export const SC_OFFICE = '1604';

/** Total number of service-type rows on the Basic Information tab. */
export const SC_ROW_COUNT = 79;

/**
 * URL path builder for the Service Charge module.
 * Usage: `${baseUrl}${SC_ROUTE('1604')}`
 */
export const SC_ROUTE = (office: string) =>
  `/locations/${office}/settings/service-charge`;

/**
 * Maps each service-type label (verbatim from the live application, observed on 2026-08-10) to its row index (0–78).
 * Used by the page object to resolve setPercentageByServiceType / getPercentageByServiceType
 * without scanning the DOM for label text.
 */
export const SC_SERVICE_TYPE_INDEX: Record<string, number> = {
  'APP Downloaded': 0,
  'App Quality Assurance': 1,
  'App Quality Assurance \u2013 M': 2,
  'App Remote Access': 3,
  'Application Development': 4,
  'Application Development \u2013 M': 5,
  'Application Programming': 6,
  'Application Programming \u2013 M': 7,
  'Audio Conferencing': 8,
  'Cancellation Fee': 9,
  'Concise Equipment': 10,
  'Concise Labor - M': 11,
  'Concise Support Labor': 12,
  'Creative Content': 13,
  'Creative Services': 14,
  'Cvent Application Programming \u2013 M': 15,
  'Cvent Mobile App': 16,
  'Cvent Remote Access': 17,
  'Cvent Support Labor': 18,
  'Digital Services': 19,
  'Digital Services Equipment': 20,
  'Digital Services Labor': 21,
  'Digital Services Subrental': 22,
  'Equipment Rental': 23,
  'Event Technology Support': 24,
  'Extended Venue Access Managed Services': 25,
  'Freight': 26,
  'HSIA - Equipment': 27,
  'HSIA - Labor': 28,
  'HSIA - Subrental Equipment': 29,
  'HSIA - Wi-Fi Services': 30,
  'HSIA Services': 31,
  'Lighting': 32,
  'Lighting Subrental': 33,
  'Loss Damage Waiver': 34,
  'Mobile Apps': 35,
  'Music Access': 36,
  'Operator Labor': 37,
  'Photographic Services': 38,
  'Power Infrastructure': 39,
  'Power Labor': 40,
  'Power Rental Equipment': 41,
  'Power Sub-rental Equipment': 42,
  'Production Labor': 43,
  'Production Management': 44,
  'Reimbursed Expense': 45,
  'Rigging Equipment - Subrental': 46,
  'Rigging Equipment Rental': 47,
  'Rigging Labor': 48,
  'Rigging Labor - External': 49,
  'Sales & Consumables': 50,
  'Scenic Equipment Rental': 51,
  'Scenic Sub-Rental': 52,
  'Service Charge': 53,
  'Setup Charges': 54,
  'Shipping Resale': 55,
  'Sub-Contracted Labor': 56,
  'Sub-Rental Equipment': 57,
  'Technical Design & Engineering': 58,
  'Technician - Support Services': 59,
  'Telecom Equipment': 60,
  'Telecom Labor': 61,
  'Telecom Services': 62,
  'Telecom Subrental': 63,
  'TRA/AVT Royalty/Redevance': 64,
  'Venue Equipment Rental': 65,
  'Video Conferencing': 66,
  'Virtual Events Equipment': 67,
  'Virtual Events Professional Service': 68,
  'Virtual Events Support Labor': 69,
  'Web Conferencing': 70,
  'Wedding Event Equipment Rental': 71,
  'Wedding Event Labor': 72,
  'Wedding Event Sales & Consumables': 73,
  'xAdministrative Fee': 74,
  'xHSIA Reimbursed Expense': 75,
  'xMiscellaneous Services': 76,
  'ZSub Contractor Specialty Labor': 77,
  'ZSub Rental Specialty': 78,
} as const;

/**
 * Column headers on the Basic Information tab, in display order.
 * Confirmed on the live application on 2026-08-10.
 */
export const SC_BASIC_COLUMN_HEADERS = [
  'Service Type',
  'Service Charge Percentage',
] as const;

/**
 * Column headers on the Service Charge History tab, in display order.
 * Observed during initial exploration of the live application (degraded environment, History tab).
 */
export const SC_HISTORY_COLUMN_HEADERS = [
  'Service Type',
  'Service Charge Percentage',
  'Modified By',
  'Modified On',
] as const;
