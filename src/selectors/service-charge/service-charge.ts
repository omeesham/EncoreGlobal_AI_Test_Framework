/**
 * Selectors for the Service Charge setup page.
 *
 * Page: Location Settings → Service Charge (`/settings/service-charge`)
 *
 * Two tabs: Basic Information (default, 79-row editable percentage table) and
 * Service Charge History (read-only audit grid).
 *
 * Loading: both grids render skeleton placeholders ([data-slot="skeleton"]) before data
 * arrives. The correct load gate is waiting for skeletons to disappear — rows exist in
 * the DOM while still being placeholders, so waiting for row existence alone returns early.
 *
 * Tabs: Radix-generated tab ids shift between builds. Locate tabs by accessible name using
 * page.getByRole('tab', { name: TAB_*_NAME }) — never by the literal Radix id.
 */
export const serviceCharge = {
  /** Save button. data-testid confirmed on the live application on 2026-08-10. */
  save: '[data-testid="service-charge-save"]',

  /**
   * Percentage input for a given row index (0–78).
   * data-testid pattern confirmed on the live application for all 79 rows.
   * Values live in input.value — textContent returns empty for these inputs.
   */
  percentageByIndex: (n: number) => `[data-testid="service-charge-percentage-${n}"]`,

  /** Matches all percentage inputs — useful for counting or scanning all rows. */
  allPercentageInputs: '[data-testid^="service-charge-percentage-"]',

  /**
   * Skeleton placeholder present on both tabs while data is loading.
   * Disappears when real data has rendered.
   */
  skeleton: '[data-slot="skeleton"]',

  /**
   * Accessible names for the two tabs.
   * Use with page.getByRole('tab', { name: sc.TAB_*_NAME, exact: true }).
   * Radix ids (e.g. radix-_r_10_-trigger-History) must never be used — they shift between builds.
   */
  TAB_BASIC_INFORMATION_NAME: 'Basic Information',
  TAB_HISTORY_NAME: 'Service Charge History',
} as const;
