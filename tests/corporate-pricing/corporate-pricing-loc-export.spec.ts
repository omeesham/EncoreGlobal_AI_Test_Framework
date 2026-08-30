import { test, expect } from '../../src/fixtures/pages.fixture';
import { CORP_PRICING_TOOLBAR_IO } from '../../src/data/corporate-pricing/toolbar-io';
const LOC = CORP_PRICING_TOOLBAR_IO.locExport;

test.describe('Corporate Pricing — Loc Pricing Export file round-trip (NM-2262) @corporate-pricing @loc-pricing-export', () => {
  test.beforeEach(async ({ corporatePricingSearchPage: p }) => {
    test.setTimeout(60_000); // fresh grid load + network round-trip + read from the temp download path
    await p.open();
  });

  test('TC-CPR-LEX-001: Loc Pricing Export downloads a real CSV file with the expected timestamped filename', { tag: '@C99758' }, async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadLocPricingExport();
    expect(r.filename).toMatch(LOC.filenamePattern); // LocationPricebooks_<YYYYMMDD>_<HHMMSS>UTC.csv
  });

  test('TC-CPR-LEX-002: Downloaded Loc Pricing Export file is non-empty and parseable as CSV', { tag: '@C99759' }, async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadLocPricingExport();
    expect(r.content.length, 'The exported file should not be empty').toBeGreaterThan(0);
    expect(r.content).toContain(','); // the file is actually comma-delimited, not a single garbage token
    expect(r.headers.length, 'The exported file should contain a parsed header row').toBeGreaterThan(0); // a header row parsed out
  });

  test('TC-CPR-LEX-003: Downloaded CSV carries the expected header columns and at least one data row', { tag: '@C99760' }, async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadLocPricingExport();
    expect(r.headers).toEqual(LOC.expectedHeaders); // exact column set + order (the file is the oracle)
    expect(r.rowCount).toBeGreaterThan(0); // location pricebook data is present
  });

  test('TC-CPR-LEX-004: The Loc Pricing Export download request carries the locale param', { tag: '@C99761' }, async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadLocPricingExport();
    expect(r.requestUrl).toContain('location-export');
    expect(r.requestUrl).toContain(CORP_PRICING_TOOLBAR_IO.exportLocaleParam); // locale=en-US on the download's own request
  });

  test('TC-CPR-LEX-005: A second consecutive Loc Pricing Export fires a fresh download', { tag: '@C99762' }, async ({ corporatePricingSearchPage: p }) => {
    const r1 = await p.downloadLocPricingExport();
    const r2 = await p.downloadLocPricingExport(); // no re-open between: proves a fresh download on re-click
    expect(r1.filename).toMatch(LOC.filenamePattern);
    expect(r2.filename).toMatch(LOC.filenamePattern);
    expect(r2.content.length).toBeGreaterThan(0);
  });

  test('TC-CPR-LEX-006: Every downloaded CSV row is well-formed with a valid currency, 0/1 flags, and a consistent date-window', { tag: '@C99763' }, async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadLocPricingExport();
    const locationIdx = r.headers.indexOf('LocationNo');
    const currencyIdx = r.headers.indexOf(LOC.currencyColumn);
    const boolIdxs = LOC.booleanColumns.map((c) => r.headers.indexOf(c));
    const useDateIdx = r.headers.indexOf(LOC.useDateColumn);
    const dateWindowIdxs = LOC.dateWindowColumns.map((c) => r.headers.indexOf(c)); // [StartDate, EndDate]
    const validCurrencies: readonly string[] = LOC.validCurrencies; // widen the const tuple so .includes accepts any string
    expect(locationIdx).toBeGreaterThanOrEqual(0);
    expect(currencyIdx).toBeGreaterThanOrEqual(0);
    expect(boolIdxs).not.toContain(-1); // all format-checked columns present in the header row
    expect(useDateIdx).toBeGreaterThanOrEqual(0);
    expect(dateWindowIdxs).not.toContain(-1);
    expect(r.rows.length).toBeGreaterThan(0);
    // Validate EVERY row in plain JS (a per-row expect() over ~38k rows is too slow), then assert the
    // aggregate: a malformed row anywhere in the file collects here and fails with the first offenders shown.
    const offenders: string[] = [];
    for (const [i, row] of r.rows.entries()) {
      if (offenders.length >= 10) break; // enough detail to diagnose; the assertion still fails on the first offender
      if (row.length !== r.headers.length) { offenders.push(`row ${i}: ${row.length} cols (expected ${r.headers.length})`); continue; }
      if (!/^\d+$/.test(row[locationIdx] ?? '')) { offenders.push(`row ${i}: LocationNo "${row[locationIdx] ?? ''}"`); continue; }
      if (!validCurrencies.includes(row[currencyIdx] ?? '')) { offenders.push(`row ${i}: currency "${row[currencyIdx] ?? ''}"`); continue; }
      const badFlag = boolIdxs.find((bi) => { const v = row[bi]; return v !== '0' && v !== '1'; });
      if (badFlag !== undefined) { offenders.push(`row ${i}: flag col ${badFlag} = "${row[badFlag] ?? ''}"`); continue; }
      const useDate = row[useDateIdx] ?? '';
      if (useDate !== '0' && useDate !== '1') { offenders.push(`row ${i}: UseDate "${useDate}"`); continue; }
      // Cross-field window invariant: the date-window columns are empty when the window flag is off,
      // and populated when it's on — the exact date-string format has no populated sample to check yet.
      const windowValues = dateWindowIdxs.map((di) => row[di] ?? '');
      const windowAllEmpty = windowValues.every((v) => v === '');
      const windowAllPopulated = windowValues.every((v) => v !== '');
      if (useDate === '0' && !windowAllEmpty) { offenders.push(`row ${i}: UseDate=0 but date window not empty (${windowValues.join(', ')})`); continue; }
      if (useDate === '1' && !windowAllPopulated) { offenders.push(`row ${i}: UseDate=1 but date window incomplete (${windowValues.join(', ')})`); continue; }
    }
    expect(offenders).toEqual([]); // every row: full column set, numeric LocationNo, supported currency, 0/1 flags, consistent date-window
  });

  // Skipped as data-blocked: the export is tenant-wide, not office-scoped, so an empty result needs a tenant
  // with zero location pricebooks anywhere — none exists on the shared e2e server.
  test.skip('TC-CPR-LEX-007: Empty-dataset Loc Pricing Export yields a header-only valid CSV', { tag: '@C99764' }, async ({ corporatePricingSearchPage: p }) => {
    const r = await p.downloadLocPricingExport();
    expect(r.headers).toEqual(LOC.expectedHeaders);
    expect(r.rowCount).toBe(0);
  });
});
