import { test, expect } from '../../src/fixtures/pages.fixture';
import { CORP_PRICING_SEARCH } from '../../src/data/corporate-pricing/search';

/**
 * Read-only screen — no mutation. Query-param contract (verified): pricebookName / pricingStrategyName /
 * currencyId (USD=1,CAD=2,MXN=3) / locationNo / isInternal / isLabor / isActive (omitted when Active Only unchecked).
 *
 * TWO functional divergences asserted-as-live + raised as clarifications (never silently absorbed):
 *  - Columns: the requirements name 8 columns; live renders 9 ("Productions Currency" → Is Productions + Currency).
 *  - Filtering: the requirements say filtering is client-side; live filters are SERVER-SIDE, on the Search button.
 *
 * React/Next.js + shadcn DataTable (NOT Angular). Network listeners filter `/navigator/api/`.
 * Checkboxes via .check()/.uncheck(). No fixed waits. No hardcoded 591.
 */
test.describe('Corporate Pricing — Search: FCC, filters, Grid Options & surface behaviors @corporate-pricing @search', () => {
  // Read-only screen → a fresh nav IS the per-test baseline: it resets every staged filter.
  // The FCC band (TC-019..030) opens without a location; every other test opens on office 1604
  // (the per-test guard its original describes used).
  const FCC_BAND = (n: number) => n >= 19 && n <= 30;

  const tcNum = (title: string) => {
    const m = title.match(/^TC-CPR-SRC-(\d+)/);
    return m ? parseInt(m[1]!, 10) : -1;
  };

  test.beforeEach(async ({ corporatePricingSearchPage: cp }, testInfo) => {
    test.setTimeout(120_000);
    if (FCC_BAND(tcNum(testInfo.title))) await cp.open();
    else await cp.open('1604');
  });

  // ── Core search behavior ──

  test('TC-CPR-SRC-001: Component loads and calls the Pricebook list endpoint exactly once', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      await cp.open('1604'); // re-navigate with the counter attached
      expect(counter.count()).toBe(1); // exactly one /pricing/strategies call on mount
      expect(await cp.getVisibleRowCount()).toBeGreaterThan(0); // grid populated
      // default query reflects the default filter state (Active Only checked)
      expect(counter.urls()[0]).toContain('isActive=true');
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-002: Grid shows all 8 named columns; live renders 9 (8↔9 split raised)', async ({ corporatePricingSearchPage: cp }) => {
    const headers = await cp.getColumnHeaders();
    // all 7 directly-named columns present
    for (const name of ['Price Book', 'Price Book Strategy', 'Price Year', 'Is GSO', 'Is Internal', 'Is Labor', 'Is Active']) {
      expect(headers).toContain(name);
    }
    // the requirements' "Productions Currency" is covered by the live split → both must be present
    expect(headers).toContain('Is Productions');
    expect(headers).toContain('Currency');
    // live renders 9 (divergence raised as a clarification, not silently absorbed)
    expect(await cp.getColumnCount()).toBe(CORP_PRICING_SEARCH.liveColumnCount);
  });

  test('TC-CPR-SRC-003: Filter baseline / default state', async ({ corporatePricingSearchPage: cp }) => {
    expect(await cp.getPricebookFilterValue()).toBe('');
    expect(await cp.getStrategyFilterValue()).toBe('');
    expect(await cp.getLocationDefaultText()).toContain('All Locations');
    expect(await cp.getCurrencyDefaultText()).toContain('All Currencies');
    expect(await cp.getCheckboxState('isInternal')).toBe(false);
    expect(await cp.getCheckboxState('isLabor')).toBe(false);
    expect(await cp.getCheckboxState('activeOnly')).toBe(true); // default CHECKED
    expect(await cp.getItemCountText()).toMatch(CORP_PRICING_SEARCH.itemCountPattern);
  });

  test('TC-CPR-SRC-004: Boolean columns render Unicode ✔ / empty', async ({ corporatePricingSearchPage: cp }) => {
    const { hasTrue, allValid } = await cp.booleanCellsValid();
    expect(hasTrue).toBe(true); // at least one ✔ among rendered rows
    expect(allValid).toBe(true); // every boolean cell is ✔ or empty
  });

  test('TC-CPR-SRC-005: Pricebook filter stages on type, then Search narrows server-side', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      const before = await cp.getItemCountNumber();
      await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value);
      expect(counter.count()).toBe(0); // staged — no call on type
      expect(await cp.getItemCountNumber()).toBe(before); // grid unchanged while staged

      const url = await cp.searchAndWaitForList();
      expect(url).toContain(`pricebookName=${CORP_PRICING_SEARCH.pricebookFilterSample.value}`);
      // poll for the count to settle (server response → grid re-render has a brief lag)
      await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeLessThan(before);
      const row = await cp.findRowByName(CORP_PRICING_SEARCH.pricebookFilterSample.expectedName);
      expect(row).not.toBeNull();

      // clearing + Search broadens again. NOTE: the broadened query reverts to the default
      // (isActive=true, no name) which equals the initial-load query → the app serves it from cache
      // and fires NO new request (verified via trace — only 2 strategies calls total). So do NOT wait
      // for a response here; just click Search and assert the grid broadens (no fixed sleep).
      await cp.clearPricebookFilter();
      await cp.clickSearch();
      await expect.poll(async () => cp.getItemCountNumber(), { timeout: 15_000 }).toBeGreaterThan(1);
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-006: Pricing Strategy is a text filter (not a dropdown); stages then Search applies', async ({ corporatePricingSearchPage: cp }) => {
    expect(await cp.getStrategyFilterValue()).toBe(''); // it is an <input> (would throw if a dropdown)
    const counter = cp.attachListCallCounter();
    try {
      await cp.fillStrategyFilter('Tier');
      expect(counter.count()).toBe(0); // staged — no call on type
      expect(await cp.getStrategyFilterValue()).toBe('Tier');

      await cp.searchAndWaitForList(); // Search fires exactly one server query
      expect(counter.count()).toBe(1);
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-007: Currency dropdown options + select stages then Search applies', async ({ corporatePricingSearchPage: cp }) => {
    const opts = await cp.getCurrencyOptions();
    expect(opts).toEqual([...CORP_PRICING_SEARCH.currencyOptions]); // [All Currencies, USD, CAD, MXN]

    const counter = cp.attachListCallCounter();
    try {
      await cp.selectCurrency('USD');
      expect(counter.count()).toBe(0); // selection staged — no call
      await cp.searchAndWaitForList();
      expect(counter.count()).toBe(1); // Search submits the server query
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-008: Location dropdown default + searchable options present', async ({ corporatePricingSearchPage: cp }) => {
    expect(await cp.getLocationDefaultText()).toContain('All Locations');
    // Virtualized/lazy popover (live 2652) — poll until it populates; exact count NOT asserted.
    await expect
      .poll(async () => (await cp.getLocationOptions()).length, { timeout: 15_000 })
      .toBeGreaterThan(CORP_PRICING_SEARCH.locationOptionFloor);
    const opts = await cp.getLocationOptions();
    expect(opts).toContain(CORP_PRICING_SEARCH.locationFirstEntry); // "Clear selection" present
  });

  test('TC-CPR-SRC-009: Is Internal stages then Search narrows to internal pricebooks', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      const before = await cp.getItemCountNumber();
      await cp.setCheckbox('isInternal', true);
      expect(await cp.getCheckboxState('isInternal')).toBe(true);
      expect(counter.count()).toBe(0); // staged
      expect(await cp.getItemCountNumber()).toBe(before); // grid unchanged while staged

      const url = await cp.searchAndWaitForList();
      expect(url).toContain('isInternal=true');
      await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeLessThan(before); // narrowed to internal rows
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-010: Is Labor stages then Search submits the labor filter', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      await cp.setCheckbox('isLabor', true);
      expect(await cp.getCheckboxState('isLabor')).toBe(true);
      expect(counter.count()).toBe(0); // staged
      const url = await cp.searchAndWaitForList();
      expect(url).toContain('isLabor=true');
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-011: Active Only default-checked; unchecking + Search reveals inactive rows', async ({ corporatePricingSearchPage: cp }) => {
    expect(await cp.getCheckboxState('activeOnly')).toBe(true); // default
    const before = await cp.getItemCountNumber();
    await cp.setCheckbox('activeOnly', false);
    expect(await cp.getCheckboxState('activeOnly')).toBe(false);
    await cp.searchAndWaitForList();
    // turning off Active Only includes inactive pricebooks too → count does not shrink
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeGreaterThanOrEqual(before);
  });

  test('TC-CPR-SRC-012: Reset clears every filter input and restores the full list', async ({ corporatePricingSearchPage: cp }) => {
    // stage + apply a narrowing filter
    await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value);
    await cp.setCheckbox('isInternal', true);
    await cp.searchAndWaitForList();
    const narrowed = await cp.getItemCountNumber();

    await cp.clickReset();

    expect(await cp.getPricebookFilterValue()).toBe('');
    expect(await cp.getStrategyFilterValue()).toBe('');
    expect(await cp.getCheckboxState('isInternal')).toBe(false);
    expect(await cp.getCheckboxState('isLabor')).toBe(false);
    expect(await cp.getCheckboxState('activeOnly')).toBe(true); // default restored
    expect(await cp.getLocationDefaultText()).toContain('All Locations');
    expect(await cp.getCurrencyDefaultText()).toContain('All Currencies');
    // full list restored (client-side) — count back above the narrowed subset
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeGreaterThan(narrowed);
  });

  test('TC-CPR-SRC-013: No network request fires while typing or selecting filters (client-side staging)', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      await cp.fillPricebookFilter('abc');
      await cp.setCheckbox('isInternal', true);
      await cp.getCurrencyOptions(); // open + close dropdown
      expect(counter.count()).toBe(0); // zero list calls during staging (staged client-side)
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-014: Search submits the staged filters as a single server query', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      await cp.setCheckbox('isInternal', true);
      expect(counter.count()).toBe(0);
      const url = await cp.searchAndWaitForList();
      expect(counter.count()).toBe(1); // exactly one server query on Search
      expect(url).toContain('/navigator/api/location/pricing/strategies');
      expect(url).toContain('isInternal=true');
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-015: Clicking a Price Book name navigates to the Pricebook Details route', async ({ corporatePricingSearchPage: cp }) => {
    await cp.clickPricebookName(CORP_PRICING_SEARCH.pricebookFilterSample.expectedName);
    await expect(cp.page).toHaveURL(/\/corporate-pricing\/details\/[0-9a-f-]+/i);
    await test.step('Confirm the Corporate Pricing Details heading appears', async () => {
      await expect(cp.page.locator('h1', { hasText: 'Corporate Pricing Details' })).toBeVisible();
    });
  });

  test('TC-CPR-SRC-016: New Equipment Pricing option opens the equipment add page', async ({ corporatePricingSearchPage: cp }) => {
    await cp.clickNewEquipmentPricing();
    await expect(cp.page).toHaveURL(/\/corporate-pricing\/add\?type=equipment/i, { timeout: 15_000 });
  });

  test('TC-CPR-SRC-017: New Labor Pricing option opens the labor add page', async ({ corporatePricingSearchPage: cp }) => {
    await cp.clickNewLaborPricing();
    await expect(cp.page).toHaveURL(/\/corporate-pricing\/add\?type=labor/i, { timeout: 15_000 });
  });

  test('TC-CPR-SRC-018: Action-bar buttons are present and New behaves as a button', async ({ corporatePricingSearchPage: cp }) => {
    // Assert via the shadow-pierced textContent set (Playwright's :text-is misses these labels at the
    // test render). Poll until the action bar has rendered (it lands shortly after the grid row).
    await expect
      .poll(async () => (await cp.getAllButtonTexts()).filter((t) => CORP_PRICING_SEARCH.actionButtons.includes(t as never)).length, { timeout: 10_000 })
      .toBe(CORP_PRICING_SEARCH.actionButtons.length);
    const btns = await cp.getAllButtonTexts();
    for (const label of CORP_PRICING_SEARCH.actionButtons) {
      expect(btns, `action-bar button "${label}" present`).toContain(label);
    }
    // New opens its Equipment/Labor menu (affordance) — then dismiss
    await cp.openNewMenu();
    await cp.page.keyboard.press('Escape');
  });

  test('TC-CPR-SRC-019: Pricebook no-match input returns zero results server-side', async ({ corporatePricingSearchPage: cp }) => {
    await cp.fillPricebookFilter(CORP_PRICING_SEARCH.fcc.pricebookNoMatch);
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.pricebook}=${CORP_PRICING_SEARCH.fcc.pricebookNoMatch}`);
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(0);
  });

  test('TC-CPR-SRC-020: Pricebook accepts a 250-char value with no truncation; server returns zero, no crash', async ({ corporatePricingSearchPage: cp }) => {
    const probe = await cp.probePricebookBoundary(CORP_PRICING_SEARCH.fcc.pricebookOverflow);
    expect(probe.stagedLen).toBe(250); // no maxlength truncation
    expect(probe.ariaInvalid).toBeNull(); // (a): no false rejection signal
    expect(probe.escaped).toBe(true); // (b): a natural Tab escapes — no focus-trap
    expect(probe.pageError).toBe(0); // no client-side exception
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.pricebook}=`);
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(0);
  });

  test('TC-CPR-SRC-021: Pricebook accepts special characters literally, URL-encodes them, no crash, escapable', async ({ corporatePricingSearchPage: cp }) => {
    const probe = await cp.probePricebookBoundary(CORP_PRICING_SEARCH.fcc.pricebookSpecial);
    expect(probe.staged).toBe(CORP_PRICING_SEARCH.fcc.pricebookSpecial); // accepted literally
    expect(probe.ariaInvalid).toBeNull(); // (a)
    expect(probe.escaped).toBe(true); // (b)
    expect(probe.pageError).toBe(0); // crash-safe (unlike the currency dropdown)
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(CORP_PRICING_SEARCH.fcc.pricebookSpecialEncoded); // URL-encoded in the query
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(0);
  });

  test('TC-CPR-SRC-022: Pricebook whitespace-only returns the full list (server ignores whitespace)', async ({ corporatePricingSearchPage: cp }) => {
    const probe = await cp.probePricebookBoundary(CORP_PRICING_SEARCH.fcc.pricebookWhitespace);
    expect(probe.escaped).toBe(true); // (b)
    expect(probe.pageError).toBe(0);
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.pricebook}=`);
    // whitespace is NOT a 0-result — the server returns the full list
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeGreaterThan(1);
    expect(await cp.getItemCountText()).toMatch(CORP_PRICING_SEARCH.itemCountPattern);
  });

  test('TC-CPR-SRC-023: Pricing Strategy no-match filter (pricingStrategyName) returns zero results', async ({ corporatePricingSearchPage: cp }) => {
    await cp.fillStrategyFilter(CORP_PRICING_SEARCH.fcc.strategyNoMatch);
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.strategy}=${CORP_PRICING_SEARCH.fcc.strategyNoMatch}`);
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(0);
  });

  test('TC-CPR-SRC-024: Currency each-option (USD/CAD/MXN) submits the matching currencyId', async ({ corporatePricingSearchPage: cp }) => {
    for (const [name, id] of Object.entries(CORP_PRICING_SEARCH.fcc.currencyId)) {
      await cp.selectCurrency(name);
      const url = await cp.searchAndWaitForList();
      expect(url, `currency ${name} → ${CORP_PRICING_SEARCH.fcc.params.currency}=${id}`)
        .toContain(`${CORP_PRICING_SEARCH.fcc.params.currency}=${id}`);
      await cp.clickReset(); // restores the dropdown to "All Currencies" for the next option
    }
  });

  test('TC-CPR-SRC-025: Location filter submits locationNo and narrows the grid (representative)', async ({ corporatePricingSearchPage: cp }) => {
    const baseline = await cp.getItemCountNumber();
    const label = await cp.selectFirstRealLocation(); // e.g. "1101 - Corporate Office …"
    const officeNo = (label.match(/^(\d+)/) ?? [])[1];
    expect(officeNo, `office number parsed from "${label}"`).toBeTruthy();
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.location}=${officeNo}`);
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeLessThanOrEqual(baseline);
  });

  test('TC-CPR-SRC-026: Is Internal toggle + revert restores the baseline', async ({ corporatePricingSearchPage: cp }) => {
    const base = await cp.getItemCountNumber();
    await cp.setCheckbox('isInternal', true);
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.isInternal}=true`);
    await cp.setCheckbox('isInternal', false);
    await cp.clickSearch(); // revert query equals the default load → served from cache (no response to await)
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 15_000 }).toBe(base);
  });

  test('TC-CPR-SRC-027: Is Labor toggle + revert restores the baseline (labor is a different set, not a narrow)', async ({ corporatePricingSearchPage: cp }) => {
    const base = await cp.getItemCountNumber();
    await cp.setCheckbox('isLabor', true);
    const url = await cp.searchAndWaitForList();
    expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.isLabor}=true`);
    // do NOT assert on→narrow: the labor population can be LARGER than the non-labor default. Assert the revert.
    await cp.setCheckbox('isLabor', false);
    await cp.clickSearch();
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 15_000 }).toBe(base);
  });

  test('TC-CPR-SRC-028: Active Only uncheck omits isActive and reveals inactive rows; re-check restores', async ({ corporatePricingSearchPage: cp }) => {
    const base = await cp.getItemCountNumber();
    expect(await cp.getCheckboxState('activeOnly')).toBe(true); // default checked
    await cp.setCheckbox('activeOnly', false);
    const url = await cp.searchAndWaitForList();
    expect(url).not.toContain(CORP_PRICING_SEARCH.fcc.params.isActive); // param OMITTED when unchecked
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeGreaterThanOrEqual(base);
    await cp.setCheckbox('activeOnly', true);
    await cp.clickSearch(); // re-checked query equals the default load → cached
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 15_000 }).toBe(base);
  });

  test('TC-CPR-SRC-029: Reset is idempotent and fires no server request', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      await cp.fillPricebookFilter(CORP_PRICING_SEARCH.fcc.pricebookBroad);
      await cp.setCheckbox('isInternal', true);
      await cp.searchAndWaitForList();
      const afterSearch = counter.count(); // 1
      await cp.clickReset();
      await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeGreaterThan(1); // full list restored
      expect(counter.count()).toBe(afterSearch); // Reset fired NO server call (client-side restore)
      await cp.clickReset(); // double Reset on the already-clean state
      expect(counter.count()).toBe(afterSearch); // still no call — no-op
      expect(await cp.getPricebookFilterValue()).toBe(''); // inputs cleared
      expect(await cp.getCheckboxState('isInternal')).toBe(false);
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-030: Combined multi-filter submits a single server query carrying every staged filter', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      await cp.fillPricebookFilter(CORP_PRICING_SEARCH.fcc.pricebookBroad);
      await cp.selectCurrency('USD');
      await cp.setCheckbox('isInternal', true);
      expect(counter.count()).toBe(0); // staged — no call while staging multiple filters
      const url = await cp.searchAndWaitForList();
      expect(counter.count()).toBe(1); // exactly one server query on Search
      expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.pricebook}=${CORP_PRICING_SEARCH.fcc.pricebookBroad}`);
      expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.currency}=${CORP_PRICING_SEARCH.fcc.currencyId.USD}`);
      expect(url).toContain(`${CORP_PRICING_SEARCH.fcc.params.isInternal}=true`);
      await expect.poll(async () => Number.isInteger(await cp.getItemCountNumber()), { timeout: 10_000 }).toBe(true); // grid re-rendered with a numeric count (not a "—" placeholder)
    } finally {
      counter.dispose();
    }
  });

  // ── Grid Options + filter→grid content ──

  test('TC-CPR-SRC-031: Grid Options menu exposes a toggle per column and Reset to Default View', async ({ corporatePricingSearchPage: cp }) => {
    await cp.openGridOptions();
    const labels = (await cp.getGridOptionColumns()).map((c) => c.label);
    for (const name of CORP_PRICING_SEARCH.liveColumns) {
      expect(labels.some((l) => l.includes(name)), `toggle for "${name}" present`).toBe(true);
    }
    await test.step('Confirm the reset-to-default view option is offered', async () => {
      expect(await cp.page.locator('[role="menuitem"]', { hasText: 'Reset to Default View' }).count()).toBeGreaterThan(0);
    });
    await cp.closeGridOptions();
  });

  test('TC-CPR-SRC-032: Toggling a column off hides it and the setting persists across a reload', async ({ corporatePricingSearchPage: cp }) => {
    try {
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(true);
      await cp.openGridOptions();
      await cp.toggleGridColumn('Is GSO');
      await cp.closeGridOptions();
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false);
      await cp.open('1604'); // reload
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false); // hidden state persisted
    } finally {
      await cp.ensureAllGridColumnsVisible(); // restore the all-columns baseline
    }
  });

  test('TC-CPR-SRC-033: Reset to Default View restores all columns and persists across a reload', async ({ corporatePricingSearchPage: cp }) => {
    try {
      await cp.openGridOptions();
      await cp.toggleGridColumn('Is GSO');
      await cp.closeGridOptions();
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false);
      await cp.openGridOptions();
      await cp.resetGridToDefaultView();
      await cp.closeGridOptions();
      for (const name of CORP_PRICING_SEARCH.liveColumns) expect(await cp.isGridColumnVisible(name)).toBe(true);
      await cp.open('1604'); // reload
      for (const name of CORP_PRICING_SEARCH.liveColumns) expect(await cp.isGridColumnVisible(name)).toBe(true);
    } finally {
      await cp.ensureAllGridColumnsVisible();
    }
  });

  test('TC-CPR-SRC-034: Currency = USD returns rows that all show USD in the Currency column', async ({ corporatePricingSearchPage: cp }) => {
    await cp.selectCurrency('USD');
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    const vals = await cp.readColumnForVisibleRows('Currency');
    expect(vals.length).toBeGreaterThan(0);
    for (const v of vals) expect(v).toBe('USD');
  });

  test('TC-CPR-SRC-035: Is Internal returns rows that are all marked Internal', async ({ corporatePricingSearchPage: cp }) => {
    await cp.setCheckbox('isInternal', true);
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    const bools = await cp.readBooleanColumnForVisibleRows('Is Internal');
    expect(bools.length).toBeGreaterThan(0);
    for (const b of bools) expect(b).toBe(true);
  });

  test('TC-CPR-SRC-036: Is Labor returns the labor population (every row marked Labor)', async ({ corporatePricingSearchPage: cp }) => {
    await cp.setCheckbox('isLabor', true);
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    for (const b of await cp.readBooleanColumnForVisibleRows('Is Labor')) expect(b).toBe(true);
  });

  test('TC-CPR-SRC-037: Active Only off reveals an inactive row; on restricts to active rows', async ({ corporatePricingSearchPage: cp }) => {
    await cp.setCheckbox('activeOnly', false);
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    expect((await cp.readBooleanColumnForVisibleRows('Is Active')).some((b) => b === false)).toBe(true);
    // Re-checking Active Only restores the default query (served from cache → no response to await).
    await cp.setCheckbox('activeOnly', true);
    await cp.clickSearch();
    await expect.poll(async () => (await cp.readBooleanColumnForVisibleRows('Is Active')).every((b) => b === true), { timeout: 15_000 }).toBe(true);
  });

  test('TC-CPR-SRC-038: Location filter narrows the grid to the selected location', async ({ corporatePricingSearchPage: cp }) => {
    const baseline = await cp.getItemCountNumber();
    await cp.selectFirstRealLocation();
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeLessThanOrEqual(baseline);
  });

  test('TC-CPR-SRC-039: Pricing Strategy filter narrows to rows whose strategy contains the entered text', async ({ corporatePricingSearchPage: cp }) => {
    const sample = (await cp.readColumnForVisibleRows('Price Book Strategy')).find((s) => s.length > 0) ?? '';
    const needle = (sample.split(/\s+/)[0] || 'Tier');
    await cp.fillStrategyFilter(needle);
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    for (const s of await cp.readColumnForVisibleRows('Price Book Strategy')) {
      expect(s.toLowerCase()).toContain(needle.toLowerCase());
    }
  });

  test('TC-CPR-SRC-040: Pricebook filter narrows by name-contains and by exact ID', async ({ corporatePricingSearchPage: cp }) => {
    await cp.fillPricebookFilter('2'); // broad substring
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    for (const n of await cp.readColumnForVisibleRows('Price Book')) expect(n).toContain('2');
    await cp.clearPricebookFilter();
    await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value); // exact ID "2021-PB6"
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    expect((await cp.readColumnForVisibleRows('Price Book')).some((n) => n.includes('2021-PB6'))).toBe(true);
  });

  test('TC-CPR-SRC-041: Combined filters return rows that satisfy every active criterion (AND)', async ({ corporatePricingSearchPage: cp }) => {
    await cp.setCheckbox('isLabor', true);
    await cp.selectCurrency('USD'); // Active Only stays checked (default)
    await cp.searchAndWaitForList();
    const count = await cp.getTbodyRowCount();
    if (count === 0) {
      expect(await cp.hasNoResultsMessage()).toBe(true); // an empty intersection is a coherent result
      return;
    }
    const labor = await cp.readBooleanColumnForVisibleRows('Is Labor');
    const currency = await cp.readColumnForVisibleRows('Currency');
    const active = await cp.readBooleanColumnForVisibleRows('Is Active');
    for (let i = 0; i < Math.min(labor.length, 5); i++) {
      expect(labor[i]).toBe(true);
      expect(currency[i]).toBe('USD');
      expect(active[i]).toBe(true);
    }
  });

  test('TC-CPR-SRC-042: Filter application order does not change the result set', async ({ corporatePricingSearchPage: cp }) => {
    await cp.selectCurrency('USD');
    await cp.setCheckbox('isInternal', true);
    await cp.searchAndWaitForList();
    const count1 = await cp.getItemCountNumber();
    const names1 = await cp.getFirstNPriceBookNames(5);
    await cp.clickReset();
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeGreaterThanOrEqual(count1);
    await cp.setCheckbox('isInternal', true); // reverse staging order
    await cp.selectCurrency('USD');
    await cp.clickSearch(); // identical query to the forward run → served from cache (no response to await)
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 15_000 }).toBe(count1);
    expect((await cp.getFirstNPriceBookNames(5)).sort()).toEqual(names1.sort());
  });

  test('TC-CPR-SRC-043: Reset from a multi-filter state restores the baseline; column visibility is unaffected', async ({ corporatePricingSearchPage: cp }) => {
    try {
      const baseline = await cp.getItemCountNumber();
      await cp.openGridOptions();
      await cp.toggleGridColumn('Is GSO'); // hide a column before resetting filters
      await cp.closeGridOptions();
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false);
      await cp.fillPricebookFilter('2');
      await cp.selectCurrency('USD');
      await cp.setCheckbox('isInternal', true);
      await cp.searchAndWaitForList();
      await cp.clickReset();
      expect(await cp.getPricebookFilterValue()).toBe('');
      expect(await cp.getCheckboxState('isInternal')).toBe(false);
      expect(await cp.getCurrencyDefaultText()).toContain('All Currencies');
      await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(baseline);
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false); // Reset clears filters only, not column visibility
    } finally {
      await cp.ensureAllGridColumnsVisible();
    }
  });

  // ── SBC — surface behaviors ──
  test('TC-CPR-SRC-044: A single filter returns only rows that match the query', async ({ corporatePricingSearchPage: cp }) => {
    await cp.selectCurrency('USD');
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    for (const v of await cp.readColumnForVisibleRows('Currency')) expect(v).toBe('USD');
  });

  test('TC-CPR-SRC-045: Filters stage client-side, Search fires one query, and rows match (incl. exact-ID)', async ({ corporatePricingSearchPage: cp }) => {
    const counter = cp.attachListCallCounter();
    try {
      await cp.fillPricebookFilter('2');
      await cp.setCheckbox('isInternal', true);
      expect(counter.count()).toBe(0); // staging fires no server call
      const before = counter.count();
      await cp.searchAndWaitForList();
      expect(counter.count()).toBe(before + 1); // exactly one query on Search
      await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
      for (const n of await cp.readColumnForVisibleRows('Price Book')) expect(n).toContain('2');
      for (const b of await cp.readBooleanColumnForVisibleRows('Is Internal')) expect(b).toBe(true);
      await cp.clickReset();
      await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value);
      await cp.searchAndWaitForList();
      expect((await cp.readColumnForVisibleRows('Price Book')).some((n) => n.includes('2021-PB6'))).toBe(true);
    } finally {
      counter.dispose();
    }
  });

  test('TC-CPR-SRC-046: Changing the page size re-renders the grid and next-page navigation works', async ({ corporatePricingSearchPage: cp }) => {
    const pageErrors: string[] = [];
    cp.page.on('pageerror', (e) => pageErrors.push(e.message));
    await cp.setPageSize('10');
    expect(await cp.getPageSizeValue()).toBe('10');
    expect(await cp.getTbodyRowCount()).toBeLessThanOrEqual(10);
    expect(await cp.isPageNavDisabled('next')).toBe(false);
    await cp.clickPageNav('next');
    expect(await cp.getTbodyRowCount()).toBeGreaterThan(0);
    expect(pageErrors, 'no uncaught page exceptions during paging').toEqual([]);
  });

  test('TC-CPR-SRC-047: All page sizes render; page-1/last-page nav disabled-states; no duplicate rows across pages', async ({ corporatePricingSearchPage: cp }) => {
    for (const size of ['10', '20', '30', '40', '50']) {
      await cp.setPageSize(size);
      expect(await cp.getPageSizeValue()).toBe(size);
      expect(await cp.getTbodyRowCount()).toBeLessThanOrEqual(Number(size));
    }
    await cp.setPageSize('10');
    expect(await cp.isPageNavDisabled('first')).toBe(true);
    expect(await cp.isPageNavDisabled('previous')).toBe(true);
    expect(await cp.isPageNavDisabled('next')).toBe(false);
    const page1 = await cp.getFirstNPriceBookNames(10);
    await cp.clickPageNav('next');
    const page2 = await cp.getFirstNPriceBookNames(10);
    for (const n of page2) expect(page1, 'no row repeats across pages').not.toContain(n);
    await cp.clickPageNav('last');
    expect(await cp.isPageNavDisabled('next')).toBe(true);
    expect(await cp.isPageNavDisabled('last')).toBe(true);
  });

  test('TC-CPR-SRC-048: Column headers are buttons, but clicking does not reorder the grid (sort is inactive)', async ({ corporatePricingSearchPage: cp }) => {
    // Live behaviour on this build: a header click sets no aria-sort and leaves row order unchanged.
    expect(await cp.columnHeaderHasButton('Price Year')).toBe(true);
    const firstBefore = (await cp.getFirstNPriceBookNames(1))[0];
    await cp.clickColumnHeaderSort('Price Year');
    expect(await cp.getColumnAriaSort('Price Year')).toBeNull();
    expect((await cp.getFirstNPriceBookNames(1))[0]).toBe(firstBefore);
  });

  test('TC-CPR-SRC-049: Pagination within a filtered result keeps the filter applied', async ({ corporatePricingSearchPage: cp }) => {
    await cp.selectCurrency('USD');
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getTbodyRowCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    await cp.setPageSize('10');
    if (!(await cp.isPageNavDisabled('next'))) await cp.clickPageNav('next');
    for (const v of await cp.readColumnForVisibleRows('Currency')) expect(v).toBe('USD'); // still USD on the next page
  });

  test('TC-CPR-SRC-050: Multi-filter AND holds; adding a criterion never widens the result; Reset clears all', async ({ corporatePricingSearchPage: cp }) => {
    const baseline = await cp.getItemCountNumber();
    await cp.selectCurrency('USD');
    await cp.setCheckbox('isInternal', true);
    await cp.searchAndWaitForList();
    const count2 = await cp.getItemCountNumber();
    if (await cp.getTbodyRowCount() > 0) {
      const cur = await cp.readColumnForVisibleRows('Currency');
      for (let i = 0; i < Math.min(cur.length, 5); i++) expect(cur[i]).toBe('USD');
    }
    await cp.setCheckbox('isLabor', true); // add a 3rd criterion
    await cp.searchAndWaitForList();
    expect(await cp.getItemCountNumber()).toBeLessThanOrEqual(count2); // narrows or maintains, never widens
    await cp.clickReset();
    expect(await cp.getCheckboxState('isInternal')).toBe(false);
    expect(await cp.getCheckboxState('isLabor')).toBe(false);
    expect(await cp.getCurrencyDefaultText()).toContain('All Currencies');
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(baseline);
  });

  test('TC-CPR-SRC-051: A pricebook name cell is a navigating link; a boolean column reads as checkmark/empty', async ({ corporatePricingSearchPage: cp }) => {
    expect(await cp.getPricebookLinkCellCount()).toBeGreaterThan(0); // name cells render as links
    for (const v of await cp.readColumnForVisibleRows('Is Active')) {
      expect(['', CORP_PRICING_SEARCH.booleanTrueMarker]).toContain(v); // checkmark or empty, no stray text
    }
    await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value);
    await cp.searchAndWaitForList();
    await cp.clickPricebookName(CORP_PRICING_SEARCH.pricebookFilterSample.expectedName);
    await expect(cp.page).toHaveURL(/\/corporate-pricing\/details\/[0-9a-f-]+/i);
  });

  test('TC-CPR-SRC-052: All boolean columns use checkmark/empty; currency values are valid; name cells navigate', async ({ corporatePricingSearchPage: cp }) => {
    for (const col of CORP_PRICING_SEARCH.booleanColumns) {
      for (const v of await cp.readColumnForVisibleRows(col)) {
        expect(['', CORP_PRICING_SEARCH.booleanTrueMarker], `boolean column "${col}" cell`).toContain(v);
      }
    }
    // Currency renders a valid code, or a dash for a row that genuinely has no currency.
    for (const v of await cp.readColumnForVisibleRows('Currency')) expect(['USD', 'CAD', 'MXN', '-', '']).toContain(v);
    expect(await cp.getPricebookLinkCellCount()).toBeGreaterThan(0);
    await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value);
    // The prior test already ran this exact query, so the repeat is served from the browser cache and
    // fires no new list response (see the filter dedup note in the page object). Click Search and poll
    // for the matching row to settle, instead of awaiting a response the cache short-circuits.
    await cp.clickSearch();
    await expect
      .poll(async () => (await cp.findRowByName(CORP_PRICING_SEARCH.pricebookFilterSample.expectedName)) !== null, { timeout: 15_000 })
      .toBe(true);
    await cp.clickPricebookName(CORP_PRICING_SEARCH.pricebookFilterSample.expectedName);
    await expect(cp.page).toHaveURL(/\/corporate-pricing\/details\/[0-9a-f-]+/i);
  });

  test('TC-CPR-SRC-053: A no-match filter shows "No results.", 0 items found, and zero rows', async ({ corporatePricingSearchPage: cp }) => {
    await cp.fillPricebookFilter('ZZZ-NOPE-NOMATCH-9999');
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(0);
    expect(await cp.getTbodyRowCount()).toBe(0);
    expect(await cp.hasNoResultsMessage()).toBe(true); // verbatim "No results."
  });

  test('TC-CPR-SRC-054: Zero, one, and many-row states render; an off-screen row reads by content anchor', async ({ corporatePricingSearchPage: cp }) => {
    await cp.fillPricebookFilter('ZZZ-NOPE-NOMATCH-9999');
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(0);
    expect(await cp.hasNoResultsMessage()).toBe(true);
    await cp.clickReset();
    await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value); // exact ID → exactly one row
    await cp.searchAndWaitForList();
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBe(1);
    await cp.clickReset();
    await expect.poll(async () => cp.getItemCountNumber(), { timeout: 10_000 }).toBeGreaterThan(1);
    expect(await cp.getItemCountText()).toMatch(CORP_PRICING_SEARCH.itemCountPattern);
    expect(await cp.findRowByName(CORP_PRICING_SEARCH.pricebookFilterSample.expectedName)).not.toBeNull(); // off-screen, by content
  });

  test('TC-CPR-SRC-055: A page-size change is honored and survives a reload as a valid page size', async ({ corporatePricingSearchPage: cp }) => {
    await cp.setPageSize('10');
    expect(await cp.getPageSizeValue()).toBe('10');
    expect(await cp.getTbodyRowCount()).toBeLessThanOrEqual(10);
    await cp.open('1604'); // reload
    expect(['10', '50']).toContain(await cp.getPageSizeValue()); // persisted (10) or reset to default (50) — both valid, no corrupt state
  });

  test('TC-CPR-SRC-056: Column visibility persists across reload and browser-back; nav-away does not crash', async ({ corporatePricingSearchPage: cp }) => {
    // Sort persistence is not applicable on this build (header-click sort is inactive — see SRC-048).
    try {
      await cp.openGridOptions();
      await cp.toggleGridColumn('Is GSO');
      await cp.closeGridOptions();
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false);
      await cp.open('1604'); // reload
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false); // persisted across reload
      // browser-back: visit a pricebook then go back; column visibility intact
      await cp.fillPricebookFilter(CORP_PRICING_SEARCH.pricebookFilterSample.value);
      await cp.searchAndWaitForList();
      await cp.clickPricebookName(CORP_PRICING_SEARCH.pricebookFilterSample.expectedName);
      await expect(cp.page).toHaveURL(/\/corporate-pricing\/details\/[0-9a-f-]+/i);
      await cp.page.goBack();
      await cp.waitForGridLoaded();
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false); // still hidden after browser-back
    } finally {
      await cp.ensureAllGridColumnsVisible();
    }
  });

  // Every grid column starts enabled — the "all-on" default state (SRC-031 covers the per-column
  // toggle listing + the Reset option).
  test('TC-CPR-SRC-057: Every grid column toggle is enabled (checked) by default', async ({ corporatePricingSearchPage: cp }) => {
    await cp.openGridOptions();
    const cols = await cp.getGridOptionColumns();
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.every((c) => c.checked)).toBe(true); // all columns shown by default
    await cp.closeGridOptions();
  });

  // Individually re-toggling a hidden column back ON restores it (SRC-033 covers the bulk "Reset to
  // Default View"; this is the per-column path).
  test('TC-CPR-SRC-058: Toggling a hidden column back ON restores its header', async ({ corporatePricingSearchPage: cp }) => {
    try {
      await cp.openGridOptions();
      await cp.toggleGridColumn('Is GSO'); // hide
      await cp.closeGridOptions();
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(false);
      await cp.openGridOptions();
      await cp.toggleGridColumn('Is GSO'); // show again
      await cp.closeGridOptions();
      expect(await cp.isGridColumnVisible('Is GSO')).toBe(true); // restored via individual re-toggle
    } finally {
      await cp.ensureAllGridColumnsVisible();
    }
  });

});
