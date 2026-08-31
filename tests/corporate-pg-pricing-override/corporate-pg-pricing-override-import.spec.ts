import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE,
  CORP_PRICING_OVERRIDE_ACTIVE_BED,
} from '../../src/data/corporate-override/override';
import type { CorporatePricingOverridePage } from '../../src/pages/corporate-pg-pricing-override/corporate-pg-pricing-override.page';
import { resolve } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const IMP = CORP_PRICING_OVERRIDE.import;
const RT = IMP.roundTrip;
const importFixture = (name: string): string =>
  resolve(__dirname, '../../src/data/corporate-pricing/fixtures', IMP.fixtureDir, name);

const IMPHEADER = CORP_PRICING_OVERRIDE.export.expectedHeaders.join(',');
const validRow = (price: string): string => `${RT.office},${RT.productGroupId},${RT.productGroupName},0,USD,305.00,${price},,1`;
const invalidPgRow = `${RT.office},9999999,Nonexistent Product Group,0,USD,305.00,152.00,,1`;
const writeTmp = (name: string, content: string): string => {
  const dir = mkdtempSync(resolve(tmpdir(), 'ovr-batch-'));
  const file = resolve(dir, name);
  writeFileSync(file, content, 'utf-8');
  return file;
};

const expectBodyRejection = async (p: CorporatePricingOverridePage, fixtureName: string, errorContains: string): Promise<void> => {
  await p.reloadAndReselect(RT.office);
  const before = await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!);
  await p.openImportDialog();
  await p.attachImportFile(importFixture(fixtureName));
  const result = await p.submitImportAndCaptureResult();
  expect(result.status, 'the import POST returns 200 (partial-success API)').toBe(200);
  expect(result.successRecordCount, 'no row was applied').toBe(0);
  expect(result.failureRecordCount, 'the invalid row is counted as a failure').toBe(1);
  expect(result.errors.join(' | '), 'the error names the offending field').toContain(errorContains);
  await p.reloadAndReselect(RT.office);
  expect(await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!), 'the grid is unchanged after the rejected row').toBe(before);
};

const expectToastRejection = async (p: CorporatePricingOverridePage, fixtureName: string): Promise<string> => {
  await p.reloadAndReselect(RT.office);
  const before = await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!);
  await p.openImportDialog();
  await p.attachImportFile(importFixture(fixtureName));
  await p.clickImportUpload();
  const alert = await p.readImportAlert();
  await p.reloadAndReselect(RT.office);
  expect(await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!), 'the grid is unchanged after the rejected file').toBe(before);
  return alert;
};
test.describe('Corporate Pricing Override — Import (NM-2273)', () => {
  test('TC-CPR-OVR-147: Import dialog keeps Upload disabled until a file is attached', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(RT.office);
    await p.openImportDialog();
    const dlg = await p.readImportDialog();
    expect(dlg.text, 'the import dialog is the "Import All Pricing Overrides" dialog').toContain(CORP_PRICING_OVERRIDE.importDialog.title);
    expect(dlg.buttons, 'the dialog offers a Cancel control').toContain('Cancel');

    const before = await p.readImportUploadState();
    expect(before.uploadDisabled, 'Upload is disabled before any file is attached').toBe(true);
    expect(before.noFileVisible, 'the "No file selected" hint shows before a file is attached').toBe(true);

    await p.attachImportFile(importFixture(IMP.malformedFixture));
    const after = await p.readImportUploadState();
    expect(after.uploadDisabled, 'attaching a file enables Upload').toBe(false);

    await p.closeImportDialog(); // no upload performed — the gate is the feature under test
    expect(await p.isImportDialogVisible(), 'Cancel dismisses the dialog with nothing uploaded').toBe(false);
  });

  test('TC-CPR-OVR-148: Malformed CSV is rejected with a readable error and changes zero rows', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.reloadAndReselect(RT.office);
    const rowBefore = await p.findRowByProductGroup(RT.productGroupName);
    expect(rowBefore).not.toBeNull();
    const priceBefore = await p.readOverridePrice(rowBefore!);
    const countBefore = await p.getVisibleRowCount();

    await p.openImportDialog();
    await p.attachImportFile(importFixture(IMP.malformedFixture));
    await p.clickImportUpload();
    const alert = await p.readImportAlert();
    expect(alert, 'a malformed file surfaces a readable rejection, not a silent no-op').toMatch(IMP.malformedRejectPattern);

    // Reload + re-select and confirm the rejection prevented any mutation (save-honesty: the reload is the oracle).
    await p.reloadAndReselect(RT.office);
    const rowAfter = await p.findRowByProductGroup(RT.productGroupName);
    expect(rowAfter).not.toBeNull();
    expect(await p.readOverridePrice(rowAfter!), 'Override Price is unchanged after the rejected import').toBe(priceBefore);
    expect(await p.getVisibleRowCount(), 'row count is unchanged after the rejected import').toBe(countBefore);

    // Cross-office canary: a rejected import must not partially apply ANYWHERE — the richer 9-row office
    // keeps its full row set (the 1-row target office alone cannot prove tenant-wide zero-change).
    await p.reloadAndReselect(CORP_PRICING_OVERRIDE_ACTIVE_BED.office);
    expect(await p.getVisibleRowCount(), 'the canary office is unchanged by the rejected import').toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1), 'a canary row is intact by content').not.toBeNull();
  });

  test('TC-CPR-OVR-149: Empty CSV is rejected with a file-format error and changes zero rows', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.reloadAndReselect(RT.office);
    const rowBefore = await p.findRowByProductGroup(RT.productGroupName);
    expect(rowBefore).not.toBeNull();
    const priceBefore = await p.readOverridePrice(rowBefore!);
    const countBefore = await p.getVisibleRowCount();

    await p.openImportDialog();
    await p.attachImportFile(importFixture(IMP.emptyFixture));
    await p.clickImportUpload();
    const alert = await p.readImportAlert();
    expect(alert, 'an empty file surfaces a readable file-format rejection').toBe(IMP.emptyRejectMessage);

    await p.reloadAndReselect(RT.office);
    const rowAfter = await p.findRowByProductGroup(RT.productGroupName);
    expect(rowAfter).not.toBeNull();
    expect(await p.readOverridePrice(rowAfter!), 'Override Price is unchanged after the rejected empty import').toBe(priceBefore);
    expect(await p.getVisibleRowCount(), 'row count is unchanged after the rejected empty import').toBe(countBefore);

    // Cross-office canary: the rejected empty import must not touch the richer 9-row office either.
    await p.reloadAndReselect(CORP_PRICING_OVERRIDE_ACTIVE_BED.office);
    expect(await p.getVisibleRowCount(), 'the canary office is unchanged by the rejected empty import').toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
    expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1), 'a canary row is intact by content').not.toBeNull();
  });

  test('TC-CPR-OVR-150: Valid import round-trip updates the Override Price then restores it (office 4107 / product group 4298)', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(180_000); // a modify + a restore import, each a clean response, plus a cross-office check and reloads
    await p.reloadAndReselect(RT.office);

    // Re-imports a minimal header + one-row file: a full dump stalls the client (NM-2186), and a
    // minimal file upserts only the target row, leaving absent locations untouched.
    const exp = await p.downloadOverrideExport();
    const lines = exp.content.split(/\r?\n/);
    const header = lines[0]!;
    const targetPrefix = `${RT.office},${RT.productGroupId},`;
    const targetRow = lines.slice(1).find((l) => l.startsWith(targetPrefix));
    expect(targetRow, 'the target row is present in the export').toBeTruthy();
    const baselinePrice = targetRow!.split(',')[RT.overridePriceColumnIndex]!; // live baseline, e.g. "152.00"
    const modifiedPrice = (parseFloat(baselinePrice) + 0.01).toFixed(2); // a net change distinct from the baseline

    const dir = mkdtempSync(resolve(tmpdir(), 'ovr-import-'));
    // A 2-line file: the header + the single target row, with only the Override Price rewritten.
    const buildFile = (price: string): string => {
      const cols = targetRow!.split(',');
      cols[RT.overridePriceColumnIndex] = price;
      const file = resolve(dir, `ovr-${price}.csv`);
      writeFileSync(file, [header, cols.join(',')].join('\n'), 'utf-8');
      return file;
    };
    // Capture the target row's pre-import Mod Date so we can prove the import stamped a fresh one.
    const rowBefore = await p.findRowByProductGroup(RT.productGroupName);
    expect(rowBefore).not.toBeNull();
    const metaBefore = await p.readRowMeta(rowBefore!);

    // The import is a PER-ROW partial-success API — a 200 alone is NOT proof a row applied (a fully-invalid
    // file also returns 200). Assert the server reports exactly the one row succeeded and none failed.
    const fireImport = async (file: string): Promise<void> => {
      await p.openImportDialog();
      await p.attachImportFile(file);
      const result = await p.submitImportAndCaptureResult();
      expect(result.status, 'the import POST returns 200').toBe(200);
      expect(result.failureRecordCount, 'no rows were rejected').toBe(0);
      expect(result.successRecordCount, 'exactly the one row was applied').toBe(1);
    };

    let restoredOk = false;
    try {
      // Modify → read back the committed value after the clean-response import.
      await fireImport(buildFile(modifiedPrice));
      expect(
        parseFloat(await p.awaitImportedOverridePrice(RT.office, RT.productGroupName, modifiedPrice)),
        'the imported Override Price is committed',
      ).toBe(parseFloat(modifiedPrice));

      // The import stamped the row's metadata and left its OTHER columns intact (only Override Price moved).
      const rowAfter = await p.findRowByProductGroup(RT.productGroupName);
      expect(rowAfter).not.toBeNull();
      expect((await rowAfter!.locator('td').nth(CORP_PRICING_OVERRIDE.columnIndex.currency).innerText()).trim(), 'currency is unchanged by the import').toBe('USD');
      expect(await p.readActiveState(rowAfter!), 'Active is unchanged by the import').toBe(true);
      const metaAfter = await p.readRowMeta(rowAfter!);
      expect(metaAfter.updatedBy, 'the import stamped Updated By').not.toBe('');
      expect(metaAfter.modDate, 'the import stamped a fresh Mod Date').not.toBe(metaBefore.modDate);

      // Upsert scope: the body proved exactly ONE row applied, so a location absent from the file keeps its
      // full row set AND its content — asserted by a named row, not just the count (full row verification).
      await p.reloadAndReselect(CORP_PRICING_OVERRIDE_ACTIVE_BED.office);
      expect(await p.getVisibleRowCount(), 'the canary office keeps its full row set').toBe(CORP_PRICING_OVERRIDE_ACTIVE_BED.totalRows);
      expect(await p.findRowByProductGroup(CORP_PRICING_OVERRIDE_ACTIVE_BED.inactiveGroupName1), 'a canary row is intact by content').not.toBeNull();

      // Restore the target to its original price and confirm it landed.
      await p.reloadAndReselect(RT.office);
      await fireImport(buildFile(baselinePrice));
      expect(
        parseFloat(await p.awaitImportedOverridePrice(RT.office, RT.productGroupName, baselinePrice)),
        'the Override Price is restored to its original value',
      ).toBe(parseFloat(baselinePrice));
      restoredOk = true;
    } finally {
      // Never leave the shared tenant dirty: best-effort restore if any assertion above threw mid-round-trip.
      if (!restoredOk) {
        await p.reloadAndReselect(RT.office)
          .then(() => p.openImportDialog())
          .then(() => p.attachImportFile(buildFile(baselinePrice)))
          .then(() => p.submitImportAndCaptureResult())
          .then(() => p.awaitImportedOverridePrice(RT.office, RT.productGroupName, baselinePrice))
          .catch(() => { /* best-effort */ });
      }
    }
  });
  test('TC-CPR-OVR-152: Import rejects a row with an invalid currency and applies nothing', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await expectBodyRejection(p, IMP.validation.bodyErrors.invalidCurrency.fixture, IMP.validation.bodyErrors.invalidCurrency.errorContains);
  });

  test('TC-CPR-OVR-153: Import rejects a negative Override Price and applies nothing', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await expectBodyRejection(p, IMP.validation.bodyErrors.negativePrice.fixture, IMP.validation.bodyErrors.negativePrice.errorContains);
  });

  test('TC-CPR-OVR-154: Import rejects an Override Discount above 100 — the 100 cap is enforced on import too', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await expectBodyRejection(p, IMP.validation.bodyErrors.discountOver100.fixture, IMP.validation.bodyErrors.discountOver100.errorContains);
  });

  test('TC-CPR-OVR-155: Import rejects a non-numeric Override Price with a decimal-format error', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    const alert = await expectToastRejection(p, IMP.validation.toastErrors.nonNumericPrice.fixture);
    expect(alert, 'a non-numeric price is rejected with a decimal-format message').toMatch(IMP.validation.toastErrors.nonNumericPrice.pattern);
  });

  test('TC-CPR-OVR-156: Import rejects a nonexistent Product Group Id and applies nothing', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await expectBodyRejection(p, IMP.validation.bodyErrors.nonexistentPg.fixture, IMP.validation.bodyErrors.nonexistentPg.errorContains);
  });

  test('TC-CPR-OVR-157: Import rejects a nonexistent Location and applies nothing', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await expectBodyRejection(p, IMP.validation.bodyErrors.nonexistentLocation.fixture, IMP.validation.bodyErrors.nonexistentLocation.errorContains);
  });

  test('TC-CPR-OVR-158: Import rejects a row with too few columns naming the required fields', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    const alert = await expectToastRejection(p, IMP.validation.toastErrors.tooFewColumns.fixture);
    expect(alert, 'a too-short row is rejected naming the required fields').toMatch(IMP.validation.toastErrors.tooFewColumns.pattern);
  });

  test('TC-CPR-OVR-159: Import ignores extra trailing columns and applies the valid row', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.reloadAndReselect(RT.office);
    await p.openImportDialog();
    await p.attachImportFile(importFixture(IMP.validation.extraColumns.fixture));
    const result = await p.submitImportAndCaptureResult();
    // Extra columns are ignored (not an error): the server takes the leading fields and applies the row.
    expect(result.status, 'the import POST returns 200').toBe(200);
    expect(result.failureRecordCount, 'no row failed on the extra columns').toBe(0);
    expect(result.successRecordCount, 'the valid row applied despite extra columns').toBe(1);
    // The fixture holds the certified 152.00, so the office stays at its baseline value (no drift).
    await p.reloadAndReselect(RT.office);
    expect(parseFloat(await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!)), 'the row holds the certified baseline').toBe(152.00);
  });

  test('TC-CPR-OVR-160: Import rejects a header-only file with a file-format error', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    const alert = await expectToastRejection(p, IMP.validation.toastErrors.headerOnly.fixture);
    expect(alert, 'a header-only file is rejected as a format error').toBe(IMP.validation.toastErrors.headerOnly.message);
  });

  test('TC-CPR-OVR-161: Import blocks a non-CSV file — Upload stays disabled with an unsupported-type message', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(RT.office);
    await p.openImportDialog();
    await p.attachImportFileRaw(importFixture(IMP.validation.wrongExtension.fixture));
    const state = await p.readImportUploadState();
    expect(state.uploadDisabled, 'a non-CSV file leaves Upload disabled').toBe(true);
    expect(await p.readImportAlert(), 'the dialog explains the allowed file type').toContain(IMP.validation.wrongExtension.message);
    await p.closeImportDialog();
  });

  test('TC-CPR-OVR-162: Import dialog shows the attached file and dismisses without uploading', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(90_000);
    await p.reloadAndReselect(RT.office);
    await p.openImportDialog();
    const before = await p.readImportDialog();
    expect(before.text, 'the dialog starts with no file selected').toContain(CORP_PRICING_OVERRIDE.importDialog.noFileText);
    // The dialog offers two redundant dismiss controls — Cancel and Close (both plain text buttons that
    // dismiss without uploading); assert both are present.
    expect(before.buttons, 'the dialog offers a Cancel control').toContain('Cancel');
    expect(before.buttons, 'the dialog offers a Close control').toContain('Close');
    await p.attachImportFile(importFixture(IMP.malformedFixture));
    const after = await p.readImportDialog();
    expect(after.text, 'attaching a file clears the "No file selected" hint').not.toContain(CORP_PRICING_OVERRIDE.importDialog.noFileText);
    await p.closeImportDialog();
    expect(await p.isImportDialogVisible(), 'a dismiss control closes the dialog with nothing uploaded').toBe(false);
  });

  test('TC-CPR-OVR-163: A file mixing one valid row and one invalid row is a partial success — the valid row applies, the invalid one fails', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.reloadAndReselect(RT.office);
    const baseline = await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!);
    // Valid row re-imports the current baseline (a no-op); the second row references a nonexistent product group.
    const file = writeTmp('mixed.csv', [IMPHEADER, validRow(baseline), invalidPgRow].join('\n'));
    await p.openImportDialog();
    await p.attachImportFile(file);
    const result = await p.submitImportAndCaptureResult();
    expect(result.status, 'the import POST returns 200').toBe(200);
    expect(result.successRecordCount, 'the one valid row is applied').toBe(1);
    expect(result.failureRecordCount, 'the one invalid row fails independently (rows are not all-or-nothing)').toBe(1);
    expect(result.errors.join(' | '), 'the failure names the nonexistent product group').toContain(IMP.validation.bodyErrors.nonexistentPg.errorContains);
    await p.reloadAndReselect(RT.office);
    expect(await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!), 'the target keeps its baseline value (the valid no-op row did not corrupt it)').toBe(baseline);
  });

  test('TC-CPR-OVR-164: A file with duplicate rows for the same override is accepted (both rows succeed, no duplicate error)', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(120_000);
    await p.reloadAndReselect(RT.office);
    const baseline = await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!);
    // The same target row twice, both at the current baseline (idempotent no-op).
    const file = writeTmp('duplicate.csv', [IMPHEADER, validRow(baseline), validRow(baseline)].join('\n'));
    await p.openImportDialog();
    await p.attachImportFile(file);
    const result = await p.submitImportAndCaptureResult();
    expect(result.status, 'the import POST returns 200').toBe(200);
    expect(result.failureRecordCount, 'neither duplicate row is rejected').toBe(0);
    expect(result.successRecordCount, 'both rows in the batch are accepted (idempotent, no duplicate-key error)').toBe(2);
    await p.reloadAndReselect(RT.office);
    expect(await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!), 'the target keeps its baseline value').toBe(baseline);
  });

  test('TC-CPR-OVR-165: A large batch (6000 rows) is processed per-row without a stall or size limit', async ({ corporatePricingOverridePage: p }) => {
    test.setTimeout(180_000);
    await p.reloadAndReselect(RT.office);
    const baseline = await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!);
    // Every row references a nonexistent product group, so the batch is reject-safe and cannot mutate
    // the tenant. There is no separate "file too large" gate — the result comes back per-row.
    const rows = Array.from({ length: 6000 }, () => invalidPgRow);
    const file = writeTmp('large-batch.csv', [IMPHEADER, ...rows].join('\n'));
    await p.openImportDialog();
    await p.attachImportFile(file);
    const result = await p.submitImportAndCaptureResult();
    expect(result.status, 'the large batch returns a normal response (no stall, no size-limit error)').toBe(200);
    expect(result.successRecordCount, 'no invalid row is applied').toBe(0);
    expect(result.failureRecordCount, 'every row in the large batch is reported per-row').toBe(6000);
    await p.reloadAndReselect(RT.office);
    expect(await p.readOverridePrice((await p.findRowByProductGroup(RT.productGroupName))!), 'the target is unchanged by the all-invalid large batch').toBe(baseline);
  });

});
