import { resolve } from 'node:path';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { CORP_PRICING_TOOLBAR_IO, CORP_PRICING_IMPORT_ALL_API } from '../../src/data/corporate-pricing/toolbar-io';

const VARIANTS = CORP_PRICING_TOOLBAR_IO.variants;
const IMP = CORP_PRICING_TOOLBAR_IO.importDialog;
const CUR = CORP_PRICING_TOOLBAR_IO.currencies;
const IMP_ALL = CORP_PRICING_TOOLBAR_IO.importAll;

// Import ▾ All (NM-2265) — the real upload round-trip for the grid-scoped Import.
//
// This is a DELTA-STAGE flow, fundamentally different from the location-scoped Loc Pricing Import above:
//  1. Import ▾ → a variant → a Year(s)+Currency precondition dialog (Continue disabled until both set).
//  2. Continue → the "Import All <variant>" upload dialog.
//  3. Choosing a file does NOT commit — the app re-downloads the server pricebook and diffs the file
//     against it in the browser, then either shows a message (no changes / no matching pricebooks /
//     unsupported type) or opens a "Select items to publish" modal listing every changed cell.
//  4. Nothing persists until the user selects rows and clicks Publish (the only mutating request,
//     `pricing-import`).
//
// It is a delta MERGE (cells absent from the file are untouched, not deleted) and has NO location axis (the
// file is Product Group Id + Product Group Name + one column per pricebook), so a change touches a corporate
// pricebook every location referencing it shares. The @mutation round-trip therefore mutates ONE product-
// group price in ONE pricebook (2026-LV-PB-9025 / product group 271) that no other test reads, and restores
// it, verifying the restore from a fresh export.
const importAllFixture = (name: string): string =>
  resolve(__dirname, '../../src/data/corporate-pricing/fixtures/import-all', name);
const RT = IMP_ALL.roundTrip;

test.describe('Corporate Pricing — Import ▾ All: precondition dialog, diff outcomes, round-trip & surface (NM-2265) @corporate-pricing @toolbar-io', () => {
  type SearchPage = import('../../src/pages/corporate-pricing/corporate-pricing-search.page').CorporatePricingSearchPage;

  let original: string | null = null;

  let canaries: Awaited<ReturnType<SearchPage['captureImportAllMergeCanaries']>> | null = null;

  async function openImportAllUpload(p: SearchPage): Promise<void> {
    await p.openImportAllUploadFor(RT.variant, [...RT.years], RT.currency);
  }

  /** Import ONE cell back to `value` for `productGroupId` and publish it — the shared restore procedure used
   *  by the afterEach safety-net AND the in-test restores, so the mutation-undo logic has ONE definition.
   *  Returns whether a commit was published (false when the value already equals the server → nothing staged). */
  async function publishImportAllCell(p: SearchPage, productGroupId: string, value: string): Promise<boolean> {
    const fix = await p.buildImportAllSingleCellFixture({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId, pricebook: RT.pricebook, newValue: value });
    try {
      await p.openImportAllUploadFor(RT.variant, [...RT.years], RT.currency);
      const outcome = await p.chooseImportAllFile(fix.path);
      if (outcome.kind !== 'staged') return false; // value already equals the server value — nothing to publish
      return (await p.publishStagedImport()).success;
    } finally {
      p.removeTempFixture(fix.path);
    }
  }

  // Per-test baseline dispatched by TC number — each group keeps exactly the baseline it had
  // when the groups were separate describes:
  //  - TC-001..007 (precondition dialog): 90s + fresh page open.
  //  - TC-008..012 (diff outcomes): 120s — opening the flow + a real server-pricebook diff on file choose.
  //  - TC-013, TC-017 (real round-trip, @mutation): 360s — several real exports + publishes + a reload +
  //    the merge-survival re-reads; captures the target start value plus two untouched merge canaries,
  //    guards against a leaked sentinel, and gets a verified afterEach safety restore.
  //  - TC-014..016, TC-018 (surface-behavior): 200s.
  const tcNum = (title: string) => {
    const m = title.match(/^TC-CPR-IMA-(\d+)/);
    return m ? parseInt(m[1]!, 10) : -1;
  };

  const isRoundTrip = (n: number) => n === 13 || n === 17;

  test.beforeEach(async ({ corporatePricingSearchPage: p }, testInfo) => {
    const n = tcNum(testInfo.title);
    if (isRoundTrip(n)) {
      test.setTimeout(360_000); // several real exports + publishes + a reload + the merge-survival re-reads
      await p.open(); // per-test baseline: fresh search-grid load
      // One export captures the target's start value AND two untouched reference cells (a different product
      // group + a different pricebook column) used to prove the commit MERGES rather than REPLACES.
      canaries = await p.captureImportAllMergeCanaries({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
      original = canaries.target.value;
      // Dirty-start guard: the target must NOT already sit at the sentinel testValue — that would mean a prior
      // run leaked its mutation; fail loudly rather than adopting the corrupted value as this run's baseline.
      expect(original, `target ${RT.productGroupId}/${RT.pricebook} started at the sentinel ${RT.testValue} — a prior run leaked a mutation`).not.toBe(RT.testValue);
      return;
    }
    if (n >= 8 && n <= 12) test.setTimeout(120_000); // opening the flow + a real server-pricebook diff on file choose
    else if ((n >= 14 && n <= 16) || n === 18) test.setTimeout(200_000);
    else test.setTimeout(90_000);
    await p.open();
  });

  test.afterEach(async ({ corporatePricingSearchPage: p }, testInfo) => {
    if (!isRoundTrip(tcNum(testInfo.title))) return;
    test.setTimeout(360_000); // the safety-restore may run a full import + publish + verify — match the body budget
    if (original === null) return;
    // Safety restore — reverting shared server state MUST verify persistence and fail loudly (never trust
    // the publish call, never mask a failure as a passing note): an unrestored corporate-price mutation
    // leaks to the shared server and cascades into every later run. If the target is not back at its
    // captured original (e.g. the test threw mid-way), re-import the original and re-read to confirm; a
    // restore that cannot be confirmed FAILS the test rather than passing with a silent annotation.
    const current = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    if (current === original) return; // already clean — the test body restored it
    const restorePublished = await publishImportAllCell(p, RT.productGroupId, original);
    expect(restorePublished, `afterEach restore of ${RT.productGroupId}/${RT.pricebook} to ${original} must publish a real commit — a non-staged restore means the pre-restore read was stale and the mutation may still be live`).toBe(true);
    const restored = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    expect(restored, `afterEach must restore ${RT.productGroupId}/${RT.pricebook} to its original ${original} — an unrestored corporate price leaks to the shared server`).toBe(original);
  });

  test('TC-CPR-IMA-001: Each Import variant opens the shared "Import" Year(s)+Currency dialog', { tag: '@C99777' }, async ({ corporatePricingSearchPage: p }) => {
    for (const v of VARIANTS) {
      await p.openImportAllVariantDialog(v.label);
      const info = await p.getImportAllDialogInfo();
      // The dialog locator is scoped by its title + prompt, so asserting those same substrings can't fail —
      // the real oracles are the button set and the Continue-disabled precondition gate.
      expect(info.buttons).toEqual(expect.arrayContaining(['Cancel', 'Continue', 'Close']));
      expect(info.continueDisabled).toBe(true); // disabled before any field is set
      expect(await p.cancelImportAllDialog()).toBe(true);
    }
  });

  test('TC-CPR-IMA-002: Continue stays disabled with only Year(s) set', { tag: '@C99778' }, async ({ corporatePricingSearchPage: p }) => {
    await p.openImportAllVariantDialog('All Equipment Pricing');
    await p.setImportAllYears([IMP_ALL.precondition.defaultYear]);
    expect(await p.isImportAllContinueEnabled()).toBe(false); // Currency still required
  });

  test('TC-CPR-IMA-003: Continue stays disabled with only Currency set', { tag: '@C99779' }, async ({ corporatePricingSearchPage: p }) => {
    await p.openImportAllVariantDialog('All Equipment Pricing');
    await p.setImportAllCurrency('USD');
    expect(await p.isImportAllContinueEnabled()).toBe(false); // Year(s) still required
  });

  test('TC-CPR-IMA-004: Continue enables when BOTH Year(s) and Currency are set', { tag: '@C99780' }, async ({ corporatePricingSearchPage: p }) => {
    await p.openImportAllVariantDialog('All Equipment Pricing');
    await p.setImportAllYears([IMP_ALL.precondition.defaultYear]);
    await p.setImportAllCurrency('USD');
    expect(await p.isImportAllContinueEnabled()).toBe(true);
  });

  test('TC-CPR-IMA-005: Year(s) boundary — 1 accepted, 3 accepted, a 4th refused', { tag: '@C99781' }, async ({ corporatePricingSearchPage: p }) => {
    // Minimum: a single year is accepted.
    await p.openImportAllVariantDialog('All Equipment Pricing');
    await p.setImportAllYears([IMP_ALL.precondition.defaultYear]);
    expect(await p.getImportAllSelectedYears()).toEqual([IMP_ALL.precondition.defaultYear]);
    expect(await p.cancelImportAllDialog()).toBe(true);
    // Maximum: exactly 3 years accepted, and a 4th is refused (stays at 3).
    await p.openImportAllVariantDialog('All Equipment Pricing');
    await p.setImportAllYears(['2026', '2027', '2028']);
    expect(await p.getImportAllSelectedYears()).toEqual(['2026', '2027', '2028']);
    const afterFourth = await p.attemptExtraImportAllYear('2025'); // positive-control: the 4th option IS present + clicked
    expect(afterFourth).toEqual(['2026', '2027', '2028']); // stays at 3 — the 4th was refused, not merely absent
  });

  test('TC-CPR-IMA-006: Currency options present — USD, CAD, MXN', { tag: '@C99782' }, async ({ corporatePricingSearchPage: p }) => {
    await p.openImportAllVariantDialog('All Equipment Pricing');
    const options = await p.getImportAllCurrencyOptions();
    for (const c of CUR) expect(options).toContain(c.code);
  });

  test('TC-CPR-IMA-007: Cancel on the precondition dialog aborts — no upload dialog opens', { tag: '@C99783' }, async ({ corporatePricingSearchPage: p }) => {
    await p.openImportAllVariantDialog('All Equipment Pricing');
    await p.setImportAllYears([IMP_ALL.precondition.defaultYear]);
    await p.setImportAllCurrency('USD');
    expect(await p.cancelImportAllDialog()).toBe(true); // dialog closes
    expect(await p.importDialogCount()).toBe(0); // no upload dialog appeared (count-based — a crash throws here, it never silently passes)
  });

  // ── Diff outcomes ──
  test('TC-CPR-IMA-008: An unchanged file diffs to "no changes" and offers nothing to publish', { tag: '@C99784' }, async ({ corporatePricingSearchPage: p }) => {
    const current = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    const noChange = await p.buildImportAllSingleCellFixture({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook, newValue: current });
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API) && req.method() !== 'GET') importFired = true;
    };
    try {
      await openImportAllUpload(p);
      p.page.on('request', onReq);
      const outcome = await p.chooseImportAllFile(noChange.path);
      p.page.off('request', onReq);
      expect(outcome.kind).toBe('no-changes');
      expect(outcome.staged).toEqual([]); // nothing staged, nothing to publish
      expect(importFired).toBe(false); // no commit request fired for a no-op diff
      // The diff-on-choose GET carries the precondition selection — proves the chosen variant+currency+year
      // actually scope the server pricebook the file is diffed against (not a hardcoded slice).
      expect(outcome.diffRequestUrl, 'the diff-on-choose request should have fired').not.toBeNull();
      expect(outcome.diffRequestUrl!).toContain('isLabor=false');
      expect(outcome.diffRequestUrl!).toContain('isMaxDiscount=false');
      expect(outcome.diffRequestUrl!).toContain('currencyId=1'); // USD
      expect(new URL(outcome.diffRequestUrl!).searchParams.getAll('years')).toEqual([RT.years[0]]);
      await p.closeImportDialog();
    } finally {
      p.page.off('request', onReq);
      p.removeTempFixture(noChange.path);
    }
  });

  test('TC-CPR-IMA-009: An empty file is rejected as "no matching pricebooks" and runs no import', { tag: '@C99785' }, async ({ corporatePricingSearchPage: p }) => {
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API) && req.method() !== 'GET') importFired = true;
    };
    await openImportAllUpload(p);
    p.page.on('request', onReq);
    const outcome = await p.chooseImportAllFile(importAllFixture(IMP_ALL.fixtures.empty));
    p.page.off('request', onReq);
    expect(outcome.kind).toBe('no-match');
    expect(outcome.message).toContain(IMP_ALL.messages.noMatch); // the RAW dialog text (page object returns observed text)
    expect(outcome.staged).toEqual([]);
    expect(importFired).toBe(false); // no commit request fired
    await p.closeImportDialog();
  });

  test('TC-CPR-IMA-010: A malformed CSV is rejected as "no matching pricebooks" and runs no import', { tag: '@C99786' }, async ({ corporatePricingSearchPage: p }) => {
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API) && req.method() !== 'GET') importFired = true;
    };
    await openImportAllUpload(p);
    p.page.on('request', onReq);
    const outcome = await p.chooseImportAllFile(importAllFixture(IMP_ALL.fixtures.malformed));
    p.page.off('request', onReq);
    expect(outcome.kind).toBe('no-match');
    expect(outcome.message).toContain(IMP_ALL.messages.noMatch); // the RAW dialog text (page object returns observed text)
    expect(outcome.staged).toEqual([]);
    expect(importFired).toBe(false); // no commit request fired
    await p.closeImportDialog();
  });

  test('TC-CPR-IMA-011: A non-CSV file is rejected by type before any network', { tag: '@C99787' }, async ({ corporatePricingSearchPage: p }) => {
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API)) importFired = true;
    };
    p.page.on('request', onReq);
    await openImportAllUpload(p);
    const outcome = await p.chooseImportAllFile(importAllFixture(IMP_ALL.fixtures.wrongFormat));
    p.page.off('request', onReq);
    expect(outcome.kind).toBe('unsupported-type');
    expect(outcome.message).toContain(IMP_ALL.messages.unsupportedType);
    expect(importFired).toBe(false); // rejected client-side — no import request fired
    await p.closeImportDialog();
  });

  test('TC-CPR-IMA-012: Cancelling the publish modal after staging changes commits nothing', { tag: '@C99788' }, async ({ corporatePricingSearchPage: p }) => {
    const changed = await p.buildImportAllSingleCellFixture({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook, newValue: RT.testValue });
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API) && req.method() !== 'GET') importFired = true;
    };
    try {
      await openImportAllUpload(p);
      const outcome = await p.chooseImportAllFile(changed.path);
      expect(outcome.kind).toBe('staged'); // the change is staged (the publish modal is now open)...

      // The publish modal renders the documented columns + item count, and Publish is GATED until a row is
      // checked — the only guard before the sole mutating PUT.
      const modal = await p.getPublishModalInfo();
      expect(modal.headers).toEqual(expect.arrayContaining([...IMP_ALL.publishModal.columns])); // header contract
      expect(modal.rowCount).toBe(1); // exactly the one staged row
      expect(modal.totalItemsText).toContain('Total Items'); // the count label renders
      expect(modal.totalItemsText.replace(/[^0-9]/g, ''), 'the displayed Total Items count matches the staged rows').toBe(String(modal.rowCount));
      expect(modal.publishDisabled).toBe(true); // Publish disabled with zero rows checked
      await p.checkOneStagedRow();
      expect((await p.getPublishModalInfo()).publishDisabled, 'Publish enables once a row is selected').toBe(false);

      p.page.on('request', onReq);
      expect(await p.cancelPublishModal()).toBe(true); // ...but Cancel without Publish
      p.page.off('request', onReq);
      expect(importFired).toBe(false); // nothing committed
    } finally {
      p.page.off('request', onReq);
      p.removeTempFixture(changed.path);
    }
    const after = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    expect(after).toBe(changed.previousValue);
  });

  // ── Real round-trip (mutation, canary-guarded) ──
  test('TC-CPR-IMA-013: Import All publishes a changed price, it persists across reload, then restores', { tag: ['@mutation', '@C99789'] }, async ({ corporatePricingSearchPage: p }) => {
    const changed = await p.buildImportAllSingleCellFixture({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook, newValue: RT.testValue });
    try {
      expect(changed.previousValue).toBe(original); // the fixture builder and the beforeEach read the same start value
      await p.openImportAllUploadFor(RT.variant, [...RT.years], RT.currency);
      const staged = await p.chooseImportAllFile(changed.path);
      expect(staged.kind).toBe('staged');
      expect(staged.staged).toHaveLength(1);
      expect(staged.staged[0]).toEqual({
        pricebook: RT.pricebook,
        productGroupId: RT.productGroupId,
        productGroupName: RT.productGroupName, // the exact live-contract name, not merely any string
        price: changed.previousValue, // the old (server) price
        newPrice: RT.testValue, // the imported price
      });

      // Publish — the ONLY mutating step. Assert the real commit request, never the dialog alone.
      const publish = await p.publishStagedImport();
      expect(publish.status).toBe(200);
      expect(publish.success).toBe(true);
      expect(publish.method).toBe('PUT');
      expect(publish.requestUrl).toContain(CORP_PRICING_IMPORT_ALL_API);
      expect(publish.toast).toContain(IMP_ALL.publishModal.successToastFragment);
      expect(publish.toast, 'the toast reports the exact number of changes committed').toMatch(/1 pricing change/); // "There were 1 pricing change updates"
    } finally {
      p.removeTempFixture(changed.path);
    }

    // Persistence: reload the page, then confirm from a FRESH export that the imported value is durable
    // (not an in-memory echo) and the grid still renders (guards a blank-grid regression, NM-2206).
    await p.open();
    expect(await p.getVisibleRowCount()).toBeGreaterThan(0);
    const afterPublish = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    expect(afterPublish, 'The imported price should persist after page reload').toBe(RT.testValue);

    // MERGE, not replace: the import file carried a single product-group ROW (271), so every OTHER product
    // group was absent from the file. Read back an omitted product group (same pricebook column) and confirm
    // it is unchanged — a REPLACE regression that wiped the rest of the (variant/currency/year) pricebook
    // would fail this. Product-group ROW omission is the only meaningful merge proof here: the import file is
    // fixed-width (a column-narrow file is rejected as "unexpected format", verified 2026-07-09), so a row
    // present in the file always carries all 82 pricebook columns — a per-column omission simply cannot occur.
    const survivorRow = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: canaries!.otherRow.productGroupId, pricebook: canaries!.otherRow.pricebook });
    expect(survivorRow, `an omitted product group (${canaries!.otherRow.productGroupId}) must survive Publish unchanged — proves MERGE, not REPLACE`).toBe(canaries!.otherRow.value);

    // Restore: re-import the original value + publish, then verify the restore from a fresh export (never
    // trust the undo call). A failed restore must fail loudly, not silently pass.
    const restorePublished = await publishImportAllCell(p, RT.productGroupId, original!);
    expect(restorePublished, 'restore publish must succeed').toBe(true);
    const restored = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    expect(restored, 'the target cell must be restored to its original value').toBe(original);
  });

  // ── Surface-behavior ──
  test('TC-CPR-IMA-014: The staged delta shows the exact changed cell (old price → new price), then Cancel commits nothing', { tag: '@C99790' }, async ({ corporatePricingSearchPage: p }) => {
    const changed = await p.buildImportAllSingleCellFixture({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook, newValue: RT.testValue });
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API) && req.method() !== 'GET') importFired = true;
    };
    try {
      await p.openImportAllUploadFor(RT.variant, [...RT.years], RT.currency);
      p.page.on('request', onReq);
      const staged = await p.chooseImportAllFile(changed.path);
      expect(staged.kind).toBe('staged');
      expect(staged.staged).toHaveLength(1);
      expect(staged.staged[0]?.pricebook).toBe(RT.pricebook);
      expect(staged.staged[0]?.productGroupId).toBe(RT.productGroupId);
      expect(staged.staged[0]?.productGroupName).toBe(RT.productGroupName); // the exact live-contract name, not just any string
      expect(staged.staged[0]?.price).toBe(changed.previousValue); // old value
      expect(staged.staged[0]?.newPrice).toBe(RT.testValue); // new value
      expect(await p.cancelPublishModal()).toBe(true); // Cancel — no publish
      p.page.off('request', onReq);
      expect(importFired, 'no mutating import request fires on choose + Cancel').toBe(false);
    } finally {
      p.page.off('request', onReq);
      p.removeTempFixture(changed.path);
    }
    // "Cancel commits nothing" — assert it, don't just close the modal: a fresh export still shows the
    // original server value, never the staged testValue (a commit-on-choose/commit-on-cancel bug fails here).
    const after = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    expect(after, 'the target cell is unchanged after Cancel — nothing was committed').toBe(changed.previousValue);
  });

  test('TC-CPR-IMA-015: Combination — a bounded pairwise of variant × Year(s) × Currency all reach the upload dialog', { tag: '@C99791' }, async ({ corporatePricingSearchPage: p }) => {
    const yearsets: string[][] = [['2026'], ['2026', '2027', '2028']]; // 1-year and 3-year selections
    // A bounded pairwise covering array over {4 variants} × {1yr, 3yr} × {USD, CAD, MXN} — indices are
    // [variantIndex, yearsetIndex, currencyIndex]; every pair of factor levels appears at least once.
    const pairwise: Array<[number, number, number]> = [
      [0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 2], [2, 0, 2], [2, 1, 0],
      [3, 0, 0], [3, 1, 1], [0, 0, 2], [1, 1, 0], [2, 0, 1], [3, 1, 2],
    ];
    for (const [vi, yi, ci] of pairwise) {
      const v = VARIANTS[vi];
      const years = yearsets[yi];
      const c = CUR[ci];
      if (!v || !years || !c) throw new Error('pairwise index out of range');
      await p.openImportAllVariantDialog(v.label);
      await p.setImportAllYears(years);
      await p.setImportAllCurrency(c.code);
      expect(await p.isImportAllContinueEnabled(), `${v.label} × ${years.join('+')} × ${c.code}`).toBe(true);
      await p.clickImportAllContinue();
      const upload = await p.getImportDialogInfo();
      expect(upload.text, `${v.label} upload dialog title`).toContain(`${IMP.titlePrefix}${v.label}`);
      expect(upload.hasFileInput).toBe(true);
      await p.closeImportDialog(); // non-committing — no file chosen
    }
  });

  test('TC-CPR-IMA-016: An Equipment file imported into the Labor variant matches no pricebooks (no commit)', { tag: '@C99792' }, async ({ corporatePricingSearchPage: p }) => {
    // Build an Equipment-scoped changed file, then feed it to the LABOR import — the labor server pricebook
    // columns differ, so the diff matches nothing and stages nothing (the app's cross-variant guard).
    const eqFile = await p.buildImportAllSingleCellFixture({ variant: 'All Equipment Pricing', years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook, newValue: RT.testValue });
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API) && req.method() !== 'GET') importFired = true;
    };
    try {
      await p.openImportAllUploadFor('All Labor Pricing', [...RT.years], RT.currency);
      p.page.on('request', onReq);
      const outcome = await p.chooseImportAllFile(eqFile.path);
      p.page.off('request', onReq);
      expect(outcome.kind).toBe('no-match');
      expect(outcome.staged).toEqual([]);
      expect(importFired).toBe(false);
      // The diff-on-choose GET reflects the LABOR precondition (isLabor=true) — proves a non-Equipment
      // variant selection reaches the diff request, not just the Equipment default the other tests use.
      expect(outcome.diffRequestUrl, 'the diff-on-choose request should have fired').not.toBeNull();
      expect(outcome.diffRequestUrl!).toContain('isLabor=true');
      await p.closeImportDialog();
    } finally {
      p.removeTempFixture(eqFile.path);
    }
  });

  test('TC-CPR-IMA-017: Publishing a subset of staged rows commits only the selected rows', { tag: ['@mutation', '@C99793'] }, async ({ corporatePricingSearchPage: p }) => {
    // Stage TWO changed cells in the same pricebook — the target (271) and one untouched neighbour product
    // group — then publish ONLY the target. The neighbour is staged-but-deselected, so it must NOT commit.
    const neighbourId = canaries!.otherRow.productGroupId;
    const neighbourOriginal = canaries!.otherRow.value;
    const multi = await p.buildImportAllMultiCellFixture({
      variant: RT.variant, years: [...RT.years], currency: RT.currency, pricebook: RT.pricebook,
      changes: [
        { productGroupId: RT.productGroupId, newValue: RT.testValue },
        { productGroupId: neighbourId, newValue: '333.33' }, // a distinct sentinel so both cells are real deltas
      ],
    });
    try {
      await p.openImportAllUploadFor(RT.variant, [...RT.years], RT.currency);
      const staged = await p.chooseImportAllFile(multi.path);
      expect(staged.kind).toBe('staged');
      expect(staged.staged).toHaveLength(2); // both changed cells are staged (multi-row staging)
      const publish = await p.publishStagedImport({ onlyProductGroupIds: [RT.productGroupId] });
      expect(publish.success).toBe(true);
      expect(publish.status).toBe(200);
    } finally {
      p.removeTempFixture(multi.path);
    }

    // Read back from a fresh export, then RESTORE both cells BEFORE asserting — so a bug that wrongly
    // committed the deselected neighbour cannot leak a mutation when the assertion throws. Each restore is
    // verified (never trust the publish call on shared server state); the neighbour is NOT covered by the
    // afterEach net (that guards only the target), so its undo is confirmed here or the test fails loudly.
    await p.open();
    const targetAfter = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: RT.productGroupId, pricebook: RT.pricebook });
    const neighbourAfter = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: neighbourId, pricebook: RT.pricebook });
    if (targetAfter !== original) {
      expect(await publishImportAllCell(p, RT.productGroupId, original!), 'restore of the target cell must publish a real commit').toBe(true);
    }
    if (neighbourAfter !== neighbourOriginal) {
      // The deselected neighbour was wrongly committed (a real partial-publish bug) — undo it and CONFIRM.
      expect(await publishImportAllCell(p, neighbourId, neighbourOriginal), 'undo of the wrongly-committed neighbour must publish').toBe(true);
      const neighbourRestored = await p.captureImportAllCellValue({ variant: RT.variant, years: [...RT.years], currency: RT.currency, productGroupId: neighbourId, pricebook: RT.pricebook });
      expect(neighbourRestored, `the neighbour ${neighbourId} must be restored to ${neighbourOriginal} — an unrestored price leaks to the shared server`).toBe(neighbourOriginal);
    }

    expect(targetAfter, 'the selected row was published').toBe(RT.testValue);
    expect(neighbourAfter, `the deselected staged row (${neighbourId}) must NOT be committed — only selected rows publish`).toBe(neighbourOriginal);
  });

  test('TC-CPR-IMA-018: A Labor-variant change stages a delta, then Cancel commits nothing', { tag: '@C99794' }, async ({ corporatePricingSearchPage: p }) => {
    const LABOR = 'All Labor Pricing';
    // Pick a real Labor target live — a product group with a numeric price in a Labor pricebook column (the
    // Labor pricebook population differs from Equipment, so this proves staging on that distinct scope).
    const laborExp = await p.downloadExportVariant(LABOR, [...RT.years], RT.currency);
    const baseCols = CORP_PRICING_TOOLBAR_IO.exportBaseColumns.length;
    const pricebook = laborExp.headers[baseCols]; // the first Labor pricebook column
    expect(pricebook, 'the Labor export must expose at least one pricebook column').toBeTruthy();
    const targetRow = laborExp.rows.slice(1).find((r) => (r[0] ?? '').trim() && /\d/.test((r[baseCols] ?? '').trim()));
    expect(targetRow, 'the Labor export must have a product group with a numeric price to stage').toBeTruthy();
    const productGroupId = (targetRow![0] ?? '').trim();
    const current = (targetRow![baseCols] ?? '').trim();
    const newValue = current === '357.91' ? '111.11' : '357.91'; // guaranteed different from the current value → a real delta

    const changed = await p.buildImportAllSingleCellFixture({ variant: LABOR, years: [...RT.years], currency: RT.currency, productGroupId, pricebook: pricebook!, newValue });
    let importFired = false;
    const onReq = (req: import('@playwright/test').Request): void => {
      if (req.url().includes(CORP_PRICING_IMPORT_ALL_API) && req.method() !== 'GET') importFired = true;
    };
    try {
      await p.openImportAllUploadFor(LABOR, [...RT.years], RT.currency);
      p.page.on('request', onReq);
      const staged = await p.chooseImportAllFile(changed.path);
      expect(staged.kind).toBe('staged');
      expect(staged.staged).toHaveLength(1);
      expect(staged.staged[0]?.productGroupId).toBe(productGroupId);
      expect(staged.staged[0]?.pricebook).toBe(pricebook);
      expect(staged.staged[0]?.newPrice).toBe(newValue);
      // Cancel WITHOUT publishing — non-committing, so no Labor pricebook is ever mutated.
      expect(await p.cancelPublishModal()).toBe(true);
      p.page.off('request', onReq);
      expect(importFired).toBe(false); // nothing committed
    } finally {
      p.page.off('request', onReq);
      p.removeTempFixture(changed.path);
    }
  });
});
