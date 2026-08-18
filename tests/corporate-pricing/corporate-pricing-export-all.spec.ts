import { test, expect } from '../../src/fixtures/pages.fixture';
import { CORP_PRICING_TOOLBAR_IO } from '../../src/data/corporate-pricing/toolbar-io';
const VARIANTS = CORP_PRICING_TOOLBAR_IO.variants;
const EXP = CORP_PRICING_TOOLBAR_IO.exportDialog;
const CUR = CORP_PRICING_TOOLBAR_IO.currencies;
/**
 * Assert a downloaded export matrix is structurally well-formed, not merely present. The row directly
 * after the header is the currency row — its two base columns are blank and every pricebook column
 * carries the export's chosen currency; and every product-group row is exactly as wide as the header.
 * Without this, a ragged CSV or one whose currency row carries the wrong code would still pass a test
 * that only checked the base columns and the row count.
 */
function expectWellFormedExportMatrix(
  r: { headers: string[]; rows: string[][] },
  currencyCode: string,
): void {
  const baseCols = CORP_PRICING_TOOLBAR_IO.exportBaseColumns.length;
  expect(r.rows.length).toBeGreaterThan(0); // at least the currency row is present
  const currencyRow = r.rows[0]!;
  expect(currencyRow).toHaveLength(r.headers.length); // the currency row is exactly as wide as the header
  expect(currencyRow.slice(0, baseCols).map((c) => c.trim()))
    .toEqual(new Array(baseCols).fill('')); // the base columns are blank on the currency row
  const pricebookCurrencies = currencyRow.slice(baseCols).map((c) => c.trim());
  expect(pricebookCurrencies)
    .toEqual(new Array(pricebookCurrencies.length).fill(currencyCode)); // every pricebook column carries the chosen currency
  for (const row of r.rows.slice(1)) {
    expect(row).toHaveLength(r.headers.length); // no ragged / malformed product-group row
  }
}
test.describe('Corporate Pricing — Export ▾ dialog contract (NM-2264) @corporate-pricing @export-all', () => {
  test.beforeEach(async ({ corporatePricingSearchPage: p }) => {
    test.setTimeout(90_000);
    await p.open();
  });

  test('TC-CPR-EXA-001: Each Export variant opens the shared "Export" Year(s)+Currency dialog', async ({ corporatePricingSearchPage: p }) => {
    for (const v of VARIANTS) {
      await p.openExportVariantDialog(v.label);
      const info = await p.getExportDialogInfo();
      expect(info.text).toContain(EXP.title);
      expect(info.text.toLowerCase()).toContain('year');
      expect(info.text.toLowerCase()).toContain('currency');
      expect(info.buttons).toEqual(expect.arrayContaining(['Cancel', 'Continue', 'Close']));
      expect(info.continueDisabled).toBe(true); // disabled before any field is set
      expect(await p.closeExportDialog()).toBe(true);
    }
  });

  test('TC-CPR-EXA-002: Continue stays disabled with only Year(s) set', async ({ corporatePricingSearchPage: p }) => {
    await p.openExportVariantDialog('All Equipment Pricing');
    await p.setExportYears([EXP.defaultYear]);
    expect(await p.isExportContinueEnabled()).toBe(false); // Currency still required
  });

  test('TC-CPR-EXA-003: Continue stays disabled with only Currency set', async ({ corporatePricingSearchPage: p }) => {
    await p.openExportVariantDialog('All Equipment Pricing');
    await p.setExportCurrency('USD');
    expect(await p.isExportContinueEnabled()).toBe(false); // Year(s) still required
  });

  test('TC-CPR-EXA-004: Continue enables when BOTH Year(s) and Currency are set', async ({ corporatePricingSearchPage: p }) => {
    await p.openExportVariantDialog('All Equipment Pricing');
    await p.setExportYears([EXP.defaultYear]);
    await p.setExportCurrency('USD');
    expect(await p.isExportContinueEnabled()).toBe(true);
  });

  test('TC-CPR-EXA-005: Cancel dismisses the dialog without firing any export request', async ({ corporatePricingSearchPage: p }) => {
    const { requestFired, closed } = await p.cancelExportAndCheckNoRequest('All Equipment Pricing', [EXP.defaultYear], 'USD');
    expect(requestFired).toBe(false); // no pricing-export request on Cancel
    expect(closed).toBe(true);
  });

  test('TC-CPR-EXA-006: Year(s) minimum — a single year is accepted and enables Continue', async ({ corporatePricingSearchPage: p }) => {
    await p.openExportVariantDialog('All Equipment Pricing');
    await p.setExportYears([EXP.defaultYear]); // exactly 1 year (the minimum)
    expect(await p.getExportSelectedYears()).toEqual([EXP.defaultYear]);
    await p.setExportCurrency('USD');
    expect(await p.isExportContinueEnabled()).toBe(true);
  });

  test('TC-CPR-EXA-007: Year(s) maximum is 3 — a 4th year cannot be added and no 4-year export fires', async ({ corporatePricingSearchPage: p }) => {
    await p.openExportVariantDialog('All Equipment Pricing');
    await p.setExportYears(['2026', '2027', '2028']);
    expect(await p.getExportSelectedYears()).toEqual(['2026', '2027', '2028']);
    const afterFourth = await p.attemptExtraExportYear('2025'); // attempt a 4th
    expect(afterFourth).toEqual(['2026', '2027', '2028']); // stays at 3 — the 4th is refused
    await p.setExportCurrency('USD');
    const { url, status } = await p.continueExportAndCaptureRequest();
    expect(status).toBe(200);
    const yearsParams = new URL(url).searchParams.getAll('years'); // years are sent as repeated params
    // the exact 3 chosen years round-trip (sorted — the URL order is not guaranteed), never the refused 4th
    expect([...yearsParams].sort()).toEqual(['2026', '2027', '2028']);
  });

  test('TC-CPR-EXA-008: Currency options present — USD, CAD, MXN', async ({ corporatePricingSearchPage: p }) => {
    await p.openExportVariantDialog('All Equipment Pricing');
    const options = await p.getExportCurrencyOptions();
    for (const c of CUR) expect(options).toContain(c.code);
  });

  test('TC-CPR-EXA-009: Each Currency maps to the correct currencyId on Continue', async ({ corporatePricingSearchPage: p }) => {
    for (const c of CUR) {
      await p.openExportVariantDialog('All Equipment Pricing');
      await p.setExportYears([EXP.defaultYear]);
      await p.setExportCurrency(c.code);
      const { url, status } = await p.continueExportAndCaptureRequest();
      expect(status).toBe(200);
      expect(url).toContain(`currencyId=${c.currencyId}`); // USD=1, CAD=2, MXN=3 (live-captured)
    }
  });

  // The Export ▾ menu itself dismisses on an outside-click (standard dropdown behavior); the
  // per-variant dialog contract above covers what each variant opens.
  test('TC-CPR-EXA-017: Export menu dismisses on outside-click', async ({ corporatePricingSearchPage: p }) => {
    await p.openExportMenu();
    expect((await p.getMenuVariants()).length).toBeGreaterThan(0); // menu confirmed open
    expect(await p.dismissToolbarMenuWithOutsideClick()).toBe(true); // closes on outside-click
  });
});

test.describe('Corporate Pricing — Export ▾ real download round-trip (NM-2264) @corporate-pricing @export-all', () => {
  const YEAR = EXP.defaultYear;

  test.beforeEach(async ({ corporatePricingSearchPage: p }) => {
    test.setTimeout(150_000); // several real downloads + file reads per test
    await p.open();
  });

  test('TC-CPR-EXA-010: All Equipment Pricing — real download + no duplicate product groups', async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadExportVariant('All Equipment Pricing', [YEAR], 'USD');
    expect(r.filename, 'The export should download the Equipment Pricing file').toBe('EquipmentPricings.csv');
    expect(r.status).toBe(200);
    expect(r.requestUrl).toContain('isLabor=false');
    expect(r.requestUrl).toContain('isMaxDiscount=false');
    // the download's own request carries the full gate — currency, the chosen year, and the locale
    expect(r.requestUrl).toContain('currencyId=1'); // USD
    expect(new URL(r.requestUrl).searchParams.getAll('years')).toEqual([YEAR]);
    expect(r.requestUrl).toContain(CORP_PRICING_TOOLBAR_IO.exportLocaleParam); // locale=en-US
    expect(r.headers.slice(0, 2)).toEqual([...CORP_PRICING_TOOLBAR_IO.exportBaseColumns]); // matrix base columns
    expectWellFormedExportMatrix(r, 'USD'); // currency row values + every row as wide as the header
    const ids = p.exportProductGroupIds(r);
    expect(ids.length).toBeGreaterThan(0); // product-group rows present
    expect(new Set(ids).size).toBe(ids.length); // NM-1997/1998: every Product Group Id unique
  });

  test('TC-CPR-EXA-011: All Labor Pricing — real download + no duplicate product groups', async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadExportVariant('All Labor Pricing', [YEAR], 'USD');
    expect(r.filename).toBe('LaborPricings.csv');
    expect(r.status).toBe(200);
    expect(r.requestUrl).toContain('isLabor=true');
    expect(r.requestUrl).toContain('isMaxDiscount=false');
    expect(r.requestUrl).toContain('currencyId=1'); // USD
    expect(new URL(r.requestUrl).searchParams.getAll('years')).toEqual([YEAR]);
    expect(r.requestUrl).toContain(CORP_PRICING_TOOLBAR_IO.exportLocaleParam); // locale=en-US
    expect(r.headers.slice(0, 2)).toEqual([...CORP_PRICING_TOOLBAR_IO.exportBaseColumns]);
    expectWellFormedExportMatrix(r, 'USD');
    const ids = p.exportProductGroupIds(r);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length); // NM-1998
  });

  test('TC-CPR-EXA-012: All Equipment Max Discount — round-trip + NM-2005 (pricebooks present, zero labor rows)', async ({ corporatePricingSearchPage: p }) => {
    // Oracles derived LIVE from the companion exports (same currency, same year).
    const eqPricing = await p.downloadExportVariant('All Equipment Pricing', [YEAR], 'USD');
    const activePricebooks = p.exportPricebookColumns(eqPricing.headers); // active pricebook set = its columns
    const laborPricing = await p.downloadExportVariant('All Labor Pricing', [YEAR], 'USD');
    const laborPgIds = new Set(p.exportProductGroupIds(laborPricing)); // labor product-group set

    const r = await p.downloadExportVariant('All Equipment Max Discount', [YEAR], 'USD');
    expect(r.filename).toBe('EquipmentMaxDiscounts.csv');
    expect(r.status).toBe(200);
    expect(r.requestUrl).toContain('isLabor=false');
    expect(r.requestUrl).toContain('isMaxDiscount=true');
    expect(r.requestUrl).toContain('currencyId=1'); // USD
    expect(new URL(r.requestUrl).searchParams.getAll('years')).toEqual([YEAR]);
    expect(r.requestUrl).toContain(CORP_PRICING_TOOLBAR_IO.exportLocaleParam); // locale=en-US
    expectWellFormedExportMatrix(r, 'USD');
    const ids = p.exportProductGroupIds(r);
    expect(new Set(ids).size).toBe(ids.length); // unique product groups

    // NM-2005 (a): every active pricebook (a sibling-Pricing column) is present on the max-discount export.
    const maxCols = new Set(p.exportPricebookColumns(r.headers));
    const missingPricebooks = activePricebooks.filter((c) => !maxCols.has(c));
    expect(missingPricebooks).toEqual([]);

    // NM-2005 (b): zero rows on the equipment-scoped export carry a labor product group.
    const strayLaborRows = ids.filter((id) => laborPgIds.has(id));
    expect(strayLaborRows).toEqual([]);
  });

  test('TC-CPR-EXA-013: All Labor Max Discount — round-trip + labor pricebook completeness', async ({ corporatePricingSearchPage: p }) => {
    const laborPricing = await p.downloadExportVariant('All Labor Pricing', [YEAR], 'USD');
    const laborPricebooks = p.exportPricebookColumns(laborPricing.headers);

    const r = await p.downloadExportVariant('All Labor Max Discount', [YEAR], 'USD');
    expect(r.filename).toBe('LaborMaxDiscounts.csv');
    expect(r.status).toBe(200);
    expect(r.requestUrl).toContain('isLabor=true');
    expect(r.requestUrl).toContain('isMaxDiscount=true');
    expect(r.requestUrl).toContain('currencyId=1'); // USD
    expect(new URL(r.requestUrl).searchParams.getAll('years')).toEqual([YEAR]);
    expect(r.requestUrl).toContain(CORP_PRICING_TOOLBAR_IO.exportLocaleParam); // locale=en-US
    expectWellFormedExportMatrix(r, 'USD');
    const ids = p.exportProductGroupIds(r);
    expect(new Set(ids).size).toBe(ids.length); // unique product groups

    // NM-2005 applied to the labor scope: every active labor pricebook is present on the labor max-discount export.
    const maxCols = new Set(p.exportPricebookColumns(r.headers));
    const missingPricebooks = laborPricebooks.filter((c) => !maxCols.has(c));
    expect(missingPricebooks).toEqual([]);
  });
});

test.describe('Corporate Pricing — Export ▾ surface-behavior DEEP (NM-2264) @corporate-pricing @export-all', () => {
  const YEAR = EXP.defaultYear;
  const YEARSETS: string[][] = [[YEAR], ['2026', '2027', '2028']]; // 1-year and 3-year selections

  test.beforeEach(async ({ corporatePricingSearchPage: p }) => {
    test.setTimeout(200_000); // multiple downloads / continues per test
    await p.open();
  });

  test('TC-CPR-EXA-014: Combination DEEP — bounded pairwise variant x Year x Currency', async ({ corporatePricingSearchPage: p }) => {
    // A bounded pairwise covering array over {4 variants} x {1yr, 3yr} x {USD, CAD, MXN} — NOT the full
    // cartesian product. Indices are [variantIndex, yearsetIndex, currencyIndex]; every pair of factor
    // levels appears at least once across these rows.
    const pairwise: Array<[number, number, number]> = [
      [0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 2], [2, 0, 2], [2, 1, 0],
      [3, 0, 0], [3, 1, 1], [0, 0, 2], [1, 1, 0], [2, 0, 1], [3, 1, 2],
    ];
    for (const [vi, yi, ci] of pairwise) {
      const v = VARIANTS[vi];
      const years = YEARSETS[yi];
      const c = CUR[ci];
      if (!v || !years || !c) throw new Error('pairwise index out of range');
      await p.openExportVariantDialog(v.label);
      await p.setExportYears(years);
      await p.setExportCurrency(c.code);
      const { url, status } = await p.continueExportAndCaptureRequest();
      expect(status, `${v.label} x ${years.join('+')} x ${c.code}`).toBe(200);
      expect(url).toContain(`isLabor=${v.isLabor}`);
      expect(url).toContain(`isMaxDiscount=${v.isMaxDiscount}`);
      expect(url).toContain(`currencyId=${c.currencyId}`);
      const yearsParams = new URL(url).searchParams.getAll('years'); // years are sent as repeated params
      expect([...yearsParams].sort()).toEqual([...years].sort()); // the exact chosen years round-trip, not just the count
    }
  });

  test('TC-CPR-EXA-015: Result-fidelity DEEP — each variant\'s file reflects its scope', async ({ corporatePricingSearchPage: p }) => {
    const eqP = await p.downloadExportVariant('All Equipment Pricing', [YEAR], 'USD');
    const laborP = await p.downloadExportVariant('All Labor Pricing', [YEAR], 'USD');
    const eqMax = await p.downloadExportVariant('All Equipment Max Discount', [YEAR], 'USD');

    // Equipment vs Labor are genuinely different scopes: disjoint product-group populations...
    const eqIds = new Set(p.exportProductGroupIds(eqP));
    const overlap = p.exportProductGroupIds(laborP).filter((id) => eqIds.has(id));
    expect(overlap).toEqual([]);
    // ...and different pricebook columns.
    expect(p.exportPricebookColumns(eqP.headers)).not.toEqual(p.exportPricebookColumns(laborP.headers));

    // Pricing vs Max Discount (same equipment scope) share the column structure — the dispositive
    // difference is the request param, not the columns (do not assert a false structural difference).
    expect(p.exportPricebookColumns(eqMax.headers)).toEqual(p.exportPricebookColumns(eqP.headers));
    expect(eqP.requestUrl).toContain('isMaxDiscount=false');
    expect(eqMax.requestUrl).toContain('isMaxDiscount=true');
  });

  test('TC-CPR-EXA-016: Empty/minimal-scope DEEP — a currency with no pricebooks yields a valid CSV', async ({ corporatePricingSearchPage: p }) => {
    const cad = await p.downloadExportVariant('All Equipment Pricing', [YEAR], 'CAD'); // live empty-scope oracle
    const usd = await p.downloadExportVariant('All Equipment Pricing', [YEAR], 'USD');
    expect(cad.status).toBe(200);
    expect(cad.content.length).toBeGreaterThan(0); // a real, non-empty file (not zero-byte)
    expect(cad.headers.slice(0, 2)).toEqual([...CORP_PRICING_TOOLBAR_IO.exportBaseColumns]); // base columns present
    // Positive control: the same extractor yields many pricebook columns for USD — so a 0 for CAD is a
    // real empty scope, not a reader that silently returns nothing for every currency.
    expect(p.exportPricebookColumns(usd.headers).length).toBeGreaterThan(0);
    // CAD Equipment carries no pricebooks: the export is a valid, non-empty CSV whose pricebook-column
    // scope is exactly empty (live-confirmed: CAD = 0, USD = 79).
    expect(p.exportPricebookColumns(cad.headers).length).toBe(0);
  });
});
