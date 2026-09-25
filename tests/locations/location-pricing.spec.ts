import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  PRICING_COLUMN_HEADERS,
  PRIMARY_PRICING_DROPDOWNS,
  PRIMARY_PRICING_DROPDOWNS_CAD,
  PRIMARY_PRICING_DROPDOWNS_MXN,
  CURRENCY_FILTER_OPTIONS,
  PRIMARY_TEST_ROW,
  SECONDARY_TEST_ROW,
  MXN_TEST_ROW,
  DEFAULT_CURRENCY_FILTER,
  DROPDOWN_PERSISTENCE_CASES,
  MXN_PRIMARY_PERSISTENCE_CASES,
  MULTI_CURRENCY_OFFICE_NO,
  MEXICO_OFFICE_NO,
  MEXICO_CURRENCY_FILTER_OPTIONS,
  MEXICO_MXN_ROW,
  MEXICO_MXN_LABOR,
  MEXICO_DROPDOWN_PERSISTENCE_CASES,
  DROPDOWN_UNSET,
  PRICING_DEFAULTS_MEXICO,
  CANADA_OFFICE_NO,
  CANADA_CURRENCY_FILTER_OPTIONS,
  CANADA_CAD_ROW,
  CANADA_CAD_ROW_2,
  CANADA_EQUIPMENT_CAD,
  CANADA_EMPTY_CAD_DROPDOWNS,
  PRICING_DEFAULTS_CANADA,
  DATE_TEST_VALUES,
  TC033_DATE_VALUES,
  INVALID_DATE_RANGE,
  PRICING_DEFAULTS,
  PRICING_DEFAULTS_USA,
  USA_OFFICE_NO,
  PRICING_MESSAGES,
  TOGGLE_COLUMN,
} from '../../src/data/locations/location-pricing';
import { SAVE_CHANGES_DIALOG, UNSAVED_CHANGES_DIALOG } from '../../src/data/common';

// Column-header selector keys, in rendered order — the sorting cases address headers by key.
const HEADER_KEYS = [
  'colHeaderPricingStrategy', 'colHeaderPricebook', 'colHeaderCurrency',
  'colHeaderIsAlternative', 'colHeaderUseEffectiveDate',
  'colHeaderStartDate', 'colHeaderEndDate',
] as const;

test.describe('Location Pricing @locations @pricing', () => {
  // Cases that must NOT be reset to baseline first: TC-001 reads the as-loaded state, and the
  // bug-blocked cases drive their own state.
  const NO_RESET_IDS = ['TC-LOC-PRI-001', 'TC-LOC-PRI-025', 'TC-LOC-PRI-067', 'TC-LOC-PRI-066'];
  // Cases that run against the multi-currency office, not the USA office 1606.
  const OFFICE_1605_IDS = [
    // 018/019 live here because 1606 is USD-only: every filter option yields the same rows there,
    // so the filter cannot be shown to do anything.
    'TC-LOC-PRI-018', 'TC-LOC-PRI-019',
    'TC-LOC-PRI-036', 'TC-LOC-PRI-037', 'TC-LOC-PRI-038', 'TC-LOC-PRI-039', 'TC-LOC-PRI-040',
  ];
  // Cases that run against the Mexico office (USD + MXN, no CAD) — a third currency shape that
  // neither 1606 nor 1605 exercises.
  const OFFICE_7147_IDS = [
    'TC-LOC-PRI-068', 'TC-LOC-PRI-069', 'TC-LOC-PRI-070',
    'TC-LOC-PRI-071', 'TC-LOC-PRI-072', 'TC-LOC-PRI-073',
    // The ten primary-dropdown save-cycle cases.
    ...MEXICO_DROPDOWN_PERSISTENCE_CASES.map((c) => c.tcId),
    // Suite L — office-independent controls repeated on Mexico, plus its Corporate Pricing,
    // Include Service Fee and MXN date save cycles.
    'TC-LOC-PRI-098', 'TC-LOC-PRI-099', 'TC-LOC-PRI-100', 'TC-LOC-PRI-101',
    'TC-LOC-PRI-102', 'TC-LOC-PRI-103', 'TC-LOC-PRI-104',
  ];
  // Cases that run against the Canada office (CAD only) — a fourth currency shape.
  const OFFICE_2359_IDS = [
    'TC-LOC-PRI-084', 'TC-LOC-PRI-085', 'TC-LOC-PRI-086', 'TC-LOC-PRI-087', 'TC-LOC-PRI-088',
    'TC-LOC-PRI-089', 'TC-LOC-PRI-090', 'TC-LOC-PRI-091', 'TC-LOC-PRI-092', 'TC-LOC-PRI-093',
    // Suite L — office-independent controls repeated on Canada.
    'TC-LOC-PRI-094', 'TC-LOC-PRI-095', 'TC-LOC-PRI-096', 'TC-LOC-PRI-097',
  ];

  test.beforeEach(async ({ locationPricingPage }, testInfo) => {
    // The setup below navigates and reloads, and navigateToSubTab alone may wait up to 30s for the
    // form to appear (base.page.ts) — which is the ENTIRE default test budget of 30s. On a slow
    // load the hook therefore consumes the whole timeout and the test dies before its body runs;
    // that is what made TC-LOC-PRI-003 flaky, and it could hit any of the cases that rely on the
    // default. Give every case headroom above the hook's own worst case. Cases needing more still
    // override this with their own test.setTimeout().
    test.setTimeout(90_000);

    const isMexico = OFFICE_7147_IDS.some((id) => testInfo.title.startsWith(id));
    const isCanada = OFFICE_2359_IDS.some((id) => testInfo.title.startsWith(id));
    const office = isMexico
      ? MEXICO_OFFICE_NO
      : isCanada
        ? CANADA_OFFICE_NO
        : OFFICE_1605_IDS.some((id) => testInfo.title.startsWith(id))
          ? MULTI_CURRENCY_OFFICE_NO
          : USA_OFFICE_NO;
    // 7147 loads with Include Service Fee UNCHECKED by design. Resetting it against the 1606
    // baseline would flip a real setting on every run, so it gets its own baseline.
    // 2359 also loads with Include Service Fee unchecked, so it gets its own baseline too.
    // 1605 and 1606 also differ (Price Escalator), so every office resets to its own baseline.
    const defaults = isMexico
      ? PRICING_DEFAULTS_MEXICO
      : isCanada
        ? PRICING_DEFAULTS_CANADA
        : office === MULTI_CURRENCY_OFFICE_NO ? PRICING_DEFAULTS : PRICING_DEFAULTS_USA;

    // The grid persists sort + column visibility to localStorage and it SURVIVES A RELOAD, so
    // without this reset a test that sorts silently reorders the grid for every test after it.
    await locationPricingPage.clearGridPreferences();

    if (!(await locationPricingPage.isOnPricingTab())) {
      await locationPricingPage.navigateToPricingTab(office);
    }
    // Clearing before navigation is not enough on its own — the app rewrites the key on render, so
    // clear again and reload so the grid comes back in its API order.
    await locationPricingPage.clearGridPreferences();
    await locationPricingPage.reloadPricingTab(office);

    if (NO_RESET_IDS.some((id) => testInfo.title.startsWith(id))) return;
    await locationPricingPage.ensureDefaultState(defaults, office);
  });

  // ── Suite A — Structure, navigation and defaults (1606) ──────────────────────

  test('TC-LOC-PRI-001: Navigate to the Pricing sub-tab; settings panel and grid both render', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    expect(locationPricingPage.getCurrentUrl(), 'Should be on the Location Settings page').toContain(`locations/${USA_OFFICE_NO}/settings`);
    // Sub-tabs share one URL, so aria-selected is the only trustworthy navigation signal.
    expect(await locationPricingPage.isOnPricingTab(), 'Pricing sub-tab should report itself selected').toBe(true);
    expect(await locationPricingPage.getColumnHeaders()).toEqual([...PRICING_COLUMN_HEADERS]);
  });

  test('TC-LOC-PRI-002: Pricing settings panel renders its four controls, all enabled', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    for (const key of ['chkCorporatePricing', 'chkPriceGuideInclusive', 'chkEnablePriceEscalator']) {
      expect((await locationPricingPage.getCheckboxState(key)).disabled, `${key} should be enabled`).toBe(false);
    }
    expect(await locationPricingPage.getCurrencyFilterValue()).toBe(DEFAULT_CURRENCY_FILTER);
  });

  test('TC-LOC-PRI-003: Default checkbox states on 1606', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    expect((await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked).toBe(PRICING_DEFAULTS_USA.corporatePricing);
    expect((await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked).toBe(PRICING_DEFAULTS_USA.priceGuideInclusive);
    expect((await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked).toBe(PRICING_DEFAULTS_USA.enablePriceEscalator);
  });

  test('TC-LOC-PRI-004: USD currency group renders 5 primary pricing dropdowns, all enabled', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    const result = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, true);
    expect(result.failures.join('; ')).toBe('');
    expect(result.allPassed).toBe(true);
  });

  test('TC-LOC-PRI-005: Primary dropdowns hold a bound value, not the pre-render placeholder', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-004']);
    // The USD dropdowns carry this suite's own values from prior runs, so no specific default can be
    // asserted — only that Angular bound something (a blank read means a stale/empty render).
    for (const key of PRIMARY_PRICING_DROPDOWNS) {
      expect((await locationPricingPage.getDropdownValue(key)).trim(), `${key} should be bound`).not.toBe('');
    }
  });

  test('TC-LOC-PRI-006: Secondary pricing grid renders all 7 column headers in order', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    expect(await locationPricingPage.getVisibleColumnHeaders()).toEqual([...PRICING_COLUMN_HEADERS]);
  });

  test('TC-LOC-PRI-007: Grid renders data rows, each exposing Pricing Strategy text', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    // The grid is virtualized (~979 rows, ~44 rendered), so assert presence, never a fixed count.
    const strategies = await locationPricingPage.getRenderedRowStrategies();
    expect(strategies.length).toBeGreaterThan(0);
    expect(strategies.every((s) => s.length > 0)).toBe(true);
  });

  test('TC-LOC-PRI-008: Grid columns 1-3 are read-only', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-007']);
    expect(await locationPricingPage.getReadOnlyColumnInteractiveCount(PRIMARY_TEST_ROW)).toBe(0);
  });

  test('TC-LOC-PRI-009: Save is disabled on a clean load', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);
  });

  test('TC-LOC-PRI-010: Currency filter defaults to All and offers exactly All and USD on 1606', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-001']);
    expect(await locationPricingPage.getCurrencyFilterValue()).toBe(DEFAULT_CURRENCY_FILTER);
    expect(await locationPricingPage.getCurrencyFilterOptions()).toEqual([...CURRENCY_FILTER_OPTIONS]);
  });

  // ── Suite B — Checkbox field cases ───────────────────────────────────────────

  test('TC-LOC-PRI-011: Unchecking Corporate Pricing flips it and enables Save', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-003']);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    expect((await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked).toBe(false);
    expect(await locationPricingPage.isSaveEnabled()).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-012: Unchecking Corporate Pricing disables all 5 primary dropdowns but retains their values', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-011']);
    const before = [];
    for (const key of PRIMARY_PRICING_DROPDOWNS) before.push(await locationPricingPage.getDropdownValue(key));

    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    const cascade = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, false);
    expect(cascade.failures.join('; ')).toBe('');

    // The cascade disables the controls; it must not clear what they hold.
    const after = [];
    for (const key of PRIMARY_PRICING_DROPDOWNS) after.push(await locationPricingPage.getDropdownValue(key));
    expect(after).toEqual(before);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-013: Re-checking Corporate Pricing re-enables all 5 dropdowns', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-012']);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    await locationPricingPage.checkCheckbox('chkCorporatePricing');
    const result = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, true);
    expect(result.failures.join('; ')).toBe('');
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-014: Corporate Pricing net-zero — editing back to the original re-disables Save', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-011']);
    // Pricing tracks net-zero; Location Legal does NOT (there Save stays enabled after a revert).
    // This case pins the Pricing behaviour so a future change to either surface is caught.
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    expect(await locationPricingPage.isSaveEnabled()).toBe(true);
    await locationPricingPage.checkCheckbox('chkCorporatePricing');
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 5_000 }).toBe(false);
  });

  test('TC-LOC-PRI-015: Toggling Include Service Fee in Price Guides enables Save', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-003']);
    const before = (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked;
    await locationPricingPage[before ? 'uncheckCheckbox' : 'checkCheckbox']('chkPriceGuideInclusive');
    expect((await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked).toBe(!before);
    expect(await locationPricingPage.isSaveEnabled()).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-016: Include Service Fee stays enabled when Corporate Pricing is unchecked', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-011']);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    expect((await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).disabled).toBe(false);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-017: Include Service Fee — toggle, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-015']);
    test.setTimeout(90_000);
    const original = (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked;

    await locationPricingPage[original ? 'uncheckCheckbox' : 'checkCheckbox']('chkPriceGuideInclusive');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked, { timeout: 10_000 }).toBe(!original);

    await locationPricingPage[original ? 'checkCheckbox' : 'uncheckCheckbox']('chkPriceGuideInclusive');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
  });

  test('TC-LOC-PRI-018: Currency filter set to MXN narrows the grid to MXN rows only', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-010']);
    // Runs on 1605. The filter matches strictly on the row's own currency — a USD row drops out
    // under MXN and the MXN rows take over the top of the virtualized window.
    expect(await locationPricingPage.isGridRowVisible(SECONDARY_TEST_ROW), 'USD row starts visible').toBe(true);
    await locationPricingPage.selectCurrencyFilter('MXN');
    await expect.poll(async () => locationPricingPage.isGridRowVisible(SECONDARY_TEST_ROW), { timeout: 10_000 }).toBe(false);
    expect(await locationPricingPage.isGridRowVisible(MXN_TEST_ROW), 'MXN rows take over the grid').toBe(true);
    await locationPricingPage.reloadPricingTab(MULTI_CURRENCY_OFFICE_NO);
  });

  test('TC-LOC-PRI-019: Currency filter back to All restores the USD rows', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-018']);
    await locationPricingPage.selectCurrencyFilter('MXN');
    await expect.poll(async () => locationPricingPage.isGridRowVisible(SECONDARY_TEST_ROW), { timeout: 10_000 }).toBe(false);
    await locationPricingPage.selectCurrencyFilter(DEFAULT_CURRENCY_FILTER);
    await expect.poll(async () => locationPricingPage.isGridRowVisible(SECONDARY_TEST_ROW), { timeout: 10_000 }).toBe(true);
    await locationPricingPage.reloadPricingTab(MULTI_CURRENCY_OFFICE_NO);
  });

  // ── Suite C — Grid row cascade and date field cases ──────────────────────────

  test('TC-LOC-PRI-020: Effective dates — full cascade, set both dates, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-021']);
    test.setTimeout(120_000);
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.enterStartDate(PRIMARY_TEST_ROW, DATE_TEST_VALUES.startDate);
    await locationPricingPage.enterEndDate(PRIMARY_TEST_ROW, DATE_TEST_VALUES.endDate);
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => locationPricingPage.getStartDateValue(PRIMARY_TEST_ROW), { timeout: 10_000 }).toBe(DATE_TEST_VALUES.startDate);
    expect(await locationPricingPage.getEndDateValue(PRIMARY_TEST_ROW)).toBe(DATE_TEST_VALUES.endDate);

    await locationPricingPage.uncheckIsAlternative(PRIMARY_TEST_ROW);
    expect((await locationPricingPage.clickSave()).success).toBe(true);
  });

  test('TC-LOC-PRI-021: Is Alternate enables Use Effective Dates but leaves the date fields disabled', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-007']);
    expect((await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW)).disabled).toBe(true);
    await locationPricingPage.checkIsAlternative(PRIMARY_TEST_ROW);

    // The cascade is async — poll rather than reading once.
    await expect.poll(async () => (await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW)).disabled, { timeout: 10_000 }).toBe(false);
    expect((await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW)).checked, 'enabling must not auto-check').toBe(false);
    expect(await locationPricingPage.isStartDateEnabled(PRIMARY_TEST_ROW)).toBe(false);
    expect(await locationPricingPage.isEndDateEnabled(PRIMARY_TEST_ROW)).toBe(false);
    expect(await locationPricingPage.isSaveEnabled()).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-022: Empty Start Date with Use Effective Dates on — announced and escapable', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-021']);
    test.setTimeout(90_000);
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);

    // (a) announced — the invalid state is visible AND explained.
    await expect.poll(async () => locationPricingPage.isDateCellInvalid(PRIMARY_TEST_ROW, 'start'), { timeout: 10_000 }).toBe(true);
    expect(await locationPricingPage.getDateValidationMessage(PRIMARY_TEST_ROW, 'start')).toContain(PRICING_MESSAGES.startDateRequired);
    // and the app blocks the save rather than accepting an incomplete range.
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 5_000 }).toBe(false);

    // (b) escapable — unchecking Use Effective Dates clears the invalid state.
    await locationPricingPage.uncheckUseEffectiveDate(PRIMARY_TEST_ROW);
    await expect.poll(async () => locationPricingPage.isDateCellInvalid(PRIMARY_TEST_ROW, 'start'), { timeout: 10_000 }).toBe(false);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-023: Use Effective Dates enables both date inputs and neither is read-only', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-021']);
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await expect.poll(async () => locationPricingPage.isStartDateEnabled(PRIMARY_TEST_ROW), { timeout: 10_000 }).toBe(true);
    expect(await locationPricingPage.isEndDateEnabled(PRIMARY_TEST_ROW)).toBe(true);
    // Not readonly — the cells accept typed input as well as the calendar popover.
    expect(await locationPricingPage.isStartDateReadOnly(PRIMARY_TEST_ROW)).toBe(false);
    expect(await locationPricingPage.isEndDateReadOnly(PRIMARY_TEST_ROW)).toBe(false);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-024: Unchecking Is Alternate reverses the whole cascade', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-023']);
    test.setTimeout(90_000);
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.enterStartDate(PRIMARY_TEST_ROW, DATE_TEST_VALUES.startDate);

    await locationPricingPage.uncheckIsAlternative(PRIMARY_TEST_ROW);
    await expect.poll(async () => (await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW)).checked, { timeout: 10_000 }).toBe(false);
    expect((await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW)).disabled).toBe(true);
    expect(await locationPricingPage.isStartDateEnabled(PRIMARY_TEST_ROW)).toBe(false);
    expect(await locationPricingPage.getStartDateValue(PRIMARY_TEST_ROW), 'dates clear on reverse cascade').toBe('');
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  // ── Suite D — Save-cycle and primary-dropdown persistence ────────────────────

  test('TC-LOC-PRI-025: Corporate Pricing uncheck saves and the panel reloads to its default checked state', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-011']);
    // Was pinned to BUG-LOC-PRI-001, closed 2026-09-23 as WORKING AS DESIGNED by owner
    // determination: the panel returning to its default state on reload is intended behaviour.
    test.setTimeout(120_000);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked, { timeout: 10_000 }).toBe(true);

    // RESTORE — do not simplify this to a single click. The save above writes
    // isCorporatePricingEnabled=false to the server even though the reloaded panel shows CHECKED,
    // so the office is genuinely disabled while the screen says otherwise. Clicking the checkbox
    // now would be a net-zero UI change and would send nothing (LR-009). Toggling a different
    // field on and off forces two saves that both carry the panel's checked value, which puts the
    // server back to enabled and leaves Enable Price Escalator where it started (either value).
    const escalator = (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked;
    await locationPricingPage[escalator ? 'uncheckCheckbox' : 'checkCheckbox']('chkEnablePriceEscalator');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage[escalator ? 'checkCheckbox' : 'uncheckCheckbox']('chkEnablePriceEscalator');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
  });

  for (const c of DROPDOWN_PERSISTENCE_CASES) {
    test(`${c.tcId}: ${c.label} — select, save, reload, verify, restore`, async ({ locationPricingPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-PRI-004']);
      test.setTimeout(120_000);
      // Self-baselining: the office may already hold this suite's values, so pick whichever of the two
      // fixtures is NOT current — that guarantees the save is a real net change either way.
      const current = (await locationPricingPage.getDropdownValue(c.key)).trim();
      const target = current === c.option ? c.alternateOption : c.option;

      await locationPricingPage.selectPrimaryDropdownOption(c.key, target);
      expect(await locationPricingPage.getDropdownValue(c.key)).toBe(target);
      expect((await locationPricingPage.clickSave()).success).toBe(true);

      await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
      await expect.poll(async () => locationPricingPage.getDropdownValue(c.key), { timeout: 15_000 }).toBe(target);
    });
  }

  test('TC-LOC-PRI-031: A confirmed save fires both pricing save endpoints', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-015']);
    test.setTimeout(90_000);
    const original = (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked;
    await locationPricingPage[original ? 'uncheckCheckbox' : 'checkCheckbox']('chkPriceGuideInclusive');

    const calls = await locationPricingPage.countSaveCallsDuring(async () => {
      expect((await locationPricingPage.clickSave()).success).toBe(true);
    });
    expect(calls, 'save should fire update-properties AND upsert-location-pricebook').toBe(2);

    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    await locationPricingPage[original ? 'checkCheckbox' : 'uncheckCheckbox']('chkPriceGuideInclusive');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
  });

  test('TC-LOC-PRI-032: Save confirmation dialog shows the expected title, body and buttons', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-009']);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    await locationPricingPage.clickSaveButton();
    const dlg = await locationPricingPage.getSaveDialogContent();
    expect(dlg.text).toContain(SAVE_CHANGES_DIALOG.heading);
    expect(dlg.text).toContain(SAVE_CHANGES_DIALOG.body);
    expect(dlg.buttons).toEqual(['Cancel', 'Ok']);
    await locationPricingPage.dismissSaveDialog('Cancel');
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-033: Second effective-date round-trip persists and restores', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-020']);
    test.setTimeout(120_000);
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.enterStartDate(PRIMARY_TEST_ROW, TC033_DATE_VALUES.startDate);
    await locationPricingPage.enterEndDate(PRIMARY_TEST_ROW, TC033_DATE_VALUES.endDate);
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => locationPricingPage.getStartDateValue(PRIMARY_TEST_ROW), { timeout: 10_000 }).toBe(TC033_DATE_VALUES.startDate);

    await locationPricingPage.uncheckIsAlternative(PRIMARY_TEST_ROW);
    expect((await locationPricingPage.clickSave()).success).toBe(true);
  });

  test('TC-LOC-PRI-034: Cancelling the save dialog reaches no server call and keeps the edit', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-032']);
    test.setTimeout(90_000);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');

    const calls = await locationPricingPage.countSaveCallsDuring(async () => {
      await locationPricingPage.clickSaveButton();
      await locationPricingPage.dismissSaveDialog('Cancel');
    });
    expect(calls, 'Cancel must not reach the server').toBe(0);
    expect((await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked, 'the edit survives Cancel').toBe(false);
    expect(await locationPricingPage.isSaveEnabled()).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-035: Closing the save dialog via the X discards exactly like Cancel', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-034']);
    test.setTimeout(90_000);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');

    const calls = await locationPricingPage.countSaveCallsDuring(async () => {
      await locationPricingPage.clickSaveButton();
      await locationPricingPage.dismissSaveDialog('Close');
    });
    expect(calls, 'the X must not reach the server').toBe(0);
    expect((await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked).toBe(false);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  // ── Suite E — Multi-currency, office 1605 ────────────────────────────────────

  test('TC-LOC-PRI-036: Office 1605 renders all 15 primary dropdowns across USD, CAD and MXN', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-004']);
    test.setTimeout(90_000);
    const all = [...PRIMARY_PRICING_DROPDOWNS, ...PRIMARY_PRICING_DROPDOWNS_CAD, ...PRIMARY_PRICING_DROPDOWNS_MXN];
    const result = await locationPricingPage.verifyPrimaryDropdownStates(all, true);
    expect(result.failures.join('; ')).toBe('');
    expect(all.length).toBe(15);
  });

  for (const c of MXN_PRIMARY_PERSISTENCE_CASES) {
    test(`${c.tcId}: ${c.label} on 1605 — select, save, reload, verify, restore`, async ({ locationPricingPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-PRI-036']);
      test.setTimeout(120_000);
      await locationPricingPage.selectPrimaryDropdownOption(c.key, c.option);
      expect((await locationPricingPage.clickSave()).success).toBe(true);

      await locationPricingPage.reloadPricingTab(MULTI_CURRENCY_OFFICE_NO);
      await expect.poll(async () => locationPricingPage.getDropdownValue(c.key), { timeout: 15_000 }).toBe(c.option);

      // 1605's CAD/MXN dropdowns start unset, so the restore returns them to --Select--.
      await locationPricingPage.clearPrimaryDropdown(c.key);
      expect((await locationPricingPage.clickSave()).success).toBe(true);
    });
  }

  test('TC-LOC-PRI-039: Office 1605 currency filter offers All, USD, CAD and MXN', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-010']);
    expect(await locationPricingPage.getCurrencyFilterOptions()).toEqual(['All', 'USD', 'CAD', 'MXN']);
  });

  test('TC-LOC-PRI-040: A pricing dropdown with no matching strategy announces its empty state', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-036']);
    const result = await locationPricingPage.searchDropdownOptions('drpPrimaryLaborPricingMXN', 'zzz-no-such-strategy');
    expect(result.options).toEqual([]);
    expect(result.emptyMessage).toBe(PRICING_MESSAGES.noPricingStrategyFound);
  });

  // ── Suite F — Enable Price Escalator ─────────────────────────────────────────

  // 1606 loads with the escalator CHECKED (its saved value), so these cases toggle away from whatever
  // loads instead of assuming unchecked — the same self-baselining the Include Service Fee cases use.
  test('TC-LOC-PRI-041: Enable Price Escalator renders, is enabled and loads with the office value', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-002']);
    const state = await locationPricingPage.getCheckboxState('chkEnablePriceEscalator');
    expect(state.disabled).toBe(false);
    expect(state.checked).toBe(PRICING_DEFAULTS_USA.enablePriceEscalator);
  });

  test('TC-LOC-PRI-042: Toggling Enable Price Escalator flips it and enables Save', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-041']);
    const before = (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked;
    await locationPricingPage[before ? 'uncheckCheckbox' : 'checkCheckbox']('chkEnablePriceEscalator');
    expect((await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked).toBe(!before);
    expect(await locationPricingPage.isSaveEnabled()).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-043: Enable Price Escalator is a standalone boolean with no cascade', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-042']);
    const before = (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked;
    await locationPricingPage[before ? 'uncheckCheckbox' : 'checkCheckbox']('chkEnablePriceEscalator');
    // In neither state may it gate the primary dropdowns the way Corporate Pricing does.
    const result = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS, true);
    expect(result.failures.join('; ')).toBe('');
    expect((await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).disabled).toBe(false);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-044: Enable Price Escalator stays enabled when Corporate Pricing is unchecked', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-041']);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    expect((await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).disabled).toBe(false);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-045: Enable Price Escalator — toggle, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-042']);
    test.setTimeout(120_000);
    const original = (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked;
    await locationPricingPage[original ? 'uncheckCheckbox' : 'checkCheckbox']('chkEnablePriceEscalator');
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked, { timeout: 10_000 }).toBe(!original);

    await locationPricingPage[original ? 'checkCheckbox' : 'uncheckCheckbox']('chkEnablePriceEscalator');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked, { timeout: 10_000 }).toBe(original);
  });

  test('TC-LOC-PRI-046: Enable Price Escalator net-zero — toggling back re-disables Save', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-042']);
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);
    const before = (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked;
    await locationPricingPage[before ? 'uncheckCheckbox' : 'checkCheckbox']('chkEnablePriceEscalator');
    expect(await locationPricingPage.isSaveEnabled()).toBe(true);
    await locationPricingPage[before ? 'checkCheckbox' : 'uncheckCheckbox']('chkEnablePriceEscalator');
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 5_000 }).toBe(false);
  });

  // ── Suite G — Secondary-pricing grid surface families ────────────────────────

  test('TC-LOC-PRI-047: Clicking a column header sorts the grid ascending', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-007']);
    // Content anchor, never row index — the grid is virtualized.
    const before = await locationPricingPage.getFirstRowStrategy();
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    await expect.poll(async () => locationPricingPage.getSortIndicator('colHeaderPricingStrategy'), { timeout: 10_000 }).toBe('asc');
    expect(await locationPricingPage.getFirstRowStrategy()).not.toBe(before);
  });

  test('TC-LOC-PRI-048: Clicking the same header again sorts descending', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-047']);
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    const asc = await locationPricingPage.getFirstRowStrategy();
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    await expect.poll(async () => locationPricingPage.getSortIndicator('colHeaderPricingStrategy'), { timeout: 10_000 }).toBe('desc');
    expect(await locationPricingPage.getFirstRowStrategy()).not.toBe(asc);
  });

  test('TC-LOC-PRI-049: Sort is a two-state toggle with no unsorted third state', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-048']);
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    await expect.poll(async () => locationPricingPage.getSortIndicator('colHeaderPricingStrategy'), { timeout: 10_000 }).toBe('asc');
  });

  test('TC-LOC-PRI-050: Sorting a column clears the indicator on every other column', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-047']);
    test.setTimeout(90_000);
    for (const key of ['colHeaderPricebook', 'colHeaderCurrency', 'colHeaderIsAlternative']) {
      await locationPricingPage.sortByColumn(key);
      await expect.poll(async () => locationPricingPage.getSortIndicator(key), { timeout: 10_000 }).not.toBe('none');
      for (const other of HEADER_KEYS.filter((h) => h !== key)) {
        expect(await locationPricingPage.getSortIndicator(other), `${other} should have no indicator while ${key} is sorted`).toBe('none');
      }
    }
  });

  test('TC-LOC-PRI-051: Sorting does not dirty the form', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-047']);
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);
  });

  test('TC-LOC-PRI-052: Sort survives a full page reload via the stored grid preference', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-047']);
    test.setTimeout(90_000);
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    const sorted = await locationPricingPage.getFirstRowStrategy();

    const prefs = await locationPricingPage.readGridPreferences();
    expect(prefs?.sorting?.[0]?.id).toBe('PricingStrategyName');
    expect(prefs?.sorting?.[0]?.desc).toBe(false);

    // Deliberately NOT clearing the preference — this case exists to prove it persists.
    await locationPricingPage.navigateToPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => locationPricingPage.getFirstRowStrategy(), { timeout: 15_000 }).toBe(sorted);
  });

  test('TC-LOC-PRI-053: Clearing the stored preference restores the default row order', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-052']);
    test.setTimeout(90_000);
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    expect(await locationPricingPage.getFirstRowStrategy()).not.toBe(PRIMARY_TEST_ROW);

    await locationPricingPage.clearGridPreferences();
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
    // This is the guard for the beforeEach reset every other test depends on.
    await expect.poll(async () => locationPricingPage.getFirstRowStrategy(), { timeout: 15_000 }).toBe(PRIMARY_TEST_ROW);
    expect((await locationPricingPage.readGridPreferences())?.sorting).toEqual([]);
  });

  test('TC-LOC-PRI-054: Virtualized grid — rendered rows are a subset readable by content anchor', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-007']);
    const rendered = await locationPricingPage.getRenderedRowStrategies();
    // No strict count: the window size is a rendering detail, not a contract (LR-022/LR-053).
    expect(rendered.length).toBeGreaterThan(0);
    expect(new Set(rendered).size, 'the render window must not duplicate rows').toBe(rendered.length);
    expect(await locationPricingPage.isGridRowVisible(PRIMARY_TEST_ROW)).toBe(true);
  });

  test('TC-LOC-PRI-055: Currency cells render a code or an empty cell, never junk', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-007']);
    // PRIMARY_TEST_ROW is the empty-currency case; it must still render as a row.
    expect(await locationPricingPage.isGridRowDisplayed(PRIMARY_TEST_ROW)).toBe(true);
  });

  test('TC-LOC-PRI-056: Grid booleans are Radix aria-checked, and Use Effective Dates is disabled at rest', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-007']);
    // Boolean render differs per table — this grid uses Radix aria-checked, not a glyph.
    const isAlt = await locationPricingPage.getIsAlternativeState(PRIMARY_TEST_ROW);
    expect(typeof isAlt.checked).toBe('boolean');
    expect(isAlt.disabled).toBe(false);
    expect((await locationPricingPage.getUseEffectiveDateState(PRIMARY_TEST_ROW)).disabled).toBe(true);
  });

  test('TC-LOC-PRI-057: Currency filter and sort compose into one coherent result', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-018', 'TC-LOC-PRI-047']);
    test.setTimeout(90_000);
    await locationPricingPage.selectCurrencyFilter('USD');
    await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
    await expect.poll(async () => locationPricingPage.getSortIndicator('colHeaderPricingStrategy'), { timeout: 10_000 }).toBe('asc');
    // Filter still applied after sorting: the blank-currency row stays out.
    expect(await locationPricingPage.isGridRowVisible(PRIMARY_TEST_ROW)).toBe(false);
    expect((await locationPricingPage.getRenderedRowStrategies()).length).toBeGreaterThan(0);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  // ── Suite H — Grid Options, panel collapse and navigation guard ──────────────

  test('TC-LOC-PRI-058: Grid Options opens a menu listing all 7 columns, all checked', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-006']);
    await locationPricingPage.openGridOptions();
    const cols = await locationPricingPage.getGridOptionsColumns();
    expect(cols.map((c) => c.name)).toEqual([...PRICING_COLUMN_HEADERS]);
    expect(cols.every((c) => c.checked), 'every column starts visible').toBe(true);
  });

  test('TC-LOC-PRI-059: Unchecking a column hides it from the header row and every data row', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-058']);
    test.setTimeout(90_000);
    expect(await locationPricingPage.getFirstRowCellCount()).toBe(PRICING_COLUMN_HEADERS.length);

    await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN);
    await expect.poll(async () => locationPricingPage.getVisibleColumnHeaders(), { timeout: 10_000 })
      .toEqual(PRICING_COLUMN_HEADERS.filter((h) => h !== TOGGLE_COLUMN));
    expect(await locationPricingPage.getFirstRowCellCount()).toBe(PRICING_COLUMN_HEADERS.length - 1);

    await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN); // restore
  });

  test('TC-LOC-PRI-060: Re-checking a column restores it in its original position', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-059']);
    test.setTimeout(90_000);
    await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN);
    await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN);
    await expect.poll(async () => locationPricingPage.getVisibleColumnHeaders(), { timeout: 10_000 }).toEqual([...PRICING_COLUMN_HEADERS]);
  });

  test('TC-LOC-PRI-061: Column visibility does not dirty the form', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-059']);
    test.setTimeout(90_000);
    // The contrast case against BUG-LOC-PRI-003: a sibling view-only control that behaves correctly.
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);
    await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN);
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);
    await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN); // restore
  });

  test('TC-LOC-PRI-062: The settings panel collapses and expands without dirtying the form', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-002']);
    expect(await locationPricingPage.isSettingsPanelExpanded()).toBe(true);
    await locationPricingPage.toggleSettingsPanel();
    await expect.poll(async () => locationPricingPage.isSettingsPanelExpanded(), { timeout: 5_000 }).toBe(false);
    expect(await locationPricingPage.isSaveEnabled()).toBe(false);

    await locationPricingPage.toggleSettingsPanel();
    await expect.poll(async () => locationPricingPage.isSettingsPanelExpanded(), { timeout: 5_000 }).toBe(true);
  });

  test('TC-LOC-PRI-063: Navigating away with a dirty form raises the unsaved-changes guard', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-011']);
    test.setTimeout(90_000);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    await locationPricingPage.clickSidebarHome();
    expect(await locationPricingPage.isUnsavedDialogVisible()).toBe(true);

    const dlg = await locationPricingPage.getUnsavedDialogContent();
    expect(dlg.text).toContain(UNSAVED_CHANGES_DIALOG.heading);
    expect(dlg.text).toContain(UNSAVED_CHANGES_DIALOG.body);
    expect(dlg.buttons).toEqual(['Stay', 'Discard']);
    await locationPricingPage.clickUnsavedStay();
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-064: Stay keeps you on Pricing with the edit intact', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-063']);
    test.setTimeout(90_000);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    await locationPricingPage.clickSidebarHome();
    expect(await locationPricingPage.isUnsavedDialogVisible()).toBe(true);
    await locationPricingPage.clickUnsavedStay();

    expect(await locationPricingPage.isOnPricingTab()).toBe(true);
    expect((await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked, 'the edit survives Stay').toBe(false);
    await locationPricingPage.reloadPricingTab(USA_OFFICE_NO);
  });

  test('TC-LOC-PRI-065: Discard leaves the page and drops the edit', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-063']);
    test.setTimeout(90_000);
    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    await locationPricingPage.clickSidebarHome();
    expect(await locationPricingPage.isUnsavedDialogVisible()).toBe(true);
    await locationPricingPage.clickUnsavedDiscard();

    await locationPricingPage.navigateToPricingTab(USA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkCorporatePricing')).checked, { timeout: 10_000 }).toBe(true);
  });

  // ── Appended cases — bug-blocked expectations, kept at the end so the file ascends by TC id ──

  test('TC-LOC-PRI-066: Changing the Currency selection marks the form dirty and enables Save', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-018']);
    // Was pinned to BUG-LOC-PRI-003, closed 2026-09-23 by owner determination as NOT a defect:
    // selecting a currency is a real user change, so enabling Save and arming the unsaved-changes
    // guard is the expected response. This case now asserts that accepted behaviour.
    expect(await locationPricingPage.isSaveEnabled(), 'clean load starts pristine').toBe(false);
    await locationPricingPage.selectCurrencyFilter('USD');
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 10_000 }).toBe(true);
    // Reverting to the loaded value is a net-zero change, so Angular marks the form pristine again.
    await locationPricingPage.selectCurrencyFilter(DEFAULT_CURRENCY_FILTER);
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 10_000 }).toBe(false);
  });

  test('TC-LOC-PRI-067: End Date earlier than Start Date is announced and is not persisted', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-022']);
    // Was pinned to BUG-LOC-PRI-002, which was WITHDRAWN on 2026-09-23 as not-a-defect: the End
    // Date cell announces itself with a NATIVE title="Invalid date" tooltip (browser chrome, so it
    // never enters the DOM), and the calendar picker disables every day before the Start Date, so
    // the invalid range is only reachable by typing. This case now asserts the correct behaviour.
    test.setTimeout(120_000);
    await locationPricingPage.enableFullCascade(PRIMARY_TEST_ROW);
    await locationPricingPage.typeDateDirectly(PRIMARY_TEST_ROW, 'start', INVALID_DATE_RANGE.startDate);
    await locationPricingPage.typeDateDirectly(PRIMARY_TEST_ROW, 'end', INVALID_DATE_RANGE.endDate);

    // Cross-field validation is async — poll for the invalid state.
    await expect.poll(async () => locationPricingPage.isDateCellInvalid(PRIMARY_TEST_ROW, 'end'), { timeout: 10_000 }).toBe(true);
    // (a) announced — the rejection explains itself rather than being a bare red ring.
    expect(await locationPricingPage.getDateValidationMessage(PRIMARY_TEST_ROW, 'end'), 'the invalid End Date must explain itself').toBe('Invalid date');
    // (b) escapable — clearing the bad value clears the invalid state (field-case-generation §2.1).
    await locationPricingPage.typeDateDirectly(PRIMARY_TEST_ROW, 'end', '');
    await expect.poll(async () => locationPricingPage.isDateCellInvalid(PRIMARY_TEST_ROW, 'end'), { timeout: 10_000 }).toBe(false);

    await locationPricingPage.uncheckIsAlternative(PRIMARY_TEST_ROW);
    expect((await locationPricingPage.clickSave()).success).toBe(true);
  });

  // ── Suite J — Mexico office 7147 (USD + MXN) ─────────────────────────────────
  // A third currency shape. 1606 is USD-only and 1605 is USD/CAD/MXN; neither exercises an office
  // that renders exactly two currency groups. Walked live 2026-09-24.

  test('TC-LOC-PRI-068: Mexico office renders both currency groups and no CAD group', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-004']);
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS), 'USD group renders').toBe(5);
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS_MXN), 'MXN group renders').toBe(5);
    // Presence, not enabled-ness: 7147 has no CAD currency, so the group must not exist at all.
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS_CAD), 'no CAD group on 7147').toBe(0);
  });

  test('TC-LOC-PRI-069: Mexico office currency filter offers exactly All, USD and MXN', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-068']);
    expect(await locationPricingPage.getCurrencyFilterValue()).toBe(DEFAULT_CURRENCY_FILTER);
    expect(await locationPricingPage.getCurrencyFilterOptions()).toEqual([...MEXICO_CURRENCY_FILTER_OPTIONS]);
  });

  test('TC-LOC-PRI-070: MXN filter narrows the Mexico grid to MXN rows only', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-069']);
    // A USD row is on screen under All; the MXN row is far down the virtualized list and is not.
    expect(await locationPricingPage.isGridRowVisible(SECONDARY_TEST_ROW), 'USD row starts visible').toBe(true);
    await locationPricingPage.selectCurrencyFilter('MXN');
    await expect.poll(async () => locationPricingPage.isGridRowVisible(SECONDARY_TEST_ROW), { timeout: 10_000 }).toBe(false);
    expect(await locationPricingPage.isGridRowVisible(MEXICO_MXN_ROW), 'MXN rows take over the grid').toBe(true);
    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
  });

  test('TC-LOC-PRI-071: MXN filter swaps the primary dropdowns to the MXN group only', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-070']);
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS)).toBe(5);
    await locationPricingPage.selectCurrencyFilter('MXN');
    // Selecting a currency narrows the panel to that currency's group — the USD group is removed.
    await expect.poll(async () => locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS), { timeout: 10_000 }).toBe(0);
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS_MXN), 'MXN group stays').toBe(5);
    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
  });

  test('TC-LOC-PRI-072: MXN Primary Labor Pricing — select, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-068']);
    test.setTimeout(150_000);
    // Self-baselining, as the USD persistence cases are: pick whichever fixture is NOT current so
    // the save is always a real net change.
    const current = (await locationPricingPage.getDropdownValue('drpPrimaryLaborPricingMXN')).trim();
    const target = current === MEXICO_MXN_LABOR.loaded ? MEXICO_MXN_LABOR.alternate : MEXICO_MXN_LABOR.loaded;
    const usdBefore = (await locationPricingPage.getDropdownValue('drpPrimaryLaborPricingUSD')).trim();

    await locationPricingPage.selectPrimaryDropdownOption('drpPrimaryLaborPricingMXN', target);
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
    await expect.poll(async () => locationPricingPage.getDropdownValue('drpPrimaryLaborPricingMXN'), { timeout: 15_000 }).toBe(target);
    // The two currency groups must save independently — changing MXN must not disturb USD.
    expect((await locationPricingPage.getDropdownValue('drpPrimaryLaborPricingUSD')).trim(), 'USD group untouched by an MXN save').toBe(usdBefore);

    await locationPricingPage.selectPrimaryDropdownOption('drpPrimaryLaborPricingMXN', current);
    expect((await locationPricingPage.clickSave()).success).toBe(true);
  });

  test('TC-LOC-PRI-073: Effective-date cascade behaves the same on an MXN row', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-070', 'TC-LOC-PRI-021']);
    test.setTimeout(150_000);
    // The MXN row only renders under the MXN filter.
    await locationPricingPage.selectCurrencyFilter('MXN');
    await expect.poll(async () => locationPricingPage.isGridRowVisible(MEXICO_MXN_ROW), { timeout: 10_000 }).toBe(true);

    expect((await locationPricingPage.getUseEffectiveDateState(MEXICO_MXN_ROW)).disabled, 'starts gated').toBe(true);
    await locationPricingPage.checkIsAlternative(MEXICO_MXN_ROW);
    await expect.poll(async () => (await locationPricingPage.getUseEffectiveDateState(MEXICO_MXN_ROW)).disabled, { timeout: 10_000 }).toBe(false);
    expect(await locationPricingPage.isStartDateEnabled(MEXICO_MXN_ROW), 'dates stay gated until Use Effective Dates').toBe(false);

    await locationPricingPage.checkUseEffectiveDate(MEXICO_MXN_ROW);
    await expect.poll(async () => locationPricingPage.isStartDateEnabled(MEXICO_MXN_ROW), { timeout: 10_000 }).toBe(true);
    // An empty Start Date is announced and blocks the save, exactly as on the USD offices.
    await expect.poll(async () => locationPricingPage.isDateCellInvalid(MEXICO_MXN_ROW, 'start'), { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 10_000 }).toBe(false);

    // Reverse cascade clears everything; nothing was saved, so this leaves 7147 as found.
    await locationPricingPage.uncheckIsAlternative(MEXICO_MXN_ROW);
    await expect.poll(async () => (await locationPricingPage.getUseEffectiveDateState(MEXICO_MXN_ROW)).checked, { timeout: 10_000 }).toBe(false);
    expect((await locationPricingPage.getUseEffectiveDateState(MEXICO_MXN_ROW)).disabled).toBe(true);
    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
  });

  // Save-cycle coverage for ALL TEN primary dropdowns on the Mexico office — five USD and five MXN.
  // Six of them load unset, and the only way back to `--Select--` is to re-click the selected option
  // (Radix toggle). production-labor-MXN has exactly one option, so that toggle is its ONLY route
  // back; if it ever stops working, that case leaves real data changed, which is why the restore is
  // asserted rather than assumed.
  for (const c of MEXICO_DROPDOWN_PERSISTENCE_CASES) {
    test(`${c.tcId}: ${c.label} on 7147 — select, save, reload, verify, restore`, async ({ locationPricingPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-PRI-068']);
      test.setTimeout(180_000);
      const original = (await locationPricingPage.getDropdownValue(c.key)).trim();
      expect(original, 'fixture picks a value the office does not already hold').not.toBe(c.option);

      await locationPricingPage.selectPrimaryDropdownOption(c.key, c.option);
      expect((await locationPricingPage.clickSave()).success).toBe(true);

      await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
      await expect.poll(async () => (await locationPricingPage.getDropdownValue(c.key)).trim(), { timeout: 15_000 }).toBe(c.option);

      // Restore. An originally-unset dropdown goes back to --Select-- by deselecting; one that held
      // a value goes back by selecting that value again.
      if (original === DROPDOWN_UNSET) {
        await locationPricingPage.clearPrimaryDropdown(c.key);
      } else {
        await locationPricingPage.selectPrimaryDropdownOption(c.key, original);
      }
      expect((await locationPricingPage.clickSave()).success).toBe(true);

      // Prove the office was put back as found — a restore that silently no-ops would otherwise
      // leave 7147 permanently changed by every run.
      await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
      await expect.poll(async () => (await locationPricingPage.getDropdownValue(c.key)).trim(), { timeout: 15_000 }).toBe(original);
    });
  }

  // ── Suite K — Canada office 2359 (CAD only) ──────────────────────────────────
  // A fourth currency shape: one currency group and no USD group at all. Walked live 2026-09-25.

  test('TC-LOC-PRI-084: Canada office renders only the CAD group — no USD, no MXN', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-004']);
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS_CAD), 'CAD group renders').toBe(5);
    // Presence, not enabled-ness: 2359 has no USD or MXN currency, so those groups must not exist.
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS), 'no USD group on 2359').toBe(0);
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS_MXN), 'no MXN group on 2359').toBe(0);
    expect(await locationPricingPage.isSaveEnabled(), 'Save disabled on a clean load').toBe(false);
  });

  test('TC-LOC-PRI-085: Canada office currency filter offers exactly All and CAD', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-084']);
    expect(await locationPricingPage.getCurrencyFilterValue()).toBe(DEFAULT_CURRENCY_FILTER);
    expect(await locationPricingPage.getCurrencyFilterOptions()).toEqual([...CANADA_CURRENCY_FILTER_OPTIONS]);
  });

  test('TC-LOC-PRI-086: CAD filter keeps every row and the CAD group — nothing to drop on a CAD-only office', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-085']);
    const before = await locationPricingPage.getRenderedRowStrategies();
    expect(before, 'both CAD rows render under All').toEqual(expect.arrayContaining([CANADA_CAD_ROW, CANADA_CAD_ROW_2]));

    await locationPricingPage.selectCurrencyFilter('CAD');
    await expect.poll(async () => locationPricingPage.getCurrencyFilterValue(), { timeout: 10_000 }).toBe('CAD');
    // Every row is CAD, so the filter must narrow nothing.
    await expect.poll(async () => (await locationPricingPage.getRenderedRowStrategies()).sort(), { timeout: 10_000 }).toEqual([...before].sort());
    expect(await locationPricingPage.countPresentDropdowns(PRIMARY_PRICING_DROPDOWNS_CAD), 'CAD group stays').toBe(5);
    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
  });

  test('TC-LOC-PRI-087: Corporate Pricing cascade disables and re-enables the CAD group, keeping its values', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-084', 'TC-LOC-PRI-012']);
    const before = [];
    for (const key of PRIMARY_PRICING_DROPDOWNS_CAD) before.push(await locationPricingPage.getDropdownValue(key));

    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    const off = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS_CAD, false);
    expect(off.failures.join('; ')).toBe('');
    const after = [];
    for (const key of PRIMARY_PRICING_DROPDOWNS_CAD) after.push(await locationPricingPage.getDropdownValue(key));
    expect(after, 'the cascade disables the controls without clearing them').toEqual(before);

    await locationPricingPage.checkCheckbox('chkCorporatePricing');
    const on = await locationPricingPage.verifyPrimaryDropdownStates(PRIMARY_PRICING_DROPDOWNS_CAD, true);
    expect(on.failures.join('; ')).toBe('');
    // Nothing was saved — back to net-zero.
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 5_000 }).toBe(false);
    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
  });

  test('TC-LOC-PRI-088: Equipment (CAD) lists exactly the office\'s CAD strategies', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-084']);
    const result = await locationPricingPage.searchDropdownOptions(CANADA_EQUIPMENT_CAD.key, '');
    expect(result.options.sort()).toEqual([...CANADA_EQUIPMENT_CAD.options].sort());
  });

  test('TC-LOC-PRI-089: CAD dropdowns with no strategy announce their empty state', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-084']);
    // Data-dependent: as of 2026-09-25 2359 has no CAD labor / internal / production strategies. If
    // one is added, this case fails and the fixture needs updating — not a defect.
    for (const key of CANADA_EMPTY_CAD_DROPDOWNS) {
      const result = await locationPricingPage.searchDropdownOptions(key, '');
      expect(result.options, `${key} has no options`).toEqual([]);
      expect(result.emptyMessage, `${key} announces it`).toBe(PRICING_MESSAGES.noPricingStrategyFound);
    }
  });

  test('TC-LOC-PRI-090: Equipment Pricing (CAD) — select, save, reload, verify, restore to unset', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-088']);
    test.setTimeout(180_000);
    const { key } = CANADA_EQUIPMENT_CAD;
    const original = (await locationPricingPage.getDropdownValue(key)).trim();
    const target = CANADA_EQUIPMENT_CAD.options.find((o) => o !== original) as string;

    await locationPricingPage.selectPrimaryDropdownOption(key, target);
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getDropdownValue(key)).trim(), { timeout: 15_000 }).toBe(target);

    if (original === DROPDOWN_UNSET) {
      await locationPricingPage.clearPrimaryDropdown(key);
    } else {
      await locationPricingPage.selectPrimaryDropdownOption(key, original);
    }
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    // Prove the office was put back as found.
    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getDropdownValue(key)).trim(), { timeout: 15_000 }).toBe(original);
  });

  test('TC-LOC-PRI-091: Effective-date cascade on a CAD row — gated, announced and reversible', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-084', 'TC-LOC-PRI-021']);
    test.setTimeout(150_000);
    expect((await locationPricingPage.getUseEffectiveDateState(CANADA_CAD_ROW)).disabled, 'starts gated').toBe(true);
    await locationPricingPage.checkIsAlternative(CANADA_CAD_ROW);
    await expect.poll(async () => (await locationPricingPage.getUseEffectiveDateState(CANADA_CAD_ROW)).disabled, { timeout: 10_000 }).toBe(false);
    expect(await locationPricingPage.isStartDateEnabled(CANADA_CAD_ROW), 'dates stay gated until Use Effective Dates').toBe(false);

    await locationPricingPage.checkUseEffectiveDate(CANADA_CAD_ROW);
    await expect.poll(async () => locationPricingPage.isStartDateEnabled(CANADA_CAD_ROW), { timeout: 10_000 }).toBe(true);
    // An empty Start Date is announced and blocks the save.
    await expect.poll(async () => locationPricingPage.isDateCellInvalid(CANADA_CAD_ROW, 'start'), { timeout: 10_000 }).toBe(true);
    expect(await locationPricingPage.getDateValidationMessage(CANADA_CAD_ROW, 'start')).toContain(PRICING_MESSAGES.startDateRequired);
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 10_000 }).toBe(false);

    // Reverse cascade; nothing was saved, so this leaves 2359 as found.
    await locationPricingPage.uncheckIsAlternative(CANADA_CAD_ROW);
    await expect.poll(async () => (await locationPricingPage.getUseEffectiveDateState(CANADA_CAD_ROW)).checked, { timeout: 10_000 }).toBe(false);
    expect((await locationPricingPage.getUseEffectiveDateState(CANADA_CAD_ROW)).disabled).toBe(true);
    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
  });

  test('TC-LOC-PRI-092: Effective dates on a CAD row — set both, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-091']);
    test.setTimeout(150_000);
    await locationPricingPage.enableFullCascade(CANADA_CAD_ROW);
    await locationPricingPage.enterStartDate(CANADA_CAD_ROW, DATE_TEST_VALUES.startDate);
    await locationPricingPage.enterEndDate(CANADA_CAD_ROW, DATE_TEST_VALUES.endDate);
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
    await expect.poll(async () => locationPricingPage.getStartDateValue(CANADA_CAD_ROW), { timeout: 10_000 }).toBe(DATE_TEST_VALUES.startDate);
    expect(await locationPricingPage.getEndDateValue(CANADA_CAD_ROW)).toBe(DATE_TEST_VALUES.endDate);
    // The other CAD row must be untouched by a save scoped to this one.
    expect((await locationPricingPage.getIsAlternativeState(CANADA_CAD_ROW_2)).checked).toBe(false);

    await locationPricingPage.uncheckIsAlternative(CANADA_CAD_ROW);
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getIsAlternativeState(CANADA_CAD_ROW)).checked, { timeout: 10_000 }).toBe(false);
  });

  test('TC-LOC-PRI-093: Include Service Fee on 2359 — toggle, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-084', 'TC-LOC-PRI-015']);
    test.setTimeout(120_000);
    const original = (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked;
    expect(original, '2359 loads with Include Service Fee unchecked').toBe(PRICING_DEFAULTS_CANADA.priceGuideInclusive);

    await locationPricingPage.checkCheckbox('chkPriceGuideInclusive');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked, { timeout: 10_000 }).toBe(true);

    await locationPricingPage.uncheckCheckbox('chkPriceGuideInclusive');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(CANADA_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked, { timeout: 10_000 }).toBe(false);
  });
  // ── Suite L — Office-independent controls, repeated on Canada 2359 and Mexico 7147 ──────────
  // Suites A–H prove these on USA 1606. The goal is full coverage on all three countries, so the
  // same controls are exercised on the other two offices too. Each office starts from, and is put
  // back to, its own baseline.
  const COUNTRY_OFFICES = [
    { office: CANADA_OFFICE_NO, country: 'Canada', escalator: 'TC-LOC-PRI-094', panel: 'TC-LOC-PRI-095', gridOptions: 'TC-LOC-PRI-096', sort: 'TC-LOC-PRI-097', dropdowns: PRIMARY_PRICING_DROPDOWNS_CAD },
    { office: MEXICO_OFFICE_NO, country: 'Mexico', escalator: 'TC-LOC-PRI-098', panel: 'TC-LOC-PRI-099', gridOptions: 'TC-LOC-PRI-100', sort: 'TC-LOC-PRI-101', dropdowns: [...PRIMARY_PRICING_DROPDOWNS, ...PRIMARY_PRICING_DROPDOWNS_MXN] },
  ] as const;

  for (const o of COUNTRY_OFFICES) {
    test(`${o.escalator}: Enable Price Escalator on ${o.office} — standalone, toggle, save, reload, verify, restore`, async ({ locationPricingPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-PRI-045']);
      test.setTimeout(150_000);
      const original = (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked;
      await locationPricingPage[original ? 'uncheckCheckbox' : 'checkCheckbox']('chkEnablePriceEscalator');
      expect(await locationPricingPage.isSaveEnabled(), 'toggling dirties the form').toBe(true);
      // Standalone: it must not gate the primary dropdowns the way Corporate Pricing does.
      const cascade = await locationPricingPage.verifyPrimaryDropdownStates(o.dropdowns, true);
      expect(cascade.failures.join('; ')).toBe('');
      expect((await locationPricingPage.clickSave()).success).toBe(true);

      await locationPricingPage.reloadPricingTab(o.office);
      await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked, { timeout: 10_000 }).toBe(!original);

      await locationPricingPage[original ? 'checkCheckbox' : 'uncheckCheckbox']('chkEnablePriceEscalator');
      expect((await locationPricingPage.clickSave()).success).toBe(true);
      await locationPricingPage.reloadPricingTab(o.office);
      await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkEnablePriceEscalator')).checked, { timeout: 10_000 }).toBe(original);
    });

    test(`${o.panel}: Settings panel on ${o.office} collapses and expands without dirtying the form`, async ({ locationPricingPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-PRI-062']);
      expect(await locationPricingPage.isSettingsPanelExpanded()).toBe(true);
      await locationPricingPage.toggleSettingsPanel();
      await expect.poll(async () => locationPricingPage.isSettingsPanelExpanded(), { timeout: 5_000 }).toBe(false);
      expect(await locationPricingPage.isSaveEnabled()).toBe(false);
      await locationPricingPage.toggleSettingsPanel();
      await expect.poll(async () => locationPricingPage.isSettingsPanelExpanded(), { timeout: 5_000 }).toBe(true);
    });

    test(`${o.gridOptions}: Grid Options on ${o.office} — lists 7 columns, hides and restores one, never dirties the form`, async ({ locationPricingPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-PRI-058', 'TC-LOC-PRI-059']);
      test.setTimeout(90_000);
      await locationPricingPage.openGridOptions();
      const cols = await locationPricingPage.getGridOptionsColumns();
      expect(cols.map((c) => c.name)).toEqual([...PRICING_COLUMN_HEADERS]);
      expect(cols.every((c) => c.checked), 'every column starts visible').toBe(true);
      await locationPricingPage.reloadPricingTab(o.office);

      expect(await locationPricingPage.getFirstRowCellCount()).toBe(PRICING_COLUMN_HEADERS.length);
      await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN);
      await expect.poll(async () => locationPricingPage.getVisibleColumnHeaders(), { timeout: 10_000 })
        .toEqual(PRICING_COLUMN_HEADERS.filter((h) => h !== TOGGLE_COLUMN));
      expect(await locationPricingPage.getFirstRowCellCount()).toBe(PRICING_COLUMN_HEADERS.length - 1);
      expect(await locationPricingPage.isSaveEnabled(), 'column visibility is view-only').toBe(false);

      await locationPricingPage.toggleGridColumn(TOGGLE_COLUMN);
      await expect.poll(async () => locationPricingPage.getVisibleColumnHeaders(), { timeout: 10_000 }).toEqual([...PRICING_COLUMN_HEADERS]);
    });

    test(`${o.sort}: Every column header on ${o.office} sorts, owns the only indicator, and never dirties the form`, async ({ locationPricingPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-PRI-047', 'TC-LOC-PRI-050']);
      test.setTimeout(150_000);
      // Two-state toggle on the anchor column: ascending, then descending reverses the first row.
      await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
      await expect.poll(async () => locationPricingPage.getSortIndicator('colHeaderPricingStrategy'), { timeout: 10_000 }).toBe('asc');
      const asc = await locationPricingPage.getFirstRowStrategy();
      await locationPricingPage.sortByColumn('colHeaderPricingStrategy');
      await expect.poll(async () => locationPricingPage.getSortIndicator('colHeaderPricingStrategy'), { timeout: 10_000 }).toBe('desc');
      expect(await locationPricingPage.getFirstRowStrategy(), 'descending reverses the order').not.toBe(asc);

      // Every one of the 7 headers is sortable and clears the indicator on the other six.
      for (const key of HEADER_KEYS) {
        await locationPricingPage.sortByColumn(key);
        await expect.poll(async () => locationPricingPage.getSortIndicator(key), { timeout: 10_000 }).not.toBe('none');
        for (const other of HEADER_KEYS.filter((h) => h !== key)) {
          expect(await locationPricingPage.getSortIndicator(other), `${other} should have no indicator while ${key} is sorted`).toBe('none');
        }
      }
      expect(await locationPricingPage.isSaveEnabled(), 'sorting is view-only').toBe(false);
      await locationPricingPage.clearGridPreferences();
      await locationPricingPage.reloadPricingTab(o.office);
    });
  }

  test('TC-LOC-PRI-102: Corporate Pricing cascade on 7147 disables and re-enables both currency groups, keeping values', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-068', 'TC-LOC-PRI-012']);
    const groups = [...PRIMARY_PRICING_DROPDOWNS, ...PRIMARY_PRICING_DROPDOWNS_MXN];
    const before = [];
    for (const key of groups) before.push(await locationPricingPage.getDropdownValue(key));

    await locationPricingPage.uncheckCheckbox('chkCorporatePricing');
    const off = await locationPricingPage.verifyPrimaryDropdownStates(groups, false);
    expect(off.failures.join('; '), 'all 10 USD + MXN dropdowns disable').toBe('');
    const after = [];
    for (const key of groups) after.push(await locationPricingPage.getDropdownValue(key));
    expect(after, 'the cascade disables the controls without clearing them').toEqual(before);
    expect((await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).disabled, 'Include Service Fee stays enabled').toBe(false);

    await locationPricingPage.checkCheckbox('chkCorporatePricing');
    const on = await locationPricingPage.verifyPrimaryDropdownStates(groups, true);
    expect(on.failures.join('; ')).toBe('');
    await expect.poll(async () => locationPricingPage.isSaveEnabled(), { timeout: 5_000 }).toBe(false);
    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
  });

  test('TC-LOC-PRI-103: Include Service Fee on 7147 — toggle, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-068', 'TC-LOC-PRI-017']);
    test.setTimeout(120_000);
    const original = (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked;
    expect(original, '7147 loads with Include Service Fee unchecked').toBe(PRICING_DEFAULTS_MEXICO.priceGuideInclusive);

    await locationPricingPage.checkCheckbox('chkPriceGuideInclusive');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked, { timeout: 10_000 }).toBe(true);

    await locationPricingPage.uncheckCheckbox('chkPriceGuideInclusive');
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
    await expect.poll(async () => (await locationPricingPage.getCheckboxState('chkPriceGuideInclusive')).checked, { timeout: 10_000 }).toBe(false);
  });

  test('TC-LOC-PRI-104: Effective dates on an MXN row — set both, save, reload, verify, restore', async ({ locationPricingPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-PRI-073', 'TC-LOC-PRI-020']);
    test.setTimeout(180_000);
    // The MXN row only renders under the MXN filter, and the filter resets to All on every reload.
    const showMxnRow = async () => {
      await locationPricingPage.selectCurrencyFilter('MXN');
      await expect.poll(async () => locationPricingPage.isGridRowVisible(MEXICO_MXN_ROW), { timeout: 10_000 }).toBe(true);
    };
    await showMxnRow();
    await locationPricingPage.enableFullCascade(MEXICO_MXN_ROW);
    await locationPricingPage.enterStartDate(MEXICO_MXN_ROW, DATE_TEST_VALUES.startDate);
    await locationPricingPage.enterEndDate(MEXICO_MXN_ROW, DATE_TEST_VALUES.endDate);
    expect((await locationPricingPage.clickSave()).success).toBe(true);

    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
    await showMxnRow();
    await expect.poll(async () => locationPricingPage.getStartDateValue(MEXICO_MXN_ROW), { timeout: 10_000 }).toBe(DATE_TEST_VALUES.startDate);
    expect(await locationPricingPage.getEndDateValue(MEXICO_MXN_ROW)).toBe(DATE_TEST_VALUES.endDate);

    // Restore, and prove it — MEXICO_MXN_ROW is not in the 7147 baseline's grid rows.
    await locationPricingPage.uncheckIsAlternative(MEXICO_MXN_ROW);
    expect((await locationPricingPage.clickSave()).success).toBe(true);
    await locationPricingPage.reloadPricingTab(MEXICO_OFFICE_NO);
    await showMxnRow();
    await expect.poll(async () => (await locationPricingPage.getIsAlternativeState(MEXICO_MXN_ROW)).checked, { timeout: 10_000 }).toBe(false);
    expect(await locationPricingPage.getStartDateValue(MEXICO_MXN_ROW), 'dates cleared').toBe('');
  });
});
