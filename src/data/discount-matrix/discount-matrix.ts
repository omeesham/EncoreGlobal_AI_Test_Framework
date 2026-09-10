/**
 * Test data for the Discount Matrix page (NM-3530).
 *
 * Every constant below was read from the live application on 2026-08-25 (offices 1604 and,
 * for the second-office check, 1101). Dropdown option sets are asserted verbatim; the grid
 * shape constants trace to the build requirement NM-2220 (52-week grid) and were confirmed
 * against the live grid the same day.
 */

/** Primary test office. */
export const DM_OFFICE = '1604';

/** Second authorized office, used to prove the Location Activation listing is country-scoped (same total on both offices), not office-specific. */
export const DM_SECOND_OFFICE = '1101';

/** URL path builder for the Discount Matrix page. */
export const DM_ROUTE = (office: string) => `/locations/${office}/settings/discount-matrix`;

/** Country options, verbatim and complete. */
export const DM_COUNTRIES = ['United States', 'Mexico', 'Canada', 'Bahamas'] as const;

/** Currency options, verbatim and complete. */
export const DM_CURRENCIES = ['USD', 'CAD', 'MXN'] as const;

/** Business Tier options, verbatim and complete. */
export const DM_BUSINESS_TIERS = ['Standard', 'Las Vegas', 'SVP Productions'] as const;

/** Criteria dropdown resting values, in DOM order Country / Currency / Business Tier. */
export const DM_CRITERIA_AT_REST = ['United States', 'USD', 'Standard'] as const;

/**
 * GAV Discount Threshold accepted range, measured by typing 15 probe values on 2026-08-25:
 * 0, 1, 50, 99 and 100 accepted; 101 and 999 refused (red outline + Save disabled).
 * The field carries no assertable default — it holds whatever the last save left.
 */
export const DM_THRESHOLD_MIN = '0';
export const DM_THRESHOLD_MAX = '100';
export const DM_THRESHOLD_OVER_MAX = '101';
export const DM_THRESHOLD_FAR_OVER_MAX = '999';

/**
 * Region Weekly Peaks: the seed years the suite was authored against (newest first).
 * The configured list GROWS over time — Add Year creates new years above these and offers
 * no way to delete one — so list assertions treat these as the fixed TAIL of the selector,
 * never as its complete contents.
 */
export const RWP_SEED_YEARS = ['2027', '2026', '2025'] as const;
/**
 * Pinned reference year for exact-date assertions. The tab itself always rests on the
 * NEWEST configured year (measured 2026-08-26), so resting-year checks are computed from
 * the selector; this constant only anchors the date contracts, which need a year that
 * never changes.
 */
export const RWP_YEAR_REFERENCE = '2027';

/** Region Weekly Peaks: region list facts. Atlanta is both the first option and the resting selection. */
export const RWP_REGION_COUNT = 28;
export const RWP_REGION_AT_REST = 'Atlanta';
export const RWP_REGION_MID = 'Austin';
export const RWP_REGION_LAST = 'VA / W PA';
/** The one region with a defect history on this tab (NM-3293) — pinned by TC-DSM-RWP-020. */
export const RWP_REGION_LA_AL = 'LA / AL';
/** Spot-check regions asserted present in the option list. */
export const RWP_REGION_SAMPLES = ['Atlanta', 'LA / AL', 'SF', 'VA / W PA'] as const;

/** Region Weekly Peaks grid shape (NM-2220: one row per week of the selected year). */
export const RWP_WEEK_COUNT = 52;
export const RWP_COLUMNS = ['Week', 'Start Date', 'Non-Peak', 'Standard', 'Peak'] as const;
/**
 * Week 1 start date for the reference year 2027 AS THE SUITE RENDERS IT: the server stores
 * week starts at UTC midnight and the suite pins its browser to the New York timezone
 * (see the timezone setting in the Playwright config), which shifts every rendered date
 * one day back from UTC. A probe running in another timezone will read 03-Jan-2027 for
 * this same week — the pinned suite context is the contract.
 */
export const RWP_2027_WEEK1_START = '02-Jan-2027';

/** Location Activation grid shape (NM-2221). */
export const LOA_COLUMNS = ['Location', 'Workflow Start Date', 'Active'] as const;
/**
 * The corporate office row — the most stable anchor in the country-scoped listing
 * (all US locations; 2041 at measurement time, asserted as format + non-zero, never as a number).
 */
export const LOA_ANCHOR_LOCATION = '1101 - Corporate Office Encore USA SGA';
/** Row used by the Active-flag edit-discard case; its toggle is never saved. */
export const LOA_TOGGLE_LOCATION = '1102 - Corporate Office - Long Beach';
/** A known location number for the search-filter case. */
export const LOA_SEARCH_NUMBER = '1102';
