import { resolve } from 'node:path';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { CORP_PRICING_TOOLBAR_IO, CORP_PRICING_LOC_IMPORT_API } from '../../src/data/corporate-pricing/toolbar-io';
const IMP2 = CORP_PRICING_TOOLBAR_IO.locImport;
const OFFICE = IMP2.throwawayOffice;
const LOC_H = CORP_PRICING_TOOLBAR_IO.locExport.expectedHeaders;
const ALT_IDX = LOC_H.indexOf('IsAlternate');
const fixturePath = (name: string): string =>
  resolve(__dirname, '../../src/data/corporate-pricing/fixtures/loc-pricing-import', name);

/** Office 5897's three baseline rows (all Primary), in the export's 11-column order — the reset oracle. */
const BASELINE_ROWS: string[][] = [
  ['5897', '2026-LV-PB-3867', '2026-LV-PB-3867', 'USD', '0', '0', '0', '0', '0', '', ''],
  ['5897', '2026-LV-LB-3867', '2026-LV-LB-3867', 'USD', '0', '1', '0', '0', '0', '', ''],
  ['5897', '2026-NP LB4', '2026-NP LB4', 'USD', '0', '1', '0', '1', '0', '', ''],
];

/** Sort captured rows so before/after comparisons are order-agnostic — the export re-orders a location's
 *  rows after a mutation, so a positional compare would flake. */
const sortRows = (rows: string[][]): string[][] =>
  [...rows].sort((a, b) => a.join('').localeCompare(b.join('')));

/** Find one pricebook row (by its PriceBook name) in a captured export slice; throw if it is missing. */
function requireRow(cap: { header: string[]; rows: string[][] }, priceBook: string, locationNo: string = OFFICE): string[] {
  const pbIdx = cap.header.indexOf('PriceBook');
  const row = cap.rows.find((r) => r[pbIdx] === priceBook);
  if (!row) throw new Error(`Loc ${locationNo}: pricebook row "${priceBook}" not found in the export`);
  return row;
}

test.describe('Corporate Pricing — Loc Pricing Import: real round-trip & dialog surface (NM-2305) @corporate-pricing @loc-pricing-import', () => {
  // Every test except the dialog-surface case mutates the throwaway office 5897, so each gets a verified
  // baseline reset before and a best-effort restore after.
  const DIALOG_SURFACE_IDS = ['TC-CPR-LIM-011'];
  const isDialogSurface = (title: string) => DIALOG_SURFACE_IDS.some((id) => title.startsWith(id));

  test.beforeEach(async ({ corporatePricingSearchPage: p }, testInfo) => {
    if (isDialogSurface(testInfo.title)) {
      test.setTimeout(60_000);
      await p.open();
      return;
    }
    test.setTimeout(120_000); // upload + server processing + a full export re-download can be slow
    await p.open();
    // Deterministic baseline: put the throwaway office back to all-Primary before every test so a prior
    // test (or a crashed run) can never bleed into this one.
    const reset = await p.locPricingImport(fixturePath('baseline.csv'));
    expect(reset.success, `office ${OFFICE} baseline reset`).toBe(true);
    // Persistence-verified reset: don't trust the upload's own success flag — re-read the export and
    // confirm 5897 is EXACTLY its three baseline rows before the test body runs.
    const seed = await p.captureLocPricingCsvRows(OFFICE);
    expect(seed.rows, `office ${OFFICE} did not reset to its 3 baseline rows`).toHaveLength(3);
    expect(sortRows(seed.rows)).toEqual(sortRows(BASELINE_ROWS));
  });

  test.afterEach(async ({ corporatePricingSearchPage: p }, testInfo) => {
    if (isDialogSurface(testInfo.title)) return;
    test.setTimeout(120_000);
    // Restore the throwaway office to baseline (best-effort — logged, not asserted, so a flaky restore
    // never masks the test's own verdict).
    const restore = await p.locPricingImport(fixturePath('baseline.csv')).catch(() => null);
    if (!restore || !restore.success) {
      test.info().annotations.push({ type: 'restore', description: `office ${OFFICE} restore to baseline did not confirm` });
    }
  });

  test('TC-CPR-LIM-001: Loc Pricing Import flips a pricebook Primary->Alternate and the change reflects in a fresh export', { tag: ['@mutation', '@C99765'] }, async ({ corporatePricingSearchPage: p }) => {
    // Known start: NP LB4 is Primary (the beforeEach reset already set this — assert it to prove causation).
    const before = await p.captureLocPricingCsvRows(OFFICE);
    expect(before.header).toEqual(LOC_H); // the export schema is the one the fixtures were built against
    expect(requireRow(before, '2026-NP LB4')[ALT_IDX]).toBe('0');

    // The real mutation: upload a minimal single-location file that flips NP LB4 to Alternate.
    const result = await p.locPricingImport(fixturePath('valid-update.csv'));
    expect(result.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.message).toContain(IMP2.successMessageFragment);
    expect(result.requestUrl).toContain(CORP_PRICING_LOC_IMPORT_API);

    // Verify in a fresh export (the oracle): the whole 11-column row equals the uploaded values.
    const after = await p.captureLocPricingCsvRows(OFFICE);
    expect(requireRow(after, '2026-NP LB4')).toEqual(['5897', '2026-NP LB4', '2026-NP LB4', 'USD', '0', '1', '1', '1', '0', '', '']);
  });

  test('TC-CPR-LIM-002: Loc Pricing Import replaces a location set — a row omitted from the file is removed, not merged', { tag: ['@mutation', '@C99766'] }, async ({ corporatePricingSearchPage: p }) => {
    // A canary office named in NO import file — captured before + after to prove the import touches only
    // the office the file carries, not others.
    const CANARY = '1101';
    const canaryBefore = await p.captureLocPricingCsvRows(CANARY);
    expect(canaryBefore.rows.length, 'canary office must have rows to compare').toBeGreaterThan(0);

    // beforeEach reset 5897 to its three baseline rows. A 2-of-3-row file: LV-PB flipped to Alternate,
    // LV-LB left Primary; NP LB4 omitted entirely.
    const result = await p.locPricingImport(fixturePath('partial-update.csv'));
    expect(result.success, result.message).toBe(true);

    // A per-(location, currency) replace, not a per-row merge: the in-file rows keep their exact values
    // and the omitted row is gone.
    const after = await p.captureLocPricingCsvRows(OFFICE);
    const pbIdx = after.header.indexOf('PriceBook');
    // Full 11-column assertion on BOTH survivors — not just the flag — so a corrupt Currency/Labor/etc.
    // value cannot slip through.
    expect(requireRow(after, '2026-LV-PB-3867')).toEqual(['5897', '2026-LV-PB-3867', '2026-LV-PB-3867', 'USD', '0', '0', '1', '0', '0', '', '']);
    expect(requireRow(after, '2026-LV-LB-3867')).toEqual(['5897', '2026-LV-LB-3867', '2026-LV-LB-3867', 'USD', '0', '1', '0', '0', '0', '', '']);
    expect(after.rows.map((r) => r[pbIdx])).not.toContain('2026-NP LB4'); // omitted row REMOVED (replace, not merge)
    expect(after.rows).toHaveLength(2); // exactly the file's two rows survive — the count IS the feature (per-location-currency replace)

    // The canary office is completely untouched by a single-office import (order-agnostic compare).
    const canaryAfter = await p.captureLocPricingCsvRows(CANARY);
    expect(sortRows(canaryAfter.rows)).toEqual(sortRows(canaryBefore.rows));
  });

  test('TC-CPR-LIM-003: Loc Pricing Import rejects an empty file in the browser and runs no import', { tag: ['@mutation', '@C99767'] }, async ({ corporatePricingSearchPage: p }) => {
    const before = await p.captureLocPricingCsvRows(OFFICE);
    const result = await p.locPricingImport(fixturePath('empty.csv'));
    expect(result.success).toBe(false);
    expect(result.status).toBeNull(); // rejected before any request fired
    expect(result.message).toContain(IMP2.rejectEmptyMessage);
    await p.closeImportDialog();
    const after = await p.captureLocPricingCsvRows(OFFICE);
    expect(sortRows(after.rows)).toEqual(sortRows(before.rows)); // nothing was committed
  });

  test('TC-CPR-LIM-004: Loc Pricing Import rejects a non-CSV file by type and runs no import', { tag: ['@mutation', '@C99768'] }, async ({ corporatePricingSearchPage: p }) => {
    const before = await p.captureLocPricingCsvRows(OFFICE);
    const result = await p.locPricingImport(fixturePath('wrong-format.txt'));
    expect(result.success).toBe(false);
    expect(result.status).toBeNull();
    expect(result.message).toContain(IMP2.rejectWrongFormatMessage);
    await p.closeImportDialog();
    const after = await p.captureLocPricingCsvRows(OFFICE);
    expect(sortRows(after.rows)).toEqual(sortRows(before.rows));
  });

  test('TC-CPR-LIM-005: Loc Pricing Import surfaces an error for a structurally malformed CSV and runs no import', { tag: ['@mutation', '@C99769'] }, async ({ corporatePricingSearchPage: p }) => {
    const before = await p.captureLocPricingCsvRows(OFFICE);
    const result = await p.locPricingImport(fixturePath('malformed.csv'));
    // A malformed file is rejected before any request runs; the message is a raw parser error today,
    // so match the error family rather than one brittle string.
    expect(result.success).toBe(false);
    expect(result.status).toBeNull();
    expect(result.message, 'a malformed file must surface a visible error, not a silent no-op').toMatch(
      /cannot read propert|error|invalid|unsupported|does not contain|check the upload file/i,
    );
    await p.closeImportDialog();
    const after = await p.captureLocPricingCsvRows(OFFICE);
    expect(sortRows(after.rows)).toEqual(sortRows(before.rows));
  });

  // The app auto-submits the moment a file is chosen, so there is no "choose then cancel" window;
  // the only negative case left is opening the affordance and dismissing it.
  test('TC-CPR-LIM-006: Loc Pricing Import — opening and dismissing the dialog without choosing a file runs no import', { tag: ['@mutation', '@C99770'] }, async ({ corporatePricingSearchPage: p }) => {
    const before = await p.captureLocPricingCsvRows(OFFICE);

    // Arm the import-request listener BEFORE opening the affordance, so a regression where merely opening
    // "Loc Pricing Import" fires an import is caught — not only one after the dialog is already open.
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_LOC_IMPORT_API)) importFired = true;
    };
    p.page.on('request', onReq);
    await p.openLocPricingImportDialog();
    await p.closeImportDialog();
    p.page.off('request', onReq);
    expect(importFired).toBe(false);

    const after = await p.captureLocPricingCsvRows(OFFICE);
    expect(sortRows(after.rows)).toEqual(sortRows(before.rows));
  });

  test('TC-CPR-LIM-007: Loc Pricing Import change persists on a fresh export after reload and the search grid still renders', { tag: ['@mutation', '@C99771'] }, async ({ corporatePricingSearchPage: p }) => {
    const result = await p.locPricingImport(fixturePath('valid-update.csv')); // flip NP LB4 -> Alternate
    expect(result.success, result.message).toBe(true);

    await p.open(); // reload the Search page
    expect(await p.getVisibleRowCount(), 'The search grid should still render after reload').toBeGreaterThan(0); // grid re-renders, not left blank (guards NM-2206)

    const after = await p.captureLocPricingCsvRows(OFFICE);
    expect(requireRow(after, '2026-NP LB4')[ALT_IDX]).toBe('1'); // the imported value is durable, not an in-memory echo
  });

  test('TC-CPR-LIM-008: Loc Pricing Import rejects a header-only CSV (headers, zero data rows) in the browser and runs no import', { tag: ['@mutation', '@C99773'] }, async ({ corporatePricingSearchPage: p }) => {
    const before = await p.captureLocPricingCsvRows(OFFICE);
    const result = await p.locPricingImport(fixturePath('header-only.csv'));
    // Distinct from the 0-byte empty file: a header-only file is also rejected client-side, with its own
    // message, and never fires a request.
    expect(result.success).toBe(false);
    expect(result.status).toBeNull();
    expect(result.message).toContain(IMP2.rejectHeaderOnlyMessage);
    await p.closeImportDialog();
    const after = await p.captureLocPricingCsvRows(OFFICE);
    expect(sortRows(after.rows)).toEqual(sortRows(before.rows)); // nothing committed
  });

  test('TC-CPR-LIM-009: Loc Pricing Import applies only the Alternate flag — Internal/Labor/Production columns are not written', { tag: ['@mutation', '@C99774'] }, async ({ corporatePricingSearchPage: p }) => {
    // The file sets all four boolean flags to 1 on LV-PB. The server accepts it, but only Alternate is an
    // import-writable column — the fresh export proves the other three stay 0 (live-verified write scope).
    const result = await p.locPricingImport(fixturePath('field-writability.csv'));
    expect(result.status).toBe(200);
    expect(result.success, result.message).toBe(true);

    const after = await p.captureLocPricingCsvRows(OFFICE);
    const H = after.header;
    const row = requireRow(after, '2026-LV-PB-3867');
    expect(row[H.indexOf('IsAlternate')]).toBe('1');   // the only flag the import writes
    expect(row[H.indexOf('IsInternal')]).toBe('0');    // unchanged despite the file setting it to 1
    expect(row[H.indexOf('IsLabor')]).toBe('0');       // unchanged despite the file setting it to 1
    expect(row[H.indexOf('IsProduction')]).toBe('0');  // unchanged despite the file setting it to 1
  });

  test('TC-CPR-LIM-010: Loc Pricing Import silently drops a pricebook not already defined in the system — no row is created', { tag: ['@mutation', '@C99775'] }, async ({ corporatePricingSearchPage: p }) => {
    const before = await p.captureLocPricingCsvRows(OFFICE);
    const result = await p.locPricingImport(fixturePath('create-novel.csv')); // 3 baseline rows + 1 novel pricebook
    expect(result.success, result.message).toBe(true);

    // The server reports the novel row as "processed" but createdCount is 0 and it never appears in the
    // export — the import updates existing pricebooks and cannot create a new pricebook definition.
    const parsed = JSON.parse(result.responseBody ?? '{}') as { data?: { createdCount?: number } };
    expect(parsed.data?.createdCount).toBe(0);

    const after = await p.captureLocPricingCsvRows(OFFICE);
    const pbIdx = after.header.indexOf('PriceBook');
    expect(after.rows.map((r) => r[pbIdx])).not.toContain('2026-NOVEL-PROBE-9999');
    expect(sortRows(after.rows)).toEqual(sortRows(before.rows)); // 5897 unchanged — the novel row was dropped
  });

  // ── Dialog surface ──
  test('TC-CPR-LIM-011: Loc Pricing Import opens the "Import All Location Pricing" dialog', { tag: '@C99776' }, async ({ corporatePricingSearchPage: p }) => {
    await p.openLocPricingImportDialog();
    const info = await p.getImportDialogInfo();
    expect(info.text).toContain(CORP_PRICING_TOOLBAR_IO.locPricingImportDialogTitle);
    expect(info.buttons).toEqual(expect.arrayContaining(['Browse', 'Upload']));
    expect(info.hasFileInput).toBe(true);
    await p.closeImportDialog();
  });
});
