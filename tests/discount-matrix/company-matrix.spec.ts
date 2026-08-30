import { test, expect } from '../../src/fixtures/pages.fixture';
import { CompanyMatrixPage } from '../../src/pages/discount-matrix/company-matrix.page';
import * as XLSX from 'xlsx';
import { statSync } from 'node:fs';

// Discount Matrix — Company Matrix tab. Every test navigates fresh via open().
// Only TC-DSM-CMX-005 mutates: it restores the GAV threshold in its finally block.

const OFFICE = '1604';

/** Criteria-bar defaults on office 1604. */
const DEFAULT_COUNTRY = 'United States';

const DEFAULT_CURRENCY = 'USD';

const DEFAULT_BUSINESS_TIER = 'Standard';

// The re-query oracle: a criteria-bar change POSTs to the page's own route, not to any
// /api/ path — no REST endpoint is involved.
const REQUERY_PATH = '/settings/discount-matrix';

/** Column group names in left-to-right DOM order. */
const COLUMN_GROUPS = ['Non-Peak', 'Standard', 'Peak'];

/** Day-bucket labels shared across all three column groups. */
const DAY_BUCKETS = ['0-15', '16-30', '31-60', '61-90', '91-180', '181-365', '365 +'];

// Substring, whitespace-stripped: the grid renders full phrases ("Non-Peak Booking Windows
// Days") and spaces vary between surfaces (grid "365 +" vs export "365+").
function headerContains(headers: string[], label: string): boolean {
  const stripped = label.replace(/\s/g, '');
  return headers.some((h) => h.replace(/\s/g, '').includes(stripped));
}

test.describe('Discount Matrix — Company Matrix: header controls, surface behaviour & field input contracts', () => {
  // dependencyGate is deliberately omitted — no test here depends on another's outcome.
  let cmx: CompanyMatrixPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    // 500 s covers two full grid loads at waitForGrid()'s 180 s ceiling plus test overhead;
    // tests doing more open() calls override this further.
    test.setTimeout(500_000);
    cmx = new CompanyMatrixPage(authenticatedSession.page, config);
    await cmx.open(OFFICE);
    // open() already calls waitForGrid() — no second wait needed here.
  });

  // ---------------------------------------------------------------- shared helper for 002/003/004

  // The POST is the re-query oracle, not a data diff: two different keys can legitimately
  // return identical rows. 'may-match' asserts only grid coherence for that reason.
  async function assertHeaderRekeysGrid(
    controlName: string,
    getOptions: () => Promise<string[]>,
    getCurrent: () => Promise<string>,
    selectOption: (opt: string) => Promise<void>,
    dataExpect: 'must-change' | 'may-match',
  ): Promise<void> {
    const options = await getOptions();
    const current = await getCurrent();
    const other = options.find((o) => o !== current);

    if (!other) {
      test.skip(
        true,
        `Only one option is available in the ${controlName} dropdown on office ${OFFICE}. ` +
          `A single-option dropdown cannot be exercised — this is reported rather than silently passed.`,
      );
      return;
    }

    const tierLabelsBefore = await cmx.getTierRangeLabels();
    const firstLabel = tierLabelsBefore[0]!;
    const valuesBefore = firstLabel ? await cmx.getRowValues(firstLabel) : [];

    const [response] = await Promise.all([
      cmx.page.waitForResponse(
        (r) => r.url().includes(REQUERY_PATH) && r.request().method() === 'POST',
      ),
      selectOption(other),
    ]);

    expect(response.ok(), `Re-query response after selecting "${other}" must be OK`).toBe(true);
    expect(await getCurrent(), 'criteria bar must reflect the newly selected option').toBe(other);

    const tierLabelsAfter = await cmx.getTierRangeLabels();

    if (dataExpect === 'must-change') {
      const valuesAfter = tierLabelsAfter.length > 0 ? await cmx.getRowValues(tierLabelsAfter[0]!) : [];
      const gridChanged =
        tierLabelsAfter.length === 0 ||
        JSON.stringify(tierLabelsAfter) !== JSON.stringify(tierLabelsBefore) ||
        JSON.stringify(valuesAfter) !== JSON.stringify(valuesBefore);
      expect(
        gridChanged,
        `Grid must change or show zero rows after switching ${controlName} to "${other}". ` +
          `Identical data under a different ${controlName} key means the grid retained the previous selection's rows.`,
      ).toBe(true);
    } else {
      // Coherent means either a full 21-value first row, or no data rows at all.
      if (tierLabelsAfter.length > 0) {
        const valuesAfter = await cmx.getRowValues(tierLabelsAfter[0]!);
        expect(
          valuesAfter,
          `Grid coherence check: first row must have exactly 21 values after re-key (${controlName} → "${other}")`,
        ).toHaveLength(21);
      }
    }
  }

  // ---------------------------------------------------------------- shared helper for export tests

  /** Triggers export, resolves the downloaded file, and returns the parsed DiscountMatrix sheet. */
  async function downloadAndParseSheet(page: CompanyMatrixPage) {
    const download = await page.clickExportAndWaitForDownload();
    const filePath = await download.path();
    const workbook = XLSX.readFile(filePath!);
    const sheet = workbook.Sheets['DiscountMatrix']!;
    return { download, sheet };
  }

  // Every criteria-bar control is part of the key the grid loads against, so each is
  // exercised separately: a failed re-key shows one country's numbers under another's label.

  test('TC-DSM-CMX-001: Grid loads when all three header keys are set', async () => {
    const rowCount = await cmx.getRowCount();
    expect(rowCount, 'grid must have at least one tier row').toBeGreaterThan(0);
    // Measured 9 rows at authoring time — not used as an oracle; tier membership is configuration.

    expect(await cmx.getCriteriaCountry(), 'Country default').toBe(DEFAULT_COUNTRY);
    expect(await cmx.getCriteriaCurrency(), 'Currency default').toBe(DEFAULT_CURRENCY);
    expect(await cmx.getCriteriaBusinessTier(), 'Business Tier default').toBe(DEFAULT_BUSINESS_TIER);

    const headers = await cmx.getColumnHeaders();
    for (const group of COLUMN_GROUPS) {
      expect(headerContains(headers, group), `column group "${group}" must appear in headers`).toBe(true);
    }
    for (const bucket of DAY_BUCKETS) {
      expect(headerContains(headers, bucket), `day bucket "${bucket}" must appear in headers`).toBe(true);
    }

    const tierLabels = await cmx.getTierRangeLabels();
    // First label read at runtime — "0 - 1500" was the measured value at authoring time.
    const firstLabel = tierLabels[0];
    expect(firstLabel, 'first tier label must be non-empty').toBeTruthy();

    const firstRowValues = await cmx.getRowValues(firstLabel!);
    expect(firstRowValues, 'first row must have exactly 21 percentage cells').toHaveLength(21);
    for (const val of firstRowValues) {
      expect(val, 'no cell value in the first row may be an empty string').not.toBe('');
    }
  });

  test('TC-DSM-CMX-002: Changing Country re-keys the grid', async () => {
    // On office 1604, United States → Mexico swaps the grid for different tier
    // ranges and values, so the change must be visible ('must-change').
    await assertHeaderRekeysGrid(
      'Country',
      () => cmx.getCountryOptions(),
      () => cmx.getCriteriaCountry(),
      (opt) => cmx.selectCountry(opt),
      'must-change',
    );
  });

  test('TC-DSM-CMX-003: Changing Currency re-keys the grid', async () => {
    // On office 1604, USD → CAD empties the grid — an empty result still counts
    // as the grid re-keying.
    await assertHeaderRekeysGrid(
      'Currency',
      () => cmx.getCurrencyOptions(),
      () => cmx.getCriteriaCurrency(),
      (opt) => cmx.selectCurrency(opt),
      'must-change',
    );
  });

  test('TC-DSM-CMX-004: Changing Business Tier re-keys the grid', async () => {
    // 'may-match': two Business Tiers legitimately return byte-identical rows, so only the
    // re-query POST proves the change took.
    await assertHeaderRekeysGrid(
      'Business Tier',
      () => cmx.getBusinessTierOptions(),
      () => cmx.getCriteriaBusinessTier(),
      (opt) => cmx.selectBusinessTier(opt),
      'may-match',
    );
  });

  test('TC-DSM-CMX-005: Header Save persists only the GAV threshold', async () => {
    // Writes to the live application — do not remove the finally block that restores it.
    // Up to four full grid loads here, so the describe default is overridden.
    test.setTimeout(900_000);

    // Keep the rendered string exact: parseInt would rewrite "12.5%" to 12 and turn the
    // restore into a mutation.
    const originalRendered = await cmx.getCriteriaThreshold();
    const originalNumericText = originalRendered.replace('%', '').trim();
    const originalFloat = parseFloat(originalNumericText);

    // Sanity-check: the numeric text must produce a finite number before we use it.
    expect(
      isFinite(originalFloat),
      `Threshold "${originalRendered}" did not parse to a finite number — cannot compute a test value`,
    ).toBe(true);

    // Compute a different valid threshold in the range 1–100 without hardcoding a literal
    // that might collide with the current value.
    const newFloat = originalFloat < 95 ? originalFloat + 5 : originalFloat - 5;
    // Assert the test value actually differs — if it did not, the test would be vacuous.
    expect(newFloat, 'computed test threshold must differ from the original').not.toBe(originalFloat);
    const newThresholdStr = String(newFloat);

    const firstLabel = (await cmx.getTierRangeLabels())[0]!;
    const rowValuesBefore = await cmx.getRowValues(firstLabel);

    let primaryError: unknown = undefined;
    try {
      await cmx.setCriteriaThreshold(newThresholdStr);
      await cmx.clickSave();
      await cmx.open(OFFICE);

      const savedThreshold = await cmx.getCriteriaThreshold();
      expect(
        parseFloat(savedThreshold.replace('%', '').trim()),
        `Threshold must read ${newFloat} after save and reload`,
      ).toBe(newFloat);

      const firstLabelAfter = (await cmx.getTierRangeLabels())[0]!;
      const rowValuesAfter = await cmx.getRowValues(firstLabelAfter);
      expect(
        rowValuesAfter,
        'Header Save must not alter matrix row values — grid cell values must be unchanged after threshold save',
      ).toEqual(rowValuesBefore);
    } catch (e) {
      primaryError = e;
    } finally {
      // Restore — do not remove. Verified by reload because a read straight after save returns
      // local form state, not the persisted value; failures here must not mask the try block's.
      let restoreError: unknown = undefined;
      try {
        let restoredThreshold: string | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          const current = await cmx.getCriteriaThreshold();
          if (current === originalRendered) {
            restoredThreshold = current;
            break;
          }
          await cmx.setCriteriaThreshold(originalNumericText);
          await cmx.clickSave();
          await cmx.open(OFFICE);
          restoredThreshold = await cmx.getCriteriaThreshold();
          if (restoredThreshold === originalRendered) break;
        }
        expect(
          restoredThreshold,
          `Restore failed: threshold must render as "${originalRendered}" after the finally block`,
        ).toBe(originalRendered);
      } catch (e) {
        restoreError = e;
      }

      if (primaryError !== undefined && restoreError !== undefined) {
        // Both failed — surface both; the try-block error is primary.
        throw new Error(
          `Try-block error: ${primaryError}\n\nAdditionally, the restore also failed: ${restoreError}`,
        );
      }
      if (primaryError !== undefined) throw primaryError;
      if (restoreError !== undefined) throw restoreError;
    }
  });

  test('TC-DSM-CMX-006: Empty state when a header key is not set', async () => {
    // Switching Currency to CAD is the shortest route to the empty state, which is correct
    // behaviour for a key with no rows. The empty-state markup itself is not asserted.

    const currencyOptions = await cmx.getCurrencyOptions();
    if (!currencyOptions.includes('CAD')) {
      test.skip(
        true,
        `CAD is not among the available Currency options on office ${OFFICE}. ` +
          `The empty state cannot be exercised via this path — skipping rather than silently passing.`,
      );
      return;
    }

    await Promise.all([
      cmx.page.waitForResponse(
        (r) => r.url().includes(REQUERY_PATH) && r.request().method() === 'POST',
      ),
      cmx.selectCurrency('CAD'),
    ]);

    const labelsAfter = await cmx.getTierRangeLabels();
    expect(
      labelsAfter,
      'No tier-range labels should remain in the DOM when the grid is empty — previous rows must be cleared, not left on screen',
    ).toHaveLength(0);
  });

  test('TC-DSM-CMX-007: Unsaved dialog edit is not carried across a header change', async () => {
    // This surface shows no Unsaved Changes prompt, so none is handled here; one appearing
    // is a behaviour change worth reporting.

    const tierLabels = await cmx.getTierRangeLabels();
    const firstLabel = tierLabels[0]!;
    const snapshotValues = await cmx.getRowValues(firstLabel);

    // Index 1, not 0: index 0 renders a raw decimal ("0.17") while 1–20 are percent-formatted.
    await cmx.openEditDialog(firstLabel);
    const dialogValues = await cmx.getEditDialogInputValues();
    const originalInputOne = dialogValues[1] ?? '0';
    const originalInputNum = parseFloat(originalInputOne.replace('%', ''));
    const altInputNum = originalInputNum < 95 ? originalInputNum + 5 : originalInputNum - 5;
    await cmx.setEditDialogInput(1, String(altInputNum));

    // Cancel the dialog — the edit must be discarded.
    await cmx.clickEditCancel();

    // Change a header control to exercise the re-key path before reloading.
    const tierOptions = await cmx.getBusinessTierOptions();
    const currentTier = await cmx.getCriteriaBusinessTier();
    const otherTier = tierOptions.find((o) => o !== currentTier);
    if (otherTier) {
      await Promise.all([
        cmx.page.waitForResponse(
          (r) => r.url().includes(REQUERY_PATH) && r.request().method() === 'POST',
        ),
        cmx.selectBusinessTier(otherTier),
      ]);
    }

    // Reload to the default criteria state — open() navigates fresh and waits for the grid.
    await cmx.open(OFFICE);

    const valuesAfterReload = await cmx.getRowValues(firstLabel);
    expect(
      valuesAfterReload,
      'First row values must match the pre-edit snapshot — nothing from a cancelled edit may survive a reload',
    ).toEqual(snapshotValues);
  });

  // ── SBC — read-only surface-behaviour tests. None of the tests below clicks Save, opens a
  // dialog, or changes a dropdown — they only read the grid as it loads on open(). ──
  test('TC-DSM-CMX-008: Column structure is exactly 3 groups × 7 buckets', async () => {
    // Headers are flattened deliberately: which thead row holds groups vs buckets is not
    // asserted.
    const headerRows = await cmx.getColumnHeaderRows();
    const allHeaders = headerRows.flat();

    for (const group of COLUMN_GROUPS) {
      expect(headerContains(allHeaders, group), `column group "${group}" must appear across all header rows`).toBe(true);
    }
    for (const bucket of DAY_BUCKETS) {
      expect(headerContains(allHeaders, bucket), `day bucket "${bucket}" must appear across all header rows`).toBe(true);
    }

    const firstLabel = (await cmx.getTierRangeLabels())[0]!;
    const firstRowValues = await cmx.getRowValues(firstLabel);
    expect(
      firstRowValues,
      'the first tier row must have exactly 21 percentage columns (3 groups × 7 buckets)',
    ).toHaveLength(21);
  });

  test('TC-DSM-CMX-009: Tier ranges are contiguous and non-overlapping', async () => {
    const labels = await cmx.getTierRangeLabels();

    // Parse each label into [start, end]. A label that does not parse is itself a failure
    // worth reporting — do not skip past it silently.
    const parsed = labels.map((label) => {
      const parts = label.split('-').map((s) => s.trim());
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      expect(
        isFinite(start) && isFinite(end),
        `Tier label "${label}" did not parse into two finite numbers`,
      ).toBe(true);
      return { label, start, end };
    });

    // Guard: contiguity cannot be checked with fewer than two parsed ranges.
    expect(
      parsed.length,
      'Contiguity check requires at least two tier ranges — fewer than two means the loop would pass vacuously without asserting anything',
    ).toBeGreaterThanOrEqual(2);

    // Only ascending order and non-overlap: the inclusive/exclusive boundary convention is
    // unknown, so start === prevEnd + 1 is deliberately not asserted.
    for (let i = 1; i < parsed.length; i++) {
      const prev = parsed[i - 1]!;
      const curr = parsed[i]!;
      expect(
        curr.start > prev.end,
        `Tier ranges "${prev.label}" and "${curr.label}" overlap or are out of order — ` +
          `"${curr.label}" start (${curr.start}) must be greater than "${prev.label}" end (${prev.end})`,
      ).toBe(true);
    }
  });

  test('TC-DSM-CMX-010: Percentage cells are read-only in the grid', async () => {
    const inputCount = await cmx.getGridInputControlCount();
    expect(
      inputCount,
      'Grid body must contain zero editable controls — a percentage value is edited through ' +
        'the Edit Tier dialog, so an editable control appearing inline in the grid is a surface change worth reporting',
    ).toBe(0);
  });

  test('TC-DSM-CMX-011: Grid readiness is data-driven, not container-driven', async () => {
    // Regression guard for waitForGrid(): a mounted-but-empty grid passes a container-only
    // check but fails here.
    const rowCount = await cmx.getRowCount();
    expect(rowCount, 'grid must have at least one tier row after open()').toBeGreaterThan(0);

    const labels = await cmx.getTierRangeLabels();
    for (const label of labels) {
      const values = await cmx.getRowValues(label);
      expect(
        values,
        `tier row "${label}" must have exactly 21 entries`,
      ).toHaveLength(21);
      for (const val of values) {
        expect(
          val,
          `no cell in tier row "${label}" may be an empty string`,
        ).not.toBe('');
      }
    }
  });

  test('TC-DSM-CMX-012: Every tier row exposes Delete and Edit controls', async () => {
    const labels = await cmx.getTierRangeLabels();
    // Guard: at least one row must be present — an empty grid would let the loop pass
    // vacuously without asserting any Edit or Delete control exists.
    expect(
      labels.length,
      'Grid must have at least one tier row — an empty grid cannot prove every row has Edit and Delete controls',
    ).toBeGreaterThanOrEqual(1);
    // Iterate every row — do not sample the first one and generalise.
    for (const label of labels) {
      const counts = await cmx.getRowActionCounts(label);
      expect(
        counts.edit,
        `tier row "${label}" must have exactly one Edit control`,
      ).toBe(1);
      expect(
        counts.delete,
        `tier row "${label}" must have exactly one Delete control`,
      ).toBe(1);
    }
  });

  // ── Field input contracts ──

  // No field-input test clicks Update — it may persist to the live office with no way back;
  // all exit through Cancel. Trials use index 1 because index 0 renders a raw decimal.

  test('TC-DSM-CMX-013: Dialog roster', async () => {
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    await cmx.openEditDialog(tierRange);

    const title = await cmx.getEditDialogTitle();
    expect(title, 'Dialog title must match the pattern "Editing {tier range}"').toBe(`Editing ${tierRange}`);

    const values = await cmx.getEditDialogInputValues();
    // Tier boundaries are not editable here — the dialog has no Revenue Tier start/end fields.
    expect(
      values,
      'Edit Tier dialog must have exactly 21 inputs; there are no tier-boundary fields here',
    ).toHaveLength(21);

    for (let i = 0; i < 21; i++) {
      const attrs = await cmx.getEditDialogInputAttributes(i);
      expect(attrs.type, `Input ${i} must have type="text"`).toBe('text');
      expect(attrs.inputMode, `Input ${i} must have inputmode="decimal"`).toBe('decimal');
      expect(attrs.placeholder, `Input ${i} must have placeholder="0"`).toBe('0');
    }

    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-014: Whole numbers get % appended unchanged', async () => {
    // NM-3235: "14" once rendered "1400%" — this test guards against that regression.
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    await cmx.openEditDialog(tierRange);

    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '14');
    await cmx.blurEditDialogInput();

    const values = await cmx.getEditDialogInputValues();
    expect(values[1], 'Typing "14" must render as "14%"').toBe('14%');
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'aria-invalid must be "false" for a valid value',
    ).toBe('false');
    expect(await cmx.isEditUpdateEnabled(), 'Update must be enabled for a valid value').toBe(true);

    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-015: Decimals below 1 are multiplied by 100', async () => {
    const tierRange = (await cmx.getTierRangeLabels())[0]!;

    // Trial 1: 0.14 → 14%
    await cmx.openEditDialog(tierRange);
    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '0.14');
    await cmx.blurEditDialogInput();
    const values1 = await cmx.getEditDialogInputValues();
    expect(values1[1], 'Typing "0.14" must render as "14%"').toBe('14%');
    expect(await cmx.getEditDialogInputAriaInvalid(1), 'aria-invalid must be "false"').toBe('false');
    expect(await cmx.isEditUpdateEnabled(), 'Update must be enabled').toBe(true);
    await cmx.clickEditCancel();

    // Trial 2: 0.5 → 50%
    await cmx.openEditDialog(tierRange);
    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '0.5');
    await cmx.blurEditDialogInput();
    const values2 = await cmx.getEditDialogInputValues();
    expect(values2[1], 'Typing "0.5" must render as "50%"').toBe('50%');
    expect(await cmx.getEditDialogInputAriaInvalid(1), 'aria-invalid must be "false"').toBe('false');
    expect(await cmx.isEditUpdateEnabled(), 'Update must be enabled').toBe(true);
    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-016: Single-digit 1 renders 1%, not 100%', async () => {
    // NM-3387: "1" once rendered "100%" — this test guards against that regression.
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    await cmx.openEditDialog(tierRange);

    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '1');
    await cmx.blurEditDialogInput();

    const values = await cmx.getEditDialogInputValues();
    expect(values[1], 'Typing "1" must render as "1%", not "100%"').toBe('1%');
    expect(await cmx.getEditDialogInputAriaInvalid(1), 'aria-invalid must be "false"').toBe('false');
    expect(await cmx.isEditUpdateEnabled(), 'Update must be enabled').toBe(true);

    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-017: Upper boundary: 100 accepted, 101 rejected', async () => {
    const tierRange = (await cmx.getTierRangeLabels())[0]!;

    // Trial 1: 100 is the maximum valid value.
    await cmx.openEditDialog(tierRange);
    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '100');
    await cmx.blurEditDialogInput();
    const values1 = await cmx.getEditDialogInputValues();
    expect(values1[1], 'Typing "100" must render as "100%"').toBe('100%');
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'aria-invalid must be "false" at boundary 100',
    ).toBe('false');
    expect(await cmx.isEditUpdateEnabled(), 'Update must be enabled at boundary 100').toBe(true);
    await cmx.clickEditCancel();

    // Trial 2: 101 exceeds the maximum and is rejected.
    await cmx.openEditDialog(tierRange);
    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '101');
    await cmx.blurEditDialogInput();
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'aria-invalid must be "true" for 101 — one above the boundary',
    ).toBe('true');
    expect(
      await cmx.isEditUpdateEnabled(),
      'Update must be disabled when any input is invalid',
    ).toBe(false);
    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-018: Out-of-range values disable Update and are never persisted', async () => {
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    const baseline = await cmx.getRowValues(tierRange);

    await cmx.openEditDialog(tierRange);
    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '150');
    await cmx.blurEditDialogInput();

    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'aria-invalid must be "true" for 150',
    ).toBe('true');
    expect(
      await cmx.isEditUpdateEnabled(),
      'Update must be disabled for an out-of-range value',
    ).toBe(false);

    await cmx.clickEditCancel();

    const after = await cmx.getRowValues(tierRange);
    expect(
      after,
      'Row values must equal the pre-dialog baseline after Cancel — no edit may have persisted',
    ).toEqual(baseline);
  });

  test('TC-DSM-CMX-019: Out-of-range rejection shows no user-visible message', async () => {
    // DEFECT — INTENTIONAL ASSERTION: pins the current silent rejection (no message, Update
    // just disabled) so adding a message later surfaces as a deliberate change.
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    await cmx.openEditDialog(tierRange);

    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '101');
    await cmx.blurEditDialogInput();

    const messages = await cmx.getVisibleValidationMessages();
    expect(
      messages,
      `No validation message must be visible — the rejection is currently silent (see defect comment above) — found: ${JSON.stringify(messages)}`,
    ).toHaveLength(0);

    // The value still renders with a % (as though accepted) while Update is disabled.
    const values = await cmx.getEditDialogInputValues();
    expect(values[1], 'Field must still render the value with % even when invalid').toMatch(/%/);
    expect(
      await cmx.isEditUpdateEnabled(),
      'Update must be disabled despite the silent rejection',
    ).toBe(false);

    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-020: Negative values cannot be entered', async () => {
    // By design for a decimal input mode. Asserted so that a future change to the input
    // handler is caught in tests rather than discovered in production.
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    await cmx.openEditDialog(tierRange);

    await cmx.clearEditDialogInput(1);
    // Press Minus and read the value before any blur — the keypress must have no effect.
    await cmx.pressKeyInEditDialogInput(1, 'Minus');
    const valuesBeforeBlur = await cmx.getEditDialogInputValues();
    expect(
      valuesBeforeBlur[1],
      'Pressing Minus on a cleared field must leave the value unchanged',
    ).toBe('');

    // Pressing Digit1 then Tab must yield 1%.
    await cmx.pressKeyInEditDialogInput(1, 'Digit1');
    await cmx.blurEditDialogInput();
    const valuesAfterBlur = await cmx.getEditDialogInputValues();
    expect(valuesAfterBlur[1], 'Pressing Digit1 then Tab after Minus must yield "1%"').toBe('1%');

    await cmx.clickEditCancel();
  });

  // Pins OBSERVED, not agreed-correct, behaviour: a mistyped percentage silently becomes "0%"
  // with Update still enabled, unlike the threshold field, which reverts to its prior value.
  test('TC-DSM-CMX-021: Empty and non-numeric input silently resolve to zero percent', async () => {
    const tierRange = (await cmx.getTierRangeLabels())[0]!;

    // Trial 1: clear the field, then blur — value must resolve to "0%", not be rejected.
    await cmx.openEditDialog(tierRange);
    await cmx.clearEditDialogInput(1);
    await cmx.blurEditDialogInput();
    const values1 = await cmx.getEditDialogInputValues();
    expect(values1[1], 'Trial 1 (cleared): field must resolve to "0%"').toBe('0%');
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'Trial 1 (cleared): aria-invalid must not be "true"',
    ).not.toBe('true');
    expect(
      await cmx.isEditUpdateEnabled(),
      'Trial 1 (cleared): Update must be enabled',
    ).toBe(true);
    await cmx.clickEditCancel();

    // Trial 2: type non-numeric text, then blur — same silent-zero resolution.
    await cmx.openEditDialog(tierRange);
    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, 'abc');
    await cmx.blurEditDialogInput();
    const values2 = await cmx.getEditDialogInputValues();
    expect(values2[1], 'Trial 2 (non-numeric): field must resolve to "0%"').toBe('0%');
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'Trial 2 (non-numeric): aria-invalid must not be "true"',
    ).not.toBe('true');
    expect(
      await cmx.isEditUpdateEnabled(),
      'Trial 2 (non-numeric): Update must be enabled',
    ).toBe(true);
    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-022: Field 0 opens in a different format from fields 1–20', async () => {
    // DEFECT — INTENTIONAL ASSERTION: pins the format inconsistency (index 0 raw decimal,
    // 1–20 percent-formatted) so fixing it is a deliberate change.
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    await cmx.openEditDialog(tierRange);

    // Read all values before touching anything — opening format only, no interaction.
    const values = await cmx.getEditDialogInputValues();

    expect(
      values[0]!.endsWith('%'),
      'Index 0 must NOT end with % — it renders as a raw decimal, unlike indices 1–20 (see defect comment above)',
    ).toBe(false);

    for (let i = 1; i <= 20; i++) {
      expect(
        values[i]!.endsWith('%'),
        `Index ${i} must end with % — all indices 1–20 render percent-formatted`,
      ).toBe(true);
    }

    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-023: Repeated focus cycling does not alter an invalid value', async () => {
    // NM-3390: An invalid value once divided progressively on repeated focus until it became
    // saveable. This test guards that regression across three focus/blur cycles.
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    await cmx.openEditDialog(tierRange);

    await cmx.clearEditDialogInput(1);
    await cmx.setEditDialogInput(1, '3456');
    await cmx.blurEditDialogInput();

    const referenceValues = await cmx.getEditDialogInputValues();
    const referenceAriaInvalid = await cmx.getEditDialogInputAriaInvalid(1);
    const referenceUpdateEnabled = await cmx.isEditUpdateEnabled();

    // Cycle 1
    await cmx.focusEditDialogInput(1);
    await cmx.blurEditDialogInput();
    expect(await cmx.getEditDialogInputValues(), 'Cycle 1: value must be unchanged').toEqual(referenceValues);
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'Cycle 1: aria-invalid must be unchanged',
    ).toBe(referenceAriaInvalid);
    expect(
      await cmx.isEditUpdateEnabled(),
      'Cycle 1: Update state must be unchanged',
    ).toBe(referenceUpdateEnabled);

    // Cycle 2
    await cmx.focusEditDialogInput(1);
    await cmx.blurEditDialogInput();
    expect(await cmx.getEditDialogInputValues(), 'Cycle 2: value must be unchanged').toEqual(referenceValues);
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'Cycle 2: aria-invalid must be unchanged',
    ).toBe(referenceAriaInvalid);
    expect(
      await cmx.isEditUpdateEnabled(),
      'Cycle 2: Update state must be unchanged',
    ).toBe(referenceUpdateEnabled);

    // Cycle 3
    await cmx.focusEditDialogInput(1);
    await cmx.blurEditDialogInput();
    expect(await cmx.getEditDialogInputValues(), 'Cycle 3: value must be unchanged').toEqual(referenceValues);
    expect(
      await cmx.getEditDialogInputAriaInvalid(1),
      'Cycle 3: aria-invalid must be unchanged',
    ).toBe(referenceAriaInvalid);
    expect(
      await cmx.isEditUpdateEnabled(),
      'Cycle 3: Update state must be unchanged',
    ).toBe(referenceUpdateEnabled);

    await cmx.clickEditCancel();
  });

  test('TC-DSM-CMX-024: Cancel discards every pending edit', async () => {
    const tierRange = (await cmx.getTierRangeLabels())[0]!;
    const baseline = await cmx.getRowValues(tierRange);

    await cmx.openEditDialog(tierRange);

    // Three fields, not one — Cancel must discard multiple pending edits at once.
    const dialogValues = await cmx.getEditDialogInputValues();
    for (const idx of [1, 2, 3]) {
      const current = parseFloat((dialogValues[idx] ?? '0').replace('%', ''));
      const alternate = current < 95 ? current + 4 : current - 4;
      await cmx.clearEditDialogInput(idx);
      await cmx.setEditDialogInput(idx, String(alternate));
      await cmx.blurEditDialogInput();
    }

    await cmx.clickEditCancel();

    const after = await cmx.getRowValues(tierRange);
    expect(
      after,
      'All 21 row values must equal the pre-dialog baseline — Cancel must discard every pending edit',
    ).toEqual(baseline);
  });

  // ---------------------------------------------------------------- export tests

  test('TC-DSM-CMX-025: Export downloads a workbook named from the current criteria', async () => {
    const currency = await cmx.getCriteriaCurrency();
    const businessTier = await cmx.getCriteriaBusinessTier();

    const download = await cmx.clickExportAndWaitForDownload();
    const suggestedFilename = download.suggestedFilename();

    // Only currency and tier are checked against the criteria bar: the filename's country
    // segment is a code ("US"), and its mapping to the displayed name is unknown.
    expect(
      suggestedFilename,
      'Filename must match the shape DiscountMatrix-<country>-<currency>-<tier>.xlsx',
    ).toMatch(/^DiscountMatrix-[^-]+-[^-]+-[^-]+\.xlsx$/);

    const parts = suggestedFilename.replace('.xlsx', '').split('-');
    // parts[0] = 'DiscountMatrix', parts[1] = country code, parts[2] = currency, parts[3] = tier
    expect(parts[2], 'Second filename segment must equal the criteria bar currency').toBe(currency);
    expect(parts[3], 'Third filename segment must equal the criteria bar business tier').toBe(businessTier);
  });

  test('TC-DSM-CMX-026: Export completes successfully and returns a spreadsheet', async () => {
    const { download, sheet } = await downloadAndParseSheet(cmx);

    expect(await download.failure(), 'Download must report no failure').toBeNull();

    const filePath = await download.path();
    const fileSize = statSync(filePath!).size;
    expect(fileSize, 'Downloaded file must be larger than zero bytes').toBeGreaterThan(0);

    expect(sheet, 'Workbook must contain a sheet named DiscountMatrix').toBeTruthy();
  });

  test('TC-DSM-CMX-027: Exported values match the grid, cell for cell', async () => {
    // Read the full grid first so the export and grid reads are decoupled.
    const tierLabels = await cmx.getTierRangeLabels();
    const gridData = new Map<string, string[]>();
    for (const label of tierLabels) {
      gridData.set(label, await cmx.getRowValues(label));
    }

    const { sheet } = await downloadAndParseSheet(cmx);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
    // Data rows start at index 3 (workbook rows 4–12; rows 0–2 are instruction, headers, day-buckets).
    const dataRows = rows.slice(3);

    let comparisonCount = 0;

    for (const exportRow of dataRows) {
      const row = exportRow as unknown[];
      // Match by Revenue Tier (column D, index 3) — never by row index.
      const revenueTier = String(row[3] ?? '');
      const gridRow = gridData.get(revenueTier);
      if (!gridRow) continue;

      for (let colIdx = 0; colIdx < 21; colIdx++) {
        const gridRaw = gridRow[colIdx] ?? '';
        // The grid renders percentages as "17%"; the export writes bare numbers (17).
        const gridNum = parseFloat(gridRaw.replace('%', '').trim());
        const exportNum = row[colIdx + 4] as number;

        expect(
          exportNum,
          `Mismatch: tier "${revenueTier}", column index ${colIdx} — grid "${gridRaw}", export ${exportNum}`,
        ).toBe(gridNum);
        comparisonCount++;
      }
    }

    // A fidelity check that compares nothing is not a pass — a silently-skipped row cannot pass as agreement.
    expect(
      comparisonCount,
      `Expected ${tierLabels.length * 21} comparisons (${tierLabels.length} tiers × 21 columns) but performed ${comparisonCount}`,
    ).toBe(tierLabels.length * 21);
  });

  test('TC-DSM-CMX-028: Exported workbook keeps its round-trip template shape', async () => {
    const { sheet } = await downloadAndParseSheet(cmx);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];

    // Row 1 is the instruction the Import button consumes. Whitespace is normalised so a
    // cosmetic re-wrap passes while a wording change still fails.
    const instructionRaw = String((rows[0] as unknown[])[0] ?? '');
    const instructionNorm = instructionRaw.replace(/\s+/g, ' ').trim();
    expect(
      instructionNorm,
      'Row 1 must hold the round-trip template instruction — a change to it breaks the Import button',
    ).toBe('Edit only the Discount percent for each booking window. No formatting just numbers');

    // Row 2: four fixed columns then three group headers (merged cells; only the first cell of each merge is populated).
    const headerRow = rows[1] as unknown[];
    expect(headerRow[0], 'Row 2 cell A must be "ID"').toBe('ID');
    expect(headerRow[1], 'Row 2 cell B must be "Country"').toBe('Country');
    expect(headerRow[2], 'Row 2 cell C must be "Currency"').toBe('Currency');
    expect(headerRow[3], 'Row 2 cell D must be "Revenue Tier"').toBe('Revenue Tier');
    expect(headerRow[4], 'Row 2 must carry the Non-Peak group header at column E — a change breaks the Import button').toBe('Non-Peak Booking Windows by Days');
    expect(headerRow[11], 'Row 2 must carry the Standard group header at column L — a change breaks the Import button').toBe('Standard Booking Windows by Days');
    expect(headerRow[18], 'Row 2 must carry the Peak group header at column S — a change breaks the Import button').toBe('Peak Booking Windows by Days');

    // Row 3 holds seven day-bucket sub-headers per group. The export writes "365+" where the
    // grid renders "365 +" — the two label sets are deliberately never compared.
    const buckets = ['0-15', '16-30', '31-60', '61-90', '91-180', '181-365', '365+'];
    const subHeaderRow = rows[2] as unknown[];
    for (let g = 0; g < 3; g++) {
      for (let b = 0; b < 7; b++) {
        const cellIdx = 4 + g * 7 + b;
        expect(
          subHeaderRow[cellIdx],
          `Row 3 column ${cellIdx} must be day-bucket "${buckets[b]}" — a change breaks the Import button`,
        ).toBe(buckets[b]);
      }
    }
  });

  test('TC-DSM-CMX-029: Export identifier column carries the platform identifier', async () => {
    // GUID-form IDs are expected after the platform's data-store migration — this pins the
    // format, it is not a defect assertion.
    const { sheet } = await downloadAndParseSheet(cmx);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
    const dataRows = rows.slice(3);

    const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const exportRow of dataRows) {
      const row = exportRow as unknown[];
      const id = String(row[0] ?? '');
      expect(id, 'Each data row ID must be a non-empty string').toBeTruthy();
      expect(
        guidPattern.test(id),
        `ID "${id}" must be in GUID form — expected after the platform's data-store migration`,
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------- Add Tier dialog tests

  // No test below clicks the confirm button: it would create a real tier on office 1604 with
  // no cleanup path. That boundary is the point of these cases, not an omission.

  test('TC-DSM-CMX-030: Add Tier opens with one End Tier field and a disabled confirm', async () => {
    await cmx.openAddTierDialog();

    const title = await cmx.getAddTierDialogTitle();
    expect(title, 'Add Tier dialog title must be "Adding Tier"').toBe('Adding Tier');

    // There is no Start Tier field — the new tier's start is derived.
    const inputCount = await cmx.getAddTierDialogInputCount();
    expect(inputCount, 'Add Tier dialog must contain exactly one input — there is no Start Tier field').toBe(1);

    const labels = await cmx.getAddTierDialogFieldLabels();
    expect(
      labels.some((l) => l.includes('End Tier')),
      'At least one field label must mention "End Tier"',
    ).toBe(true);

    const confirmEnabled = await cmx.isAddTierConfirmEnabled();
    expect(confirmEnabled, 'Confirm button must be disabled on dialog open').toBe(false);

    await cmx.clickAddTierCancel();
  });

  test('TC-DSM-CMX-031: End Tier validation is submit-time, not blur-time', async () => {
    // NM-3237: stops before confirm — the end-to-end path needs a cleanup route that does
    // not exist yet.
    await cmx.openAddTierDialog();

    await cmx.setAddTierEndValue('30000000');

    const value = await cmx.getAddTierEndValue();
    expect(value, 'End Tier input must reflect the typed value before submission').toBe('30000000');

    const ariaInvalid = await cmx.getAddTierEndAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must be absent before submission — validation is submit-time, not blur-time').toBeNull();

    const messages = await cmx.getVisibleValidationMessages();
    expect(messages, `No validation message must be visible before the form is submitted — found: ${JSON.stringify(messages)}`).toHaveLength(0);

    const confirmEnabled = await cmx.isAddTierConfirmEnabled();
    expect(confirmEnabled, 'Confirm button must become enabled once a value is entered').toBe(true);

    await cmx.clickAddTierCancel();
  });

  test('TC-DSM-CMX-032: End Tier silently refuses non-numeric input', async () => {
    // The refusal is silent by design at the input layer — this asserts the control cannot
    // be driven into an invalid state, not that an error message appears.
    await cmx.openAddTierDialog();

    await cmx.setAddTierEndValue('abc');

    const value = await cmx.getAddTierEndValue();
    expect(value, 'End Tier input must be empty after a non-numeric entry attempt').toBe('');

    const ariaInvalid = await cmx.getAddTierEndAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must be absent when the field is empty').toBeNull();

    const messages = await cmx.getVisibleValidationMessages();
    expect(messages, `No validation message must appear for a silently refused non-numeric entry — found: ${JSON.stringify(messages)}`).toHaveLength(0);

    const confirmEnabled = await cmx.isAddTierConfirmEnabled();
    expect(confirmEnabled, 'Confirm button must remain disabled when the field is empty').toBe(false);

    await cmx.clickAddTierCancel();
  });

  test('TC-DSM-CMX-033: Cancelling Add Tier leaves the grid untouched', async () => {
    // This is the guard proving every Add Tier case above is non-mutating and the suite stays re-runnable.
    const rowCountBefore = await cmx.getRowCount();
    const rangeLabelsBefore = await cmx.getTierRangeLabels();

    await cmx.openAddTierDialog();
    await cmx.setAddTierEndValue('500');
    await cmx.clickAddTierCancel();

    const rowCountAfter = await cmx.getRowCount();
    const rangeLabelsAfter = await cmx.getTierRangeLabels();

    expect(rowCountAfter, 'Row count must be unchanged after cancelling Add Tier').toBe(rowCountBefore);
    expect(rangeLabelsAfter, 'Tier range list must be unchanged after cancelling Add Tier').toEqual(rangeLabelsBefore);
  });

  // ---------------------------------------------------------------- GAV Discount Threshold field (criteria bar)

  // No test below clicks Save, the only control that persists the threshold — each discards
  // its typed value by navigating away via open(), leaving the baseline for the next test.

  test('TC-DSM-CMX-034: Threshold accepts a whole number and renders it as a percentage', async () => {
    // The page object types character by character on purpose — do not "simplify" it back to
    // fill(), which the field's formatter mis-parses ("20%" landed as "15.2%").
    await cmx.setCriteriaThreshold('20');

    const rendered = await cmx.getCriteriaThreshold();
    expect(rendered, 'Typing "20" must render as "20%"').toBe('20%');

    const ariaInvalid = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must not be "true" for a valid value').not.toBe('true');

    const messages = await cmx.getVisibleValidationMessages();
    expect(messages, `No validation message must be visible for a valid value — found: ${JSON.stringify(messages)}`).toHaveLength(0);

    await cmx.open(OFFICE);
  });

  test('TC-DSM-CMX-035: Threshold multiplies a decimal below one by a hundred', async () => {
    // This matches the Edit Tier dialog's contract for the same input class: a value below
    // 1 is interpreted as a fraction and multiplied by 100 before rendering.
    await cmx.setCriteriaThreshold('0.2');

    const rendered = await cmx.getCriteriaThreshold();
    expect(rendered, 'Typing "0.2" must render as "20%"').toBe('20%');

    const ariaInvalid = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must not be "true" for a valid value').not.toBe('true');

    await cmx.open(OFFICE);
  });

  test('TC-DSM-CMX-036: Threshold keeps a fractional value above one', async () => {
    await cmx.setCriteriaThreshold('12.5');

    const rendered = await cmx.getCriteriaThreshold();
    expect(rendered, 'Typing "12.5" must render as "12.5%" — the fraction must not be rounded away').toBe('12.5%');

    const ariaInvalid = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must not be "true" for a valid value').not.toBe('true');

    await cmx.open(OFFICE);
  });

  test('TC-DSM-CMX-037: Threshold marks an out-of-range value invalid without saying why', async () => {
    // DEFECT — INTENTIONAL ASSERTION: 101 renders with its "%" as though accepted and only
    // aria-invalid marks the rejection — the same silent pattern as the Edit Tier inputs.
    await cmx.setCriteriaThreshold('101');

    const rendered = await cmx.getCriteriaThreshold();
    expect(rendered, 'Field must render "101%" even when invalid').toBe('101%');

    const ariaInvalid = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must be "true" for an out-of-range value').toBe('true');

    const messages = await cmx.getVisibleValidationMessages();
    expect(
      messages,
      `No validation message must be visible — the rejection is currently silent (see defect comment above) — found: ${JSON.stringify(messages)}`,
    ).toHaveLength(0);

    await cmx.open(OFFICE);
  });

  test('TC-DSM-CMX-038: Threshold treats zero and empty as zero percent', async () => {
    // Three full grid loads (beforeEach + two explicit open() calls) — override the
    // describe default so two loads at waitForGrid()'s 180 s ceiling don't exhaust it.
    test.setTimeout(700_000);
    // Trial 1: explicit zero.
    await cmx.setCriteriaThreshold('0');

    const renderedZero = await cmx.getCriteriaThreshold();
    expect(renderedZero, 'Typing "0" must render as "0%"').toBe('0%');

    const ariaInvalidZero = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalidZero, 'aria-invalid must not be "true" for zero').not.toBe('true');

    // Reload between trials so trial 2 starts from a clean page.
    await cmx.open(OFFICE);

    // Trial 2: cleared field.
    await cmx.clearCriteriaThreshold();

    const renderedEmpty = await cmx.getCriteriaThreshold();
    expect(renderedEmpty, 'Clearing the field must render as "0%" — the field must not stay blank').toBe('0%');

    const ariaInvalidEmpty = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalidEmpty, 'aria-invalid must not be "true" when the field is empty').not.toBe('true');

    await cmx.open(OFFICE);
  });

  // Two paths, neither warning the user: typed over a selection the value survives, but cleared
  // first the field is empty when 'abc' is refused and commits as "0%".
  test('TC-DSM-CMX-039: Threshold silently refuses non-numeric input and resolves empty to zero', async () => {
    // Three full grid loads (beforeEach + two explicit open() calls) — override the
    // describe default so two loads at waitForGrid()'s 180 s ceiling don't exhaust it.
    test.setTimeout(700_000);
    // Part 1 — typed over the selection without clearing: refused at the input layer.
    const starting = await cmx.getCriteriaThreshold();
    expect(starting, 'Part 1: refusal check is meaningless from a zero baseline — starting value must not be "0%" and must not be empty').not.toBe('0%');
    expect(starting, 'Part 1: refusal check is meaningless from a zero baseline — starting value must not be "0%" and must not be empty').not.toBe('');
    await cmx.typeIntoCriteriaThresholdWithoutClearing('abc');

    const afterRefusal = await cmx.getCriteriaThreshold();
    expect(afterRefusal, 'Part 1: field must be unchanged after non-numeric input typed over selection').toBe(starting);

    const ariaInvalidRefusal = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalidRefusal, 'Part 1: aria-invalid must not be "true" after a silently refused entry').not.toBe('true');

    const messagesRefusal = await cmx.getVisibleValidationMessages();
    expect(messagesRefusal, `Part 1: no validation message must be visible after a silently refused entry — found: ${JSON.stringify(messagesRefusal)}`).toHaveLength(0);

    // Part 2 — Empty resolves to zero: reload, then use the clearing setter so the field is
    // genuinely empty before 'abc' is refused. An empty threshold commits as "0%".
    await cmx.open(OFFICE);
    await cmx.setCriteriaThreshold('abc');

    const afterEmpty = await cmx.getCriteriaThreshold();
    expect(afterEmpty, 'Part 2: field must resolve to "0%" when cleared before a non-numeric entry').toBe('0%');

    const ariaInvalidEmpty = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalidEmpty, 'Part 2: aria-invalid must not be "true" when the field resolved to zero').not.toBe('true');

    const messagesEmpty = await cmx.getVisibleValidationMessages();
    expect(messagesEmpty, `Part 2: no validation message must be visible when the field resolved to zero — found: ${JSON.stringify(messagesEmpty)}`).toHaveLength(0);

    await cmx.open(OFFICE);
  });

  // OBSERVED, NOT AGREED-CORRECT: the threshold sits outside every tab panel, so a tab switch
  // never unmounts it and no prompt appears — NM-3256 implies one should, still unresolved.
  test('TC-DSM-CMX-040: Unsaved threshold edit survives a tab switch and is discarded by a reload', async () => {
    const original = await cmx.getCriteriaThreshold();
    const originalNum = parseFloat(original.replace('%', '').trim());

    // Type a different valid value and confirm it took before switching tabs.
    const altNum = originalNum < 95 ? originalNum + 5 : originalNum - 5;
    await cmx.setCriteriaThreshold(String(altNum));
    const afterSet = await cmx.getCriteriaThreshold();
    expect(afterSet, 'Field must reflect the typed value before navigation').not.toBe(original);

    // Part 1 — Tab switch: no prompt appears; the edit must still be present on return.
    await cmx.switchTab('Region Weekly Peaks');
    await cmx.switchTab('Company Matrix');

    const afterReturn = await cmx.getCriteriaThreshold();
    expect(
      afterReturn,
      'Part 1: unsaved edit must survive a tab switch — the threshold is outside every tab panel',
    ).toBe(afterSet);

    // Part 2 — Reload discards the edit; value must be back to the recorded original.
    await cmx.open(OFFICE);

    const afterReload = await cmx.getCriteriaThreshold();
    expect(
      afterReload,
      'Part 2: threshold must revert to the original value after a reload — nothing was persisted',
    ).toBe(original);

    // Threshold is at its original value after Part 2's open() call — no further cleanup needed.
  });

  // 100 is the valid upper boundary; TC-037 covers 101 as out-of-range. Nothing is saved, so
  // the value reverts on reload.
  test('TC-DSM-CMX-041: Threshold accepts exactly 100 as the valid upper boundary', async () => {
    await cmx.setCriteriaThreshold('100');

    const rendered = await cmx.getCriteriaThreshold();
    expect(rendered, 'Typing "100" must render as "100%"').toBe('100%');

    const ariaInvalid = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must not be "true" for the upper boundary value 100').not.toBe('true');

    const saveEnabled = await cmx.isSaveEnabled();
    expect(saveEnabled, 'Save button must be enabled for a valid threshold value of 100').toBe(true);

    const messages = await cmx.getVisibleValidationMessages();
    expect(
      messages,
      `No validation message must be visible for the upper boundary value — found: ${JSON.stringify(messages)}`,
    ).toHaveLength(0);

    await cmx.open(OFFICE);
  });

  // The minus is refused at the input layer, so "-5" commits as the valid "5%" — the same
  // silent-refusal pattern as TC-039's non-numeric input. Nothing is saved.
  test('TC-DSM-CMX-042: Threshold silently refuses a negative sign and processes the remaining digits', async () => {
    await cmx.setCriteriaThreshold('-5');

    const rendered = await cmx.getCriteriaThreshold();
    expect(rendered, 'Typing "-5": the minus sign is refused; "5" reaches the field and renders as "5%"').toBe('5%');

    const ariaInvalid = await cmx.getCriteriaThresholdAriaInvalid();
    expect(ariaInvalid, 'aria-invalid must not be "true" — the committed value is 5, which is valid').not.toBe('true');

    const saveEnabled = await cmx.isSaveEnabled();
    expect(saveEnabled, 'Save button must be enabled — the committed value 5% is valid').toBe(true);

    const messages = await cmx.getVisibleValidationMessages();
    expect(
      messages,
      `No validation message must be visible — refusal is silent, found: ${JSON.stringify(messages)}`,
    ).toHaveLength(0);

    await cmx.open(OFFICE);
  });
});

