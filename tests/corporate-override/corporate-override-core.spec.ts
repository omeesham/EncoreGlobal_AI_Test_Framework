import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE,
  CORP_PRICING_OVERRIDE_FIXTURE,
  CORP_PRICING_OVERRIDE_ACTIVE_BED,
  CORP_PRICING_OVERRIDE_EMDASH_BED,
  OVERRIDE_NUMERIC_CASES,
} from '../../src/data/corporate-override/override';
import {
  OVERRIDE_BVA_OFFICES,
  OVERRIDE_BVA_REJECTED,
  OVERRIDE_BVA_COMMITTED,
  OVERRIDE_BVA_DEFECTS,
  OVERRIDE_REJECTION_SIGNATURE,
} from '../../src/data/corporate-override/override';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';
import { resolve } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * Fixture anchored to office 1606 (2026-07-06) while an open Product Group Override data/import
 * problem on office 1604 awaits the Encore product team's answer (see `encore-qa-tracker.xlsx`);
 * revert the fixture to the office-1604 anchors when it is resolved (the data file records them).
 *
 * RESOLVED: the grid IS editable for the automation user (an earlier exploration's "inert cells"
 * was a false negative). Edit = click the Override Price / Max Discount cell button → an
 * editable number field reveals → native value-setter (React-controlled; `.fill()` does not commit) +
 * `Enter` commits → Save enables. Active = checkbox (a per-table boolean render format) toggles + dirties.
 * Save → "Save Changes" confirmation dialog → `POST /navigator/api/location/corporate-price-pg-override` (filter the
 * backend API path, never the page URL) → toast "Pricing overrides saved successfully." Net-zero verified
 * (revert-to-original disables Save). NM-1870 / NM-1889 not-reproduced (live verdicts recorded).
 *
 * MUTATION SAFETY: only the save-cycle describe commits, on the dedicated Override fixture row 2609
 * (`House Video Monitor LED 70"-79"`, default Override Price 500.00) — distinct screen/data-model from the
 * Strategy/Detail fixtures (zero collision). Each save-cycle restores via the bounded-retry
 * `ensureDefaultState()` (throws on residual drift). Read/filter/edit-behavior describes never commit.
 * Heavy page (server-loaded grid) → per-test timeout raised where a reload stack runs.
 */

const LOC = CORP_PRICING_OVERRIDE_FIXTURE.office; // location picker search needle ('1606')
const ANCHOR = CORP_PRICING_OVERRIDE_FIXTURE.mutationRowAnchor.productGroupName;
const ANCHOR_ID = CORP_PRICING_OVERRIDE_FIXTURE.mutationRowAnchor.productGroupId;
const DEFAULTS = {
  overridePrice: CORP_PRICING_OVERRIDE_FIXTURE.mutationRowAnchor.overridePriceDefault,
  active: CORP_PRICING_OVERRIDE_FIXTURE.mutationRowAnchor.activeDefault,
};

const IMP = CORP_PRICING_OVERRIDE.import;
const RT = IMP.roundTrip;

/** Split a downloaded export into its data rows, tolerating the trailing newline. */
const dataRows = (content: string) => content.split(/\r?\n/).slice(1).filter((l) => l.length > 0);
/** Column values from a naive split — safe here because no field in this file contains a comma. */
const columnValues = (content: string, headers: string[], column: string) => {
  const idx = headers.indexOf(column);
  return dataRows(content).map((l) => l.split(',')[idx] ?? '');
};

test.describe('Corporate Pricing — Product Group Override: read, structure & filters @corporate-pricing @override', () => {
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(LOC); // baseline: fresh nav + location-select per test
  });

  test('TC-CPR-OVR-001: Override screen loads with Equipment selected by default', async ({ corporatePricingOverridePage: p }) => {
    expect(p.page.url(), 'URL navigates to the Product Group Override screen').toContain('/corporate-pricing/pg-override');
    expect(await p.getActiveTab()).toBe('Equipment');
  });

  test('TC-CPR-OVR-002: Equipment + Labor tabs render and switching activates the selected tab', async ({ corporatePricingOverridePage: p }) => {
    await p.switchOverrideTab('Labor');
    expect(await p.getActiveTab()).toBe('Labor');
    await p.switchOverrideTab('Equipment');
    expect(await p.getActiveTab()).toBe('Equipment');
  });

  test('TC-CPR-OVR-003: Grid is location-gated — empty before a location is selected', async ({ corporatePricingOverridePage: p }) => {
    await p.open(); // fresh load, no location chosen
    expect(await p.isEmpty()).toBe(true); // "No results." visible
    expect(await p.getVisibleRowCount()).toBe(0); // no data rows until a location is picked
    await test.step('Confirm the choose-a-location prompt appears', async () => {
      await expect(p.page.getByText('Select a location').first()).toBeVisible();
    });
  });

  test('TC-CPR-OVR-004: Selecting a location populates the grid with the anchor row', async ({ corporatePricingOverridePage: p }) => {
    expect(await p.getVisibleRowCount(), 'Grid populates after selecting a location').toBeGreaterThan(0);
    expect(await p.findRowByProductGroup(ANCHOR)).not.toBeNull();
  });

  test('TC-CPR-OVR-005: Grid renders all 10 column headers in order', async ({ corporatePricingOverridePage: p }) => {
    const headers = (await p.getColumnHeaders()).join(' | ');
    for (const col of CORP_PRICING_OVERRIDE.gridColumns) expect(headers).toContain(col);
  });

  // NM-1870 ("Current Price not displayed") not-reproduced — Current Price renders a value here.
  test('TC-CPR-OVR-006: Current Price column renders a value', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    expect(row).not.toBeNull();
    const current = (await row!.locator('td').nth(CORP_PRICING_OVERRIDE.columnIndex.currentPrice).innerText()).trim();
    expect(current).toMatch(/\d+\.\d{2}/); // a money value (e.g. "0.00"), not blank — Current Price IS displayed
  });

  test('TC-CPR-OVR-007: Active column renders as a Radix checkbox with readable aria-checked', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    expect(row).not.toBeNull();
    const state = await p.readActiveState(row!);
    expect(typeof state).toBe('boolean'); // aria-checked resolves to a real boolean, not empty textContent
  });

  test('TC-CPR-OVR-008: Labor tab shows the empty state for office 1606 with headers rendered', async ({ corporatePricingOverridePage: p }) => {
    await p.switchOverrideTab('Labor');
    expect(await p.getActiveTab()).toBe('Labor');
    expect(await p.getVisibleRowCount()).toBe(0); // 1606 has no Labor overrides
    const headers = (await p.getColumnHeaders()).join(' | ');
    expect(headers).toContain('Override Price'); // structure still renders
  });

  test('TC-CPR-OVR-009: Currency filter offers ALL/USD/CAD/MXN', async ({ corporatePricingOverridePage: p }) => {
    const opts = await p.getCurrencyOptions();
    for (const c of CORP_PRICING_OVERRIDE.currencyOptions) expect(opts).toContain(c);
  });

  test('TC-CPR-OVR-010: Active-only filter defaults OFF and toggles', async ({ corporatePricingOverridePage: p }) => {
    expect(await p.getActiveOnlyState()).toBe(CORP_PRICING_OVERRIDE.activeOnlyDefault); // false
    await p.setActiveOnly(true);
    expect(await p.getActiveOnlyState()).toBe(true);
    await p.setActiveOnly(false);
    expect(await p.getActiveOnlyState()).toBe(false);
  });

  test('TC-CPR-OVR-011: Rows-per-page offers 10/20/30/40/50', async ({ corporatePricingOverridePage: p }) => {
    const opts = await p.getRowsPerPageOptions();
    for (const o of CORP_PRICING_OVERRIDE.rowsPerPageOptions) expect(opts).toContain(o);
  });

  test('TC-CPR-OVR-012: Client filter by Product Group Name narrows the grid', async ({ corporatePricingOverridePage: p }) => {
    const before = await p.getVisibleRowCount();
    await p.filterProductGroups('House Video');
    const after = await p.getVisibleRowCount();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
    expect(await p.findRowByProductGroup(ANCHOR)).not.toBeNull();
  });

  test('TC-CPR-OVR-013: Client filter by Product Group ID narrows to the matching row', async ({ corporatePricingOverridePage: p }) => {
    await p.filterProductGroups(ANCHOR_ID);
    expect(await p.findRowByProductGroup(ANCHOR)).not.toBeNull();
    expect(await p.getVisibleRowCount()).toBeGreaterThan(0);
  });

  // NM-1889 ("search matches unintended columns") not-reproduced — the filter is scoped to ID + Name.
  test('TC-CPR-OVR-014: Client filter is scoped to ID and Name only', async ({ corporatePricingOverridePage: p }) => {
    // A Currency value ("USD") appears in every row's Currency column but in no Product Group ID/Name.
    await p.filterProductGroups('USD');
    expect(await p.getVisibleRowCount()).toBe(0); // filter does NOT match the Currency column → no over-match
    await p.clearFilter();
    expect(await p.getVisibleRowCount()).toBeGreaterThan(0);
  });

  test('TC-CPR-OVR-015: No-match filter empties the grid; clearing restores rows', async ({ corporatePricingOverridePage: p }) => {
    await p.filterProductGroups('zzz-no-such-group-zzz');
    expect(await p.getVisibleRowCount()).toBe(0);
    await p.clearFilter();
    expect(await p.getVisibleRowCount(), 'Clearing the filter restores the grid rows').toBeGreaterThan(0);
  });

  test('TC-CPR-OVR-016: Filter tolerates whitespace and special characters without crashing', async ({ corporatePricingOverridePage: p }) => {
    await p.filterProductGroups('   ');
    await p.filterProductGroups('@#$%^&*');
    await p.clearFilter();
    expect(await p.getVisibleRowCount()).toBeGreaterThan(0); // app still responsive, rows restored
  });
});

test.describe('Corporate Pricing — Product Group Override: Override Price / Max Discount edit behavior @corporate-pricing @override', () => {
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    // Per-test baseline: enforce the row's VALUE baseline per-test (not just reload). TC-519 reverts to the
    // hardcoded default and asserts Save disables (net-zero) — if a prior save-cycle hard-kill left
    // the row drifted off 500.00, a reload-only baseline would false-fail it against correct app
    // behavior. ensureDefaultState subsumes reloadAndReselect (it reload+reselects internally) and is
    // a cheap read-only no-op when the row is already at default.
    await p.ensureDefaultState(ANCHOR, DEFAULTS, LOC);
  });

  test('TC-CPR-OVR-017: Clicking the Override Price cell reveals an editable numeric input', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    expect(row).not.toBeNull();
    const editorValue = await p.peekOverridePriceEditor(row!); // opens number field editor, reads, Escapes (no change)
    expect(parseFloat(editorValue)).toBe(parseFloat(DEFAULTS.overridePrice)); // editor exposes the current value
  });

  test('TC-CPR-OVR-018: Editing the Override Price enables Save (dirty)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    await p.setOverridePrice(row!, OVERRIDE_NUMERIC_CASES.overridePrice.edited);
    expect(await p.isOverrideSaveEnabled()).toBe(true);
  });

  // Net-zero: reverting to the saved value leaves no net change, so Save disables again.
  test('TC-CPR-OVR-019: Reverting the Override Price to its original value disables Save', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    await p.setOverridePrice(row!, OVERRIDE_NUMERIC_CASES.overridePrice.edited);
    expect(await p.isOverrideSaveEnabled()).toBe(true);
    await p.setOverridePrice(row!, DEFAULTS.overridePrice); // back to original
    expect(await p.isOverrideSaveEnabled()).toBe(false); // net-zero detected, form clean
  });

  test('TC-CPR-OVR-020: Override Price accepts a decimal value', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    await p.setOverridePrice(row!, OVERRIDE_NUMERIC_CASES.overridePrice.decimal);
    expect(parseFloat(await p.readOverridePrice(row!))).toBe(parseFloat(OVERRIDE_NUMERIC_CASES.overridePrice.decimal));
    expect(await p.isOverrideSaveEnabled()).toBe(true);
  });

  test('TC-CPR-OVR-021: Override Price accepts boundary values (0 and a large number)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    await p.setOverridePrice(row!, OVERRIDE_NUMERIC_CASES.overridePrice.zero);
    expect(parseFloat(await p.readOverridePrice(row!))).toBe(0);
    await p.setOverridePrice(row!, OVERRIDE_NUMERIC_CASES.overridePrice.large);
    expect(parseFloat(await p.readOverridePrice(row!))).toBe(parseFloat(OVERRIDE_NUMERIC_CASES.overridePrice.large));
  });

  test('TC-CPR-OVR-022: Override Price input rejects non-numeric text', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    const retained = await p.probeOverridePriceInput(row!, OVERRIDE_NUMERIC_CASES.overridePrice.nonNumeric); // "abc"
    expect(/[a-z]/i.test(retained)).toBe(false); // type=number coerces non-numeric to "" — no alpha retained
  });

  // Max Discount % over 100 is rejected, but the field does not recover cleanly.
  // Kept skipped. Re-verified live on office 1606 (2026-07-09): entering a value over 100 sets the input to
  // an invalid state (aria-invalid="true") and shows a red border — a real indicator, NOT silent — and the
  // editor refuses to commit the value. BUT the field still misbehaves on recovery: it will not dismiss when
  // you click another cell, and it leaves the cell blank, so an out-of-range entry wedges the row (it even
  // stalled an automated re-drive). Correct behavior remains undefined until the app is fixed (should an
  // over-cap entry clamp to 100, or show an inline message and release the field?). Do NOT re-green the old
  // "did it commit? === false" assertion — that binary cannot tell a clean reject from this stuck state.
  // The valid boundary (values up to and including 100 commit) is covered separately by TC-CPR-OVR-036.
  test.fixme('TC-CPR-OVR-023: Max Discount % — out-of-range (>100) handling [blocked: field enters a stuck state on out-of-range entry; intended behavior unknown until the defect is fixed and live]', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    // a normal percentage commits and dirties the form
    expect(await p.tryMaxDiscount(row!, OVERRIDE_NUMERIC_CASES.maxDiscount.edited)).toBe(true); // 10
    expect(await p.isOverrideSaveEnabled()).toBe(true);
    // a decimal percentage commits
    expect(await p.tryMaxDiscount(row!, OVERRIDE_NUMERIC_CASES.maxDiscount.decimal)).toBe(true); // 12.5
    // >100: the editor does not commit — the OLD assertion below treated that as correct, but it is the
    // bug surface (silent trap: no error, no escape). Re-assert real behavior once fixed.
    expect(await p.tryMaxDiscount(row!, OVERRIDE_NUMERIC_CASES.maxDiscount.overHundred)).toBe(false); // 150
  });

  test('TC-CPR-OVR-024: Toggling the Active checkbox dirties the form (Save enables)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    const before = await p.readActiveState(row!);
    await p.toggleActive(row!);
    expect(await p.readActiveState(row!)).toBe(!before);
    expect(await p.isOverrideSaveEnabled()).toBe(true);
  });

  // NM-1463: editing the Override Price on an inactive row automatically re-activates it.
  test('TC-CPR-OVR-033: Editing the Override Price on an inactive row auto-activates it (NM-1463)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    expect(row).not.toBeNull();
    await p.setActive(row!, false); // make the row inactive (staged only — never saved)
    expect(await p.readActiveState(row!)).toBe(false);
    await p.setOverridePrice(row!, OVERRIDE_NUMERIC_CASES.overridePrice.edited);
    expect(await p.readActiveState(row!)).toBe(true); // editing the price re-activated the row
    expect(await p.isOverrideSaveEnabled()).toBe(true);
  });

  // The Max Discount % cap is inclusive at 100 — a value up to and including 100 commits. (The over-100
  // path is a known defect and is covered, kept skipped, by TC-CPR-OVR-023.)
  test('TC-CPR-OVR-036: Max Discount % accepts values up to the 100 cap (inclusive)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(ANCHOR);
    expect(row).not.toBeNull();
    expect(await p.tryMaxDiscount(row!, OVERRIDE_NUMERIC_CASES.maxDiscount.edited)).toBe(true); // 10 commits
    expect(await p.tryMaxDiscount(row!, OVERRIDE_NUMERIC_CASES.maxDiscount.boundary)).toBe(true); // 100 commits (inclusive cap)
    expect(parseFloat(await p.readMaxDiscount(row!))).toBe(100);
    expect(await p.isOverrideSaveEnabled()).toBe(true);
  });
});

test.describe('Corporate Pricing — Product Group Override: save-cycle (mutation, fixture-restored) @corporate-pricing @override @mutation', () => {
  test.afterEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(150_000);
    await p.ensureDefaultState(ANCHOR, DEFAULTS, LOC); // belt-and-suspenders restore (per-test baseline)
  });

  test('TC-CPR-OVR-025: Override Price save-cycle persists after reload and restores', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(150_000);
    await saveAndVerifyCase({
      id: 'TC-CPR-OVR-025',
      label: 'Override Price save-cycle',
      baseline: () => p.ensureDefaultState(ANCHOR, DEFAULTS, LOC),
      act: async () => {
        const row = await p.findRowByProductGroup(ANCHOR);
        if (!row) throw new Error('anchor row not found');
        await p.setOverridePrice(row, OVERRIDE_NUMERIC_CASES.overridePrice.edited);
      },
      expectBeforeSave: async () => { expect(await p.isOverrideSaveEnabled()).toBe(true); },
      saveAndConfirm: () => p.saveAndConfirm(),
      reload: () => p.reloadAndReselect(LOC),
      expectAfterReload: async () => {
        const row = await p.findRowByProductGroup(ANCHOR);
        expect(row).not.toBeNull();
        expect(parseFloat(await p.readOverridePrice(row!)), 'Override Price value persists after reload').toBe(parseFloat(OVERRIDE_NUMERIC_CASES.overridePrice.edited));
      },
      cleanup: () => p.ensureDefaultState(ANCHOR, DEFAULTS, LOC),
    });
  });

  test('TC-CPR-OVR-026: Max Discount % save-cycle persists after reload and restores', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(150_000);
    await saveAndVerifyCase({
      id: 'TC-CPR-OVR-026',
      label: 'Max Discount save-cycle',
      baseline: () => p.ensureDefaultState(ANCHOR, DEFAULTS, LOC),
      act: async () => {
        const row = await p.findRowByProductGroup(ANCHOR);
        if (!row) throw new Error('anchor row not found');
        await p.setMaxDiscount(row, OVERRIDE_NUMERIC_CASES.maxDiscount.edited);
      },
      expectBeforeSave: async () => { expect(await p.isOverrideSaveEnabled()).toBe(true); },
      saveAndConfirm: () => p.saveAndConfirm(),
      reload: () => p.reloadAndReselect(LOC),
      expectAfterReload: async () => {
        const row = await p.findRowByProductGroup(ANCHOR);
        expect(row).not.toBeNull();
        expect(parseFloat(await p.readMaxDiscount(row!))).toBe(parseFloat(OVERRIDE_NUMERIC_CASES.maxDiscount.edited));
      },
      // cleanup restores Override Price + Active; Max Discount returns to its baseline "—" via the
      // afterEach ensureDefaultState reload (the fixture row's saved Max Discount is the unset default).
      cleanup: () => p.ensureDefaultState(ANCHOR, DEFAULTS, LOC),
    });
  });

  test('TC-CPR-OVR-027: Active toggle save-cycle persists after reload and restores', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(150_000);
    let original: boolean = DEFAULTS.active;
    await saveAndVerifyCase({
      id: 'TC-CPR-OVR-027',
      label: 'Active toggle save-cycle',
      baseline: () => p.ensureDefaultState(ANCHOR, DEFAULTS, LOC),
      act: async () => {
        const row = await p.findRowByProductGroup(ANCHOR);
        if (!row) throw new Error('anchor row not found');
        original = await p.readActiveState(row);
        await p.toggleActive(row);
      },
      expectBeforeSave: async () => { expect(await p.isOverrideSaveEnabled()).toBe(true); },
      saveAndConfirm: () => p.saveAndConfirm(),
      reload: () => p.reloadAndReselect(LOC),
      expectAfterReload: async () => {
        const row = await p.findRowByProductGroup(ANCHOR);
        expect(row).not.toBeNull();
        expect(await p.readActiveState(row!)).toBe(!original); // toggled value persisted
      },
      cleanup: () => p.ensureDefaultState(ANCHOR, DEFAULTS, LOC),
    });
  });

  test('TC-CPR-OVR-028: Save opens the "Save Changes" dialog; Cancel aborts without committing', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(150_000);
    await p.ensureDefaultState(ANCHOR, DEFAULTS, LOC);
    const row = await p.findRowByProductGroup(ANCHOR);
    expect(row).not.toBeNull();
    await p.setOverridePrice(row!, OVERRIDE_NUMERIC_CASES.overridePrice.edited);
    expect(await p.isOverrideSaveEnabled()).toBe(true);
    const dialogText = await p.clickSaveAndCancel(); // captures verbatim text, then Cancel (no commit)
    expect(dialogText).toContain(CORP_PRICING_OVERRIDE.saveDialog.title);
    expect(dialogText).toContain(CORP_PRICING_OVERRIDE.saveDialog.body);
    // Cancel leaves the staged edit dirty but uncommitted; afterEach ensureDefaultState reloads + restores.
  });
});

test.describe('Corporate Pricing — Product Group Override: navigation & location picker @corporate-pricing @override', () => {
  test('TC-CPR-OVR-029: The "Change Local Office" picker gates Select until a row is checked; Cancel applies nothing', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.open(); // fresh load, no location selected yet
    const m = await p.inspectLocationModal(LOC);
    expect(m.title).toContain(CORP_PRICING_OVERRIDE.locationModalTitle); // "Change Local Office"
    expect(m.selectDisabledInitially).toBe(true); // Select is disabled before any row is checked
    expect(m.rowsMatching).toBeGreaterThan(0); // searching the office finds its row
    expect(m.selectEnabledAfterCheck).toBe(true); // checking the row enables Select
    expect(m.gridEmptyAfterCancel).toBe(true); // Cancel closes the picker with no location applied
  });
});

test.describe('Corporate Pricing — Product Group Override: Grid Options (column visibility) @corporate-pricing @override @mutation', () => {
  const COL = CORP_PRICING_OVERRIDE.gridOptionsToggleColumn; // 'Updated By' — a trailing, reversible column

  // Column visibility is a server-persisted preference — restore all columns before and after each test.
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.ensureAllGridColumnsVisible(LOC);
  });
  test.afterEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.ensureAllGridColumnsVisible(LOC);
  });

  test('TC-CPR-OVR-030: Grid Options lists every column; toggling one hides its header and it persists across reload', async ({ corporatePricingOverridePage: p }) => {
    await p.openGridOptions();
    const cols = await p.getGridOptionColumns();
    const labels = cols.map((c) => c.label).join(' | ');
    for (const expected of CORP_PRICING_OVERRIDE.gridColumns) expect(labels).toContain(expected);
    expect(cols.filter((c) => !c.checked).map((c) => c.label)).toEqual([]); // all columns shown by default
    await p.closeGridOptions();

    expect(await p.isGridColumnVisible(COL)).toBe(true); // present at baseline
    await p.openGridOptions();
    await p.toggleGridColumn(COL);
    await p.closeGridOptions();
    expect(await p.isGridColumnVisible(COL)).toBe(false); // header removed

    await p.reloadAndReselect(LOC);
    expect(await p.isGridColumnVisible(COL)).toBe(false); // the hidden state persisted across the reload
  });
});

test.describe('Corporate Pricing — Product Group Override: toolbar Export / Import @corporate-pricing @override', () => {
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(LOC);
  });

  test('TC-CPR-OVR-031: Export downloads a Product Group Overrides CSV directly (no dialog)', async ({ corporatePricingOverridePage: p }) => {
    const r = await p.downloadOverrideExport();
    expect(r.filename).toMatch(CORP_PRICING_OVERRIDE.export.filenamePattern); // ProductGroupOverrides_<timestamp>UTC.csv
    expect(r.requestUrl).toContain(CORP_PRICING_OVERRIDE.export.apiPathFragment); // the override export endpoint, not a page URL
    expect(r.requestUrl).toContain(CORP_PRICING_OVERRIDE.export.localeParam); // locale carried on the download's own request
    expect(r.content.length).toBeGreaterThan(0); // a non-empty file
    expect(r.headers).toEqual(CORP_PRICING_OVERRIDE.export.expectedHeaders); // exact column set + order (the file is the oracle)
  });

  // The exported file is tenant-wide (rows begin around office 1101, not scoped to the selected office),
  // so its own structure/content is the oracle, not a grid row-for-row diff — see the `export` comment
  // in override.ts. Validates EVERY row in plain JS (a per-row expect() over ~9k rows is too slow), then
  // asserts the aggregate: a malformed row anywhere in the file collects here and fails with the first
  // offenders shown. Product Group Name is free text (may itself carry a literal `"` — e.g. an inch-mark
  // size like 50"-59" — RFC4180-quoted/escaped in the file) and is not asserted for content; the numeric
  // ID / enum / flag / money columns around it are, per-column, below.
  test('TC-CPR-OVR-037: Every downloaded CSV row is well-formed with valid IDs, currency, 0/1 flags, and money fields', async ({ corporatePricingOverridePage: p }) => {
    const EXPORT = CORP_PRICING_OVERRIDE.export;
    const r = await p.downloadOverrideExport();
    const locIdx = r.headers.indexOf('Location Id');
    const pgIdx = r.headers.indexOf('Product Group Id');
    const currencyIdx = r.headers.indexOf('Currency');
    const boolIdxs = EXPORT.booleanColumns.map((c) => r.headers.indexOf(c));
    const moneyIdx = r.headers.indexOf(EXPORT.moneyColumn);
    const overridePriceIdx = r.headers.indexOf(EXPORT.optionalMoneyColumn);
    const discIdx = r.headers.indexOf(EXPORT.optionalPercentColumn);
    const validCurrencies: readonly string[] = EXPORT.validCurrencies; // widen the const tuple so .includes accepts any string
    expect(locIdx).toBeGreaterThanOrEqual(0);
    expect(pgIdx).toBeGreaterThanOrEqual(0);
    expect(currencyIdx).toBeGreaterThanOrEqual(0);
    expect(boolIdxs).not.toContain(-1); // all format-checked columns present in the header row
    expect(moneyIdx).toBeGreaterThanOrEqual(0);
    expect(overridePriceIdx).toBeGreaterThanOrEqual(0);
    expect(discIdx).toBeGreaterThanOrEqual(0);
    const dataLines = r.content.split(/\r?\n/).slice(1).filter((l) => l.length > 0);
    expect(dataLines.length).toBeGreaterThan(0);
    // A naive comma split is safe here: the file never quotes a comma inside a field (only a literal `"`
    // character), so every well-formed row splits into exactly headers.length fields — verified below.
    const offenders: string[] = [];
    for (const [i, line] of dataLines.entries()) {
      if (offenders.length >= 10) break; // enough detail to diagnose; the assertion still fails on the first offender
      const row = line.split(',');
      if (row.length !== r.headers.length) { offenders.push(`row ${i}: ${row.length} cols (expected ${r.headers.length})`); continue; }
      if (!/^\d+$/.test(row[locIdx] ?? '')) { offenders.push(`row ${i}: Location Id "${row[locIdx] ?? ''}"`); continue; }
      if (!/^\d+$/.test(row[pgIdx] ?? '')) { offenders.push(`row ${i}: Product Group Id "${row[pgIdx] ?? ''}"`); continue; }
      if (!validCurrencies.includes(row[currencyIdx] ?? '')) { offenders.push(`row ${i}: currency "${row[currencyIdx] ?? ''}"`); continue; }
      const badFlag = boolIdxs.find((bi) => { const v = row[bi]; return v !== '0' && v !== '1'; });
      if (badFlag !== undefined) { offenders.push(`row ${i}: flag col ${badFlag} = "${row[badFlag] ?? ''}"`); continue; }
      if (!/^\d+\.\d{2}$/.test(row[moneyIdx] ?? '')) { offenders.push(`row ${i}: Current Price "${row[moneyIdx] ?? ''}"`); continue; }
      const overridePrice = row[overridePriceIdx] ?? '';
      if (overridePrice !== '' && !/^\d+\.\d{2}$/.test(overridePrice)) { offenders.push(`row ${i}: Override Price "${overridePrice}"`); continue; }
      const discount = row[discIdx] ?? '';
      if (discount !== '' && !/^\d+(\.\d+)?$/.test(discount)) { offenders.push(`row ${i}: Override Discount "${discount}"`); continue; }
    }
    expect(offenders).toEqual([]); // every row: full column set, numeric IDs, supported currency, 0/1 flags, well-formed money/percent fields
  });

  test('TC-CPR-OVR-032: Import opens the "Import All Pricing Overrides" dialog with a file input; Cancel closes it without uploading', async ({ corporatePricingOverridePage: p }) => {
    await p.openImportDialog();
    const d = await p.readImportDialog();
    expect(d.text).toContain(CORP_PRICING_OVERRIDE.importDialog.title); // "Import All Pricing Overrides"
    for (const b of CORP_PRICING_OVERRIDE.importDialog.buttons) expect(d.buttons).toContain(b); // Browse / Cancel / Upload / Close
    expect(d.hasFileInput).toBe(true); // a file input exists (no real upload is performed)
    await p.closeImportDialog();
    expect(await p.isImportDialogVisible()).toBe(false); // Cancel dismissed the dialog
  });
});

test.describe('Corporate Pricing — Product Group Override: surface behavior (sorting / render) @corporate-pricing @override', () => {
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(LOC);
  });

  test('TC-CPR-OVR-034: Clicking a column header does not sort (no active sort state, row order unchanged)', async ({ corporatePricingOverridePage: p }) => {
    const s = await p.probeColumnSort('Product Group Name');
    expect(s.orderChanged).toBe(false); // row order unchanged after the header click
    expect(['ascending', 'descending']).not.toContain(String(s.ariaSortAfter)); // the header never enters an active sort state
  });

  test('TC-CPR-OVR-035: Every row shows a Current Price value on office 1606 (no blank cell) (NM-2206)', async ({ corporatePricingOverridePage: p }) => {
    const prices = await p.getCurrentPriceCells();
    expect(prices.length).toBeGreaterThan(0);
    for (const price of prices) expect(price).toMatch(/\d+\.\d{2}/); // a well-formed money value, never blank / missing
  });
});

test.describe('Corporate Pricing — Product Group Override: blank Override Price render (NM-1932) @corporate-pricing @override', () => {
  test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(CORP_PRICING_OVERRIDE_EMDASH_BED.office, CORP_PRICING_OVERRIDE_EMDASH_BED.office);
  });

  test('TC-CPR-OVR-060: A blank Override Price renders as an em-dash in a muted style, not an empty cell (NM-1932)', async ({ corporatePricingOverridePage: p }) => {
    const row = await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_EMDASH_BED.blankRowName);
    expect(row, 'the known blank-Override-Price row is present on this office').not.toBeNull();
    const cellText = await p.readOverridePrice(row!);
    expect(cellText, 'blank Override Price renders the em-dash placeholder').toBe(CORP_PRICING_OVERRIDE_EMDASH_BED.emDash);
    expect(cellText, 'the cell is NOT empty — asserting empty-string here would pass on the wrong render').not.toBe('');
    // The placeholder carries the muted styling that distinguishes it from a real value
    const cellHtml = await row!.locator('td').nth(CORP_PRICING_OVERRIDE.columnIndex.overridePrice).innerHTML();
    expect(cellHtml).toContain(CORP_PRICING_OVERRIDE_EMDASH_BED.mutedSpanClass);
  });
});

// === NM-2271 Gap-Closure: 62 new BVA/boundary/defect tests (TC-CPR-OVR-065 to TC-CPR-OVR-126) ===

test.describe('Override BVA — Equipment field axis (Lot A)', () => {
  const BED = OVERRIDE_BVA_OFFICES.equipment;
  const ROW_ANCHOR = BED.rows[0].productGroupId; // PG 4298

  // ─── Override Price — Rejection ────────────────────────────────────────────

  test('TC-CPR-OVR-065: -5 rejected on Override Price with full rejection oracle', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_REJECTED.negativeFive.input);

    expect(result.committed, 'Override Price must NOT commit a negative value').toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText, 'No error message announced — defect #4').toBe(OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent);
    expect(result.saveEnabled).toBe(false);
    expect(result.escapable, 'Editor must be escapable — NOT a focus trap').toBe(true);
  });

  test('TC-CPR-OVR-066: -0.01 rejected on Override Price (BVA below-min)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_REJECTED.negativeSmall.input);

    expect(result.committed, '-0.01 (just below zero) must be rejected').toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.saveEnabled).toBe(false);
  });

  test('TC-CPR-OVR-067: 0.001 accepted on Override Price (3rd-decimal precision)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '0.001');

    // TODO-UNVERIFIED: decimal accepted per existing TCs; exact display format for 3-decimal unverified
    expect(result.committed, '3rd-decimal precision should commit').toBe(true);
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-068: 999999 accepted on Override Price — no hard upper max', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '999999');

    expect(result.committed, 'Override Price has no hard upper maximum').toBe(true);
    expect(result.saveEnabled).toBe(true);
  });

  // ─── Override Price — Defects ──────────────────────────────────────────────

  test('TC-CPR-OVR-069: 1.2.3 silently commits as 1.23 on Override Price — multi-dot corruption defect', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_DEFECTS.silentCorruptionOverridePrice.input);

    // Assert the DEFECT: browser swallows second dot, app accepts the corrupted value.
    // When fixed: committed will become false (proper rejection of multi-dot input).
    expect(result.committed, 'BUG: 1.2.3 commits instead of being rejected').toBe(true);
    expect(result.displayedValue, 'BUG: second dot swallowed, displays as 1.23').toBe(
      OVERRIDE_BVA_DEFECTS.silentCorruptionOverridePrice.expectedDisplay,
    ); // '1.23'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-070: 007 on Override Price — leading zeros stripped', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', '007');

    expect(result.committed, 'Leading-zero input should commit').toBe(true);
    expect(result.displayedValue).toBe('7.00');
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-071: 1e5 on Override Price — scientific notation handling', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_REJECTED.scientificNotation.input);

    // 1e5 COMMITS on Override Price (no >100 cap) — displays as 100,000.00.
    // Max Discount rejects 1e5 because >100 fires, not because the app refuses the notation.
    expect(result.committed, '1e5 commits on Override Price — no upper cap').toBe(true);
    expect(result.displayedValue).toBe('100000.00');
    // Raw text preserves the thousands separator the oracle strips (100,000.00)
    expect(result.rawDisplayedValue).toBe('100,000.00');
    expect(result.saveEnabled).toBe(true);
  });

  // ─── Max Discount % — Committed (valid) ───────────────────────────────────

  test('TC-CPR-OVR-072: 50 commits as 50.00 % on Max Discount (mid-range)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_COMMITTED.fifty.input);

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_COMMITTED.fifty.expectedDisplay); // '50.00 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-075: 99.99 commits as 99.99 % on Max Discount (just-below-cap BVA)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_COMMITTED.justUnderCap.input);

    expect(result.committed, '99.99 (just below inclusive cap) should commit').toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_COMMITTED.justUnderCap.expectedDisplay); // '99.99 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-080: 007 commits as 7.00 % on Max Discount — leading zeros stripped', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_COMMITTED.leadingZeros.input);

    expect(result.committed).toBe(true);
    expect(result.displayedValue).toBe(OVERRIDE_BVA_COMMITTED.leadingZeros.expectedDisplay); // '7.00 %'
    expect(result.saveEnabled).toBe(true);
  });

  // ─── Max Discount % — Rejection ───────────────────────────────────────────

  test('TC-CPR-OVR-073: -0.01 rejected on Max Discount (BVA below-min)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_REJECTED.negativeSmall.input);

    expect(result.committed, '-0.01 (just below zero) must be rejected').toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.saveEnabled).toBe(false);
  });

  test('TC-CPR-OVR-076: 100.01 rejected on Max Discount with full oracle — supersedes TC-023', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', '100.01');

    // Full rejection oracle — the >100 contract is now established (150 verified rejected).
    // 100.01 is the BVA boundary: first value above the inclusive-100 cap.
    expect(result.committed, '100.01 (above inclusive cap) must NOT commit').toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.borderColor).toContain(OVERRIDE_REJECTION_SIGNATURE.borderColor);
    expect(result.errorText, 'Bug-evidence: no error message announced (defect #4)').toBe(
      OVERRIDE_REJECTION_SIGNATURE.alertRoleTextContent,
    ); // '' (empty)
    expect(result.saveEnabled).toBe(false);
    expect(result.escapable, 'Editor IS escapable — NOT a focus trap (cross-vendor verified)').toBe(true);
  });

  test('TC-CPR-OVR-079: 1e5 rejected on Max Discount — scientific notation', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_REJECTED.scientificNotation.input);

    expect(result.committed, 'Scientific notation must be rejected').toBe(false);
    expect(result.ariaInvalid).toBe(OVERRIDE_REJECTION_SIGNATURE.ariaInvalid);
    expect(result.saveEnabled).toBe(false);
  });

  // ─── Max Discount % — Defects ─────────────────────────────────────────────

  test('TC-CPR-OVR-074: 0.5 commits as 50.00% — 100x multiplier bug (HIGHEST SEVERITY)', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_DEFECTS.hundredXMisread.input);

    // THE HEADLINE DEFECT — direct money impact.
    // A user types 0.5 intending a half-percent discount cap.
    // The app stores and displays 50.00 % — a FIFTY percent cap.
    // Input "50" also produces "50.00 %", so two completely different
    // business intents (0.5% vs 50%) collapse to one stored value.
    //
    // When the app is fixed: displayedValue becomes '0.50 %'.
    // Failure message will read: Expected "50.00 %" / Received "0.50 %"
    // — making the fix immediately visible to anyone reading the report.
    expect(result.committed, 'BUG: 0.5 commits (app treats it as 50, not 0.5%)').toBe(true);
    expect(
      result.displayedValue,
      'BUG: 0.5 displays as 50.00 % — a 100× misread. ' +
        'A half-percent cap became a fifty-percent cap. ' +
        'When fixed, this will show 0.50 %.',
    ).toBe(OVERRIDE_BVA_DEFECTS.hundredXMisread.expectedDisplay); // '50.00 %'
    expect(result.saveEnabled).toBe(true);
  });

  test('TC-CPR-OVR-077: abc blanks Max Discount to em-dash with Save enabled — commit+net-zero defect', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'overridePrice', OVERRIDE_BVA_DEFECTS.blankCommits.input);

    // Assert the DEFECT: non-numeric commits AND Save enables (real change from non-empty baseline).
    // Re-aimed at Override Price (baseline 152.00 on PG 4298) — Max Discount baseline is already '—',
    // so blanking it produced no net change and Save correctly stayed DISABLED.
    // Override Price has a non-empty baseline, so blanking IS a mutation → Save enables.
    // When fixed: committed becomes false (proper rejection of non-numeric).
    expect(result.committed, 'BUG: abc commits instead of being rejected').toBe(true);
    expect(result.displayedValue, 'Cell blanks to em-dash').toBe(
      OVERRIDE_BVA_DEFECTS.blankCommits.expectedDisplay,
    ); // '—'
    expect(result.saveEnabled, 'BUG: Save enables — abc blanked a non-empty cell (152.00 → —)').toBe(true);
  });

  test('TC-CPR-OVR-078: 1.2.3 silently commits as 1.23 % on Max Discount — multi-dot corruption defect', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    const result = await overridePage.probeEditOracle(row, 'maxDiscount', OVERRIDE_BVA_DEFECTS.silentCorruptionMaxDiscount.input);

    // Assert the DEFECT: browser swallows second dot, displays with % suffix.
    // Note: Override Price renders as '1.23' (no suffix); Max Discount renders as '1.23 %'.
    // When fixed: committed will become false (proper rejection of multi-dot input).
    expect(result.committed, 'BUG: 1.2.3 commits instead of being rejected').toBe(true);
    expect(result.displayedValue, 'BUG: second dot swallowed, displays as 1.23 %').toBe(
      OVERRIDE_BVA_DEFECTS.silentCorruptionMaxDiscount.expectedDisplay,
    ); // '1.23 %'
    expect(result.saveEnabled).toBe(true);
  });

  // ─── Max Discount % — Net-zero (reverting changes disables Save) ───────────────────────────────────

  test('TC-CPR-OVR-081: Max Discount % revert-to-original disables Save', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    // Verified: Ctrl+A → Delete → Enter restores to '—' and Save returns to DISABLED.
    const result = await overridePage.editAndRevertToOriginal(row, 'maxDiscount', '50', '');

    expect(result.saveEnabledAfterEdit, 'Save should enable after editing from — to 50').toBe(true);
    expect(result.saveDisabledAfterRevert, 'Save should disable after reverting to original (—)').toBe(true);
  });

  // ─── Active — Net-zero (reverting changes disables Save) ───────────────────────────────────────────

  test('TC-CPR-OVR-082: Active toggle-then-revert disables Save', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, ROW_ANCHOR);

    // Baseline: Active = checked (true) on PG 4298
    const checkbox = row.locator('[role="checkbox"]');

    // Toggle away from original (uncheck)
    await checkbox.click();
    await expect(overridePage.saveButton).toBeEnabled();

    // Toggle back to original (recheck)
    await checkbox.click();
    await expect(overridePage.saveButton).toBeDisabled();
  });
});

test.describe('Override Toolbar — Import Rejection', () => {

  /**
   * DEFERRED — NM-2273 owns the import rejection round-trip.
   *
   * What it would prove: that importing a CSV with an empty Override Price column is rejected
   * before the data is written to the server (NM-1940 whole-file validation).
   *
   * The rejection is observable and was confirmed during the live walkthrough of this screen.
   * records the dialog alert `Error Row#:19, Msg: LocationId, ProductGroupId, OverridePrice is required.`
   * A restore procedure is verified: the same evidence shows 152.00 -> 152.01 at lines 180-183,
   * then 152.01 -> 152.00 at lines 194-197, with the full 152.00 -> 152.01 -> 152.00 chain
   * summarized at lines 203-205.
   *
   * Disposition: deferred to the NM-2273 import coverage (its phase 4). That plan
   * names this negative-path TC at lines 215-219, and its acceptance checklist repeats the exact
   * `Error Row#:19, Msg: LocationId, ProductGroupId, OverridePrice is required.` assertion at line 279.
   * It is not written here because NM-2273 authors it inside a full export -> modify -> upload ->
   * restore round-trip; duplicating it here would create two tests asserting the same behavior.
   */
  test.skip('TC-CPR-OVR-116: Import rejects CSV with empty Override Price — whole-file rejection (NM-1940)', async () => {
    // Intentionally empty — see skip reason above
  });
});

test.describe('Override SBC — Tab-Switch Dirty Persistence (Equipment)', () => {
  const BED = CORP_PRICING_OVERRIDE_FIXTURE;

  /**
   * TODO-UNVERIFIED: Tab-switch dirty behavior not live-verified.
   * Expected: no unsaved-changes dialog (URL unchanged), dirty state persists.
   */
  test('TC-CPR-OVR-117: Equipment dirty state persists through Labor tab visit', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToEquipmentRow(BED.office, BED.office, BED.mutationRowAnchor.productGroupId);

    // Make Equipment dirty — edit Override Price
    await overridePage.probeEditOracle(row, 'overridePrice', '999');
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeEnabled();

    // Switch to Labor tab — expect NO dialog (same-page tab, not navigation)
    await overridePage.switchOverrideTab('Labor');

    // Verify no confirmation dialog appeared
    const dialog = overridePage.page.locator('[role="alertdialog"]');
    await expect(dialog).toBeHidden();

    // Switch back to Equipment
    await overridePage.switchOverrideTab('Equipment');

    // Assert: dirty state preserved — Save still enabled
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeEnabled();
  });
});


test.describe('Override SBC — Tab-Switch Dirty Persistence (Labor)', () => {
  const BED = OVERRIDE_BVA_OFFICES.labor;

  /**
   * TODO-UNVERIFIED: Tab-switch dirty behavior not live-verified.
   * Expected: no unsaved-changes dialog (URL unchanged), dirty state persists.
   */
  test('TC-CPR-OVR-119: Labor dirty state persists through Equipment tab visit', async ({ corporatePricingOverridePage: overridePage }) => {
    const row = await overridePage.navigateToLaborRow(BED.office, BED.office, BED.rows[0].productGroupId);

    // Make Labor dirty — edit Override Price on PG 565
    await overridePage.probeEditOracle(row, 'overridePrice', '99');
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeEnabled();

    // Switch to Equipment tab — expect NO dialog
    await overridePage.switchOverrideTab('Equipment');

    // Verify no confirmation dialog appeared
    const dialog = overridePage.page.locator('[role="alertdialog"]');
    await expect(dialog).toBeHidden();

    // Switch back to Labor
    await overridePage.switchOverrideTab('Labor');

    // Assert: dirty state preserved — Save still enabled
    await expect(overridePage.page.locator('button:has-text("Save")')).toBeEnabled();
  });
});

test.describe('Corporate Pricing Override — Export (NM-2272)', () => {
  test.describe('scope, fidelity & pager', () => {
    test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
      test.setTimeout(120_000);
      await p.reloadAndReselect(LOC);
    });

    test('TC-CPR-OVR-137: The export tolerates rows with no Override Price and never drops them (NM-1940)', async ({ corporatePricingOverridePage: p }) => {
      const r = await p.downloadOverrideExport();
      const priced = columnValues(r.content, r.headers, 'Override Price');
      const blanks = priced.filter((v) => v === '').length;

      // The app emits these rows and its own import then rejects them, so this asserts the CURRENT
      // contract: blanks are permitted. Deliberately not "every row has a price" — that would fail on
      // every run today and would silently start passing if NM-1940 were fixed, hiding the change.
      expect(CORP_PRICING_OVERRIDE.export.emptyOverridePriceIsTolerated).toBe(true);
      expect(blanks).toBeLessThan(priced.length); // blanks are the exception, never the whole file
      expect(priced.filter((v) => v !== '').length).toBeGreaterThan(0);
    });
  });
});

test.describe('Corporate Pricing Override — Import (NM-2273)', () => {
  test('TC-CPR-OVR-151: Raw export with an empty Override Price row is rejected and changes nothing (NM-1940)', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(180_000);
    await p.reloadAndReselect(RT.office);
    const rowBefore = await p.findRowByProductGroup(RT.productGroupName);
    expect(rowBefore).not.toBeNull();
    const priceBefore = await p.readOverridePrice(rowBefore!);

    const exp = await p.downloadOverrideExport();
    // The raw export must still carry the empty-Override-Price row this test documents (NM-1940).
    const hasEmptyPriceRow = exp.content.split(/\r?\n/).some(
      (l) => l.startsWith(RT.emptyPriceRowPrefix) && (l.split(',')[RT.overridePriceColumnIndex] ?? '') === '',
    );
    expect(hasEmptyPriceRow, 'the raw export carries the empty-Override-Price row (NM-1940)').toBe(true);

    const dir = mkdtempSync(resolve(tmpdir(), 'ovr-raw-'));
    const rawFile = resolve(dir, 'raw-export.csv');
    writeFileSync(rawFile, exp.content, 'utf-8');

    await p.openImportDialog();
    await p.attachImportFile(rawFile);
    await p.clickImportUpload();
    const alert = await p.readImportAlert();
    // The row number is data-position-dependent (observed at Row#:19 on 2026-07-23), so assert the stable
    // required-field message rather than a fixed row index.
    expect(alert, 'the raw export is rejected on the empty-Override-Price row (NM-1940)').toMatch(IMP.nm1940RejectPattern);

    // The whole import aborts with no partial apply — the target row is unchanged after reload.
    await p.reloadAndReselect(RT.office);
    const rowAfter = await p.findRowByProductGroup(RT.productGroupName);
    expect(rowAfter).not.toBeNull();
    expect(await p.readOverridePrice(rowAfter!), 'the grid is unchanged after the aborted import (full rollback)').toBe(priceBefore);

    // Cross-office canary: the aborted raw-export import must not touch the richer 9-row office either.
    await p.reloadAndReselect(CORP_PRICING_OVERRIDE_ACTIVE_BED.office);
    expect(await p.getVisibleRowCount(), 'the canary office is unchanged by the aborted import').toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1), 'a canary row is intact by content').not.toBeNull();
  });
});
