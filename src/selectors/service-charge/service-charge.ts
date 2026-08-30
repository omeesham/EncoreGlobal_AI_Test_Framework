// Selectors for Location Settings → Service Charge. Both grids render skeleton rows before
// data, so the load gate is skeleton disappearance, not row existence.
export const serviceCharge = {
  /** Save button. */
  save: '[data-testid="service-charge-save"]',

  // Percentage input for a given row index (0–78).
  // Values live in input.value — textContent returns empty for these inputs.
  percentageByIndex: (n: number) => `[data-testid="service-charge-percentage-${n}"]`,

  /** Matches all percentage inputs — useful for counting or scanning all rows. */
  allPercentageInputs: '[data-testid^="service-charge-percentage-"]',

  /** Skeleton placeholder on both tabs; gone once real data has rendered. */
  skeleton: '[data-slot="skeleton"]',

  // Locate tabs by these accessible names via getByRole('tab').
  // Radix tab ids must never be used — they shift between builds.
  TAB_BASIC_INFORMATION_NAME: 'Basic Information',
  TAB_HISTORY_NAME: 'Service Charge History',
} as const;
