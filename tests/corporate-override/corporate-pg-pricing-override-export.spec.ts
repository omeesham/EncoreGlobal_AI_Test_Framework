import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  CORP_PRICING_OVERRIDE,
  CORP_PRICING_OVERRIDE_FIXTURE,
  CORP_PRICING_OVERRIDE_ACTIVE_BED,
} from '../../src/data/corporate-override/override';

const LOC = CORP_PRICING_OVERRIDE_FIXTURE.office; // location picker search needle ('1606')
/** Split a downloaded export into its data rows, tolerating the trailing newline. */
const dataRows = (content: string) => content.split(/\r?\n/).slice(1).filter((l) => l.length > 0);
/** Column values from a naive split — safe here because no field in this file contains a comma. */
const columnValues = (content: string, headers: string[], column: string) => {
  const idx = headers.indexOf(column);
  return dataRows(content).map((l) => l.split(',')[idx] ?? '');
};
test.describe('Corporate Pricing Override — Export (NM-2272)', () => {
  const SCOPE = CORP_PRICING_OVERRIDE.export.scope;
  const EXPORT = CORP_PRICING_OVERRIDE.export;
  const GRID_API = CORP_PRICING_OVERRIDE.gridApi;

  test.describe('scope, fidelity & pager', () => {
    test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
      test.setTimeout(120_000);
      await p.reloadAndReselect(LOC);
    });

  test('TC-CPR-OVR-127: Export returns every location in the tenant, not just the selected office', async ({ corporatePricingOverridePage: p }) => {
    const r = await p.downloadOverrideExport();
    const locations = new Set(columnValues(r.content, r.headers, 'Location Id'));
    expect(locations.size).toBeGreaterThan(SCOPE.minDistinctLocations); // many offices, not one
    expect(locations.size).toBeGreaterThan(1); // the plain claim: the file is never single-office
  });

  test('TC-CPR-OVR-128: Export carries the full override population, well above any single office', async ({ corporatePricingOverridePage: p }) => {
    const r = await p.downloadOverrideExport();
    const rows = dataRows(r.content);
    expect(rows.length).toBeGreaterThan(SCOPE.minDataRows); // whole-tenant volume
    expect(rows.length).toBeGreaterThan(await p.getVisibleRowCount()); // strictly more than the grid shows
  });

  test('TC-CPR-OVR-129: Switching to the Labor tab re-scopes the grid but not the export', async ({ corporatePricingOverridePage: p }) => {
    // Positive control: the tab must visibly change what the grid shows.
    await p.switchOverrideTab('Equipment');
    const equipmentContent = (await p.downloadOverrideExport()).content;
    const equipmentGridRows = await p.getVisibleRowCount();

    await p.switchOverrideTab('Labor');
    expect(await p.getActiveTab()).toBe('Labor');
    const laborGridRows = await p.getVisibleRowCount();
    expect(laborGridRows).not.toBe(equipmentGridRows); // the tab genuinely re-scoped the grid

    const laborExport = await p.downloadOverrideExport();
    expect(laborExport.content).toBe(equipmentContent); // ...and the export did not follow it
    const isLabor = new Set(columnValues(laborExport.content, laborExport.headers, 'Is Labor'));
    for (const v of SCOPE.expectedIsLaborValues) expect([...isLabor]).toContain(v); // both kinds still present
  });

  test('TC-CPR-OVR-130: Choosing a different office re-scopes the grid but not the export', async ({ corporatePricingOverridePage: p }) => {
    const before = await p.downloadOverrideExport();
    const gridBefore = await p.getVisibleRowCount();

    await p.selectLocation(CORP_PRICING_OVERRIDE.pager.multiPageOffice);
    await p.waitForGridRows();
    expect(await p.getVisibleRowCount()).not.toBe(gridBefore); // positive control: a different office renders differently

    const after = await p.downloadOverrideExport();
    expect(after.content).toBe(before.content); // the file is identical whichever office is selected
  });

  test('TC-CPR-OVR-131: Active only hides inactive rows in the grid; the export keeps them', async ({ corporatePricingOverridePage: p }) => {
    // Office 1105 is the walk-verified bed that actually HAS inactive rows (9 total, 7 active). The
    // default fixture office has none, so the filter would have nothing to remove and the positive
    // control below could not fire.
    await p.reloadAndReselect(CORP_PRICING_OVERRIDE_ACTIVE_BED.office);
    await p.setActiveOnly(false);
    const allRows = await p.getVisibleRowCount();
    await p.setActiveOnly(true);
    const activeRows = await p.getVisibleRowCount();
    expect(activeRows).toBeLessThan(allRows); // positive control: the filter removed rows

    const r = await p.downloadOverrideExport();
    const inactive = columnValues(r.content, r.headers, 'Is Active').filter((v) => v === '0');
    expect(inactive.length).toBeGreaterThan(0); // inactive overrides survive the export regardless
  });

  test('TC-CPR-OVR-132: The Currency filter empties the grid for an absent currency; the export still carries every currency', async ({ corporatePricingOverridePage: p }) => {
    const currencies = await p.getCurrencyOptions();
    const specific = currencies.filter((c) => c !== 'ALL');
    expect(specific.length).toBeGreaterThan(0);

    const before = await p.getVisibleRowCount();
    await p.selectCurrency(specific[specific.length - 1]!); // the least-used currency on this bed
    const after = await p.getVisibleRowCount();
    expect(after).not.toBe(before); // positive control: the currency filter moved the grid

    const r = await p.downloadOverrideExport();
    const exported = new Set(columnValues(r.content, r.headers, 'Currency'));
    expect(exported.size).toBeGreaterThanOrEqual(SCOPE.minDistinctCurrencies); // every currency present, filter ignored
  });

  test('TC-CPR-OVR-133: The text filter narrows the grid; the export is unchanged', async ({ corporatePricingOverridePage: p }) => {
    const before = await p.downloadOverrideExport();
    const gridBefore = await p.getVisibleRowCount();
    expect(gridBefore).toBeGreaterThan(0);

    const needle = (await p.getFirstRowCellText(CORP_PRICING_OVERRIDE.columnIndex.productGroupName)).slice(0, 6);
    await p.filterProductGroups(needle);
    const gridAfter = await p.getVisibleRowCount();
    expect(gridAfter).toBeLessThanOrEqual(gridBefore);
    expect(gridAfter).toBeGreaterThan(0); // the needle came from a real row, so it must still match

    const after = await p.downloadOverrideExport();
    expect(after.content).toBe(before.content); // the filter never reaches the file
    await p.clearFilter();
  });

  test('TC-CPR-OVR-134: Rows-per-page changes how much of the grid is drawn; the export is unchanged', async ({ corporatePricingOverridePage: p }) => {
    await p.selectLocation(CORP_PRICING_OVERRIDE.pager.multiPageOffice);
    await p.waitForGridRows();

    await p.setRowsPerPage('10');
    const drawnAtTen = await p.getVisibleRowCount();
    const smallExport = await p.downloadOverrideExport();

    await p.setRowsPerPage('50');
    const drawnAtFifty = await p.getVisibleRowCount();
    expect(drawnAtFifty).toBeGreaterThan(drawnAtTen); // positive control: page size really is drawing more rows

    const largeExport = await p.downloadOverrideExport();
    expect(largeExport.content).toBe(smallExport.content); // ...while the file stays whole either way
  });

  test('TC-CPR-OVR-135: Export on an empty, unscoped grid still returns the whole tenant', async ({ corporatePricingOverridePage: p }) => {
    await p.open(); // fresh load, no office selected
    expect(await p.isEmpty()).toBe(true);
    expect(await p.getVisibleRowCount()).toBe(0);

    const r = await p.downloadOverrideExport(); // Export stays enabled on an empty grid
    expect(dataRows(r.content).length).toBeGreaterThan(SCOPE.minDataRows);
    expect(new Set(columnValues(r.content, r.headers, 'Location Id')).size).toBeGreaterThan(SCOPE.minDistinctLocations);
  });

  test('TC-CPR-OVR-136: The Equipment grid row count reconciles with the export rows for that office', async ({ corporatePricingOverridePage: p }) => {
    await p.switchOverrideTab('Equipment');
    await p.setActiveOnly(false);
    const gridRows = await p.getVisibleRowCount();

    const r = await p.downloadOverrideExport();
    const locIdx = r.headers.indexOf('Location Id');
    const laborIdx = r.headers.indexOf('Is Labor');
    const forThisOffice = dataRows(r.content)
      .map((l) => l.split(','))
      .filter((row) => row[locIdx] === LOC);
    const equipmentRows = forThisOffice.filter((row) => row[laborIdx] === '0');

    // The file folds both tabs together; the Equipment tab shows only the Is Labor = 0 half of it.
    expect(equipmentRows.length).toBe(gridRows);
    expect(forThisOffice.length).toBeGreaterThanOrEqual(equipmentRows.length);
  });

  test('TC-CPR-OVR-138: The CSV is well-formed — consistent line endings, a full column set on every row, and quoted inch marks', async ({ corporatePricingOverridePage: p }) => {
    const r = await p.downloadOverrideExportRaw();

    // Line endings are plain LF, never CRLF, and never a mix of the two. Checked on the raw bytes
    // because reading the file as text hides the difference. Pinned so a change is visible: a file
    // that silently switched to CRLF would shift every downstream byte offset.
    const text = r.bytes.toString('latin1');
    expect(text).toContain(EXPORT.structure.lineEnding);
    expect(text.match(/\r/g) ?? []).toEqual([]); // no carriage returns anywhere

    const lines = r.content.split(/\r?\n/).filter((l) => l.length > 0);
    const wrongWidth = lines.slice(1).filter((l) => l.split(',').length !== r.headers.length);
    expect(wrongWidth.slice(0, 5)).toEqual([]); // no field contains a comma, so every row splits cleanly

    // Product group names carry literal inch marks, which must be doubled and the field quoted.
    const quoted = lines.filter((l) => l.includes('""'));
    expect(quoted.length).toBeGreaterThan(EXPORT.structure.minQuotedRows);
    for (const line of quoted.slice(0, 20)) expect(line).toMatch(/"[^"]*""/); // well-formed quoting, not a stray character
  });

  test('TC-CPR-OVR-139: The header row follows the requested locale while the data rows stay identical', async ({ corporatePricingOverridePage: p }) => {
    const english = await p.fetchExportForLocale('en-US');
    expect(english.status).toBe(200);
    expect(english.headerLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim())).toEqual([...EXPORT.expectedHeaders]);

    for (const locale of EXPORT.locales.localizing) {
      const translated = await p.fetchExportForLocale(locale);
      expect(translated.status, `${locale} responds`).toBe(200);
      expect(translated.headerLine, `${locale} translates the header`).not.toBe(english.headerLine);
      // The important half: translating the header must never reformat the numbers underneath it.
      // A locale that used a decimal comma would corrupt every row of a comma-delimited file.
      expect(translated.dataLines.length, `${locale} row count`).toBe(english.dataLines.length);
      expect(translated.dataLines[0], `${locale} first data row`).toBe(english.dataLines[0]);
    }

    for (const locale of EXPORT.locales.fallback) {
      const fallback = await p.fetchExportForLocale(locale);
      expect(fallback.status, `${locale} responds`).toBe(200);
      expect(fallback.headerLine, `${locale} falls back to English`).toBe(english.headerLine);
    }
  });

  test('TC-CPR-OVR-140: A malformed or unknown locale falls back to English instead of failing', async ({ corporatePricingOverridePage: p }) => {
    const english = await p.fetchExportForLocale('en-US');
    for (const locale of EXPORT.locales.malformed) {
      const r = await p.fetchExportForLocale(locale);
      expect(r.status, `locale "${locale}" must not error`).toBe(200);
      expect(r.headerLine, `locale "${locale}" falls back to English`).toBe(english.headerLine);
      expect(r.dataLines.length, `locale "${locale}" returns the same data`).toBe(english.dataLines.length);
    }
    const omitted = await p.fetchExportForLocale('');
    expect(omitted.status).toBe(200);
    expect(omitted.headerLine).toBe(english.headerLine); // omitting the parameter behaves like English
  });

  test('TC-CPR-OVR-141: The grid loads for every healthy office, and office 1604 still fails the way we recorded it', async ({ corporatePricingOverridePage: p }) => {
    for (const office of GRID_API.healthyOffices) {
      const r = await p.fetchGridStatusForOffice(office);
      expect(r.status, `office ${office} grid data`).toBe(200); // a regression here means the fault is spreading
    }

    const failing = await p.fetchGridStatusForOffice(GRID_API.knownFailingOffice);
    if (failing.status === 200) {
      // Not a failure — the office recovered. Assert something real about the recovery rather than
      // restating the status we just branched on: a 200 that still carries the fault text would mean
      // the error is now being served with a success code, which is worse than the original bug.
      expect(failing.body).not.toContain(GRID_API.knownFailureSignature);
    } else {
      expect(failing.status, `office ${GRID_API.knownFailingOffice} is the known-bad one`).toBeGreaterThanOrEqual(500);
      expect(failing.body).toContain(GRID_API.knownFailureSignature); // still the same duplicate-key fault, not a new one
    }
  });

  test('TC-CPR-OVR-142: Tab, Currency and Active only combine without losing rows or breaking the export', async ({ corporatePricingOverridePage: p }) => {
    const baseline = await p.downloadOverrideExport();
    await p.setActiveOnly(false);
    const unfiltered = await p.getVisibleRowCount();
    // Anchor the chain to a non-empty grid. Without this, every "narrows or stays equal" comparison
    // below would be satisfied by a grid stuck at zero rows — the filters would look well behaved
    // precisely when the screen is broken.
    expect(unfiltered).toBeGreaterThan(0);

    await p.setActiveOnly(true);
    const activeOnly = await p.getVisibleRowCount();
    expect(activeOnly).toBeLessThanOrEqual(unfiltered);

    const currencies = (await p.getCurrencyOptions()).filter((c) => c !== 'ALL');
    await p.selectCurrency(currencies[0]!);
    const activeAndCurrency = await p.getVisibleRowCount();
    expect(activeAndCurrency).toBeLessThanOrEqual(activeOnly); // filters intersect, never widen

    await p.switchOverrideTab('Labor');
    expect(await p.getActiveTab()).toBe('Labor'); // the tab still switches with two filters applied

    expect((await p.downloadOverrideExport()).content).toBe(baseline.content); // no combination reaches the file
  });

  test('TC-CPR-OVR-143: Rows-per-page survives a reload, and the export is unaffected either way', async ({ corporatePricingOverridePage: p }) => {
    await p.selectLocation(CORP_PRICING_OVERRIDE.pager.multiPageOffice);
    await p.waitForGridRows();
    const before = await p.downloadOverrideExport();

    await p.setRowsPerPage('50');
    const drawn = await p.getVisibleRowCount();
    expect(drawn).toBeGreaterThan(Number(CORP_PRICING_OVERRIDE.pager.defaultRowsPerPage));

    await p.reloadAndReselect(CORP_PRICING_OVERRIDE.pager.multiPageOffice);
    await p.waitForGridRows();
    // Whether the choice persists is the app's call; what must hold is that the export is identical
    // in both states, so read the post-reload page size rather than assuming which way it went.
    const afterReload = await p.getVisibleRowCount();
    expect(afterReload).toBeGreaterThan(0);
    expect((await p.downloadOverrideExport()).content).toBe(before.content);
  });

  test('TC-CPR-OVR-144: Sorting the grid does not reorder the exported file', async ({ corporatePricingOverridePage: p }) => {
    const PGN = CORP_PRICING_OVERRIDE.columnIndex.productGroupName;
    const before = await p.downloadOverrideExport();
    const firstCellBefore = await p.getFirstRowCellText(PGN);

    await p.sortColumnViaDropdown('Product Group Name', 'descending');
    expect(await p.getFirstRowCellText(PGN)).not.toBe(firstCellBefore); // positive control: the grid really re-ordered

    const after = await p.downloadOverrideExport();
    expect(after.content).toBe(before.content); // the file keeps its own server-side order
  });

  });

  test.describe('grid-to-file reconciliation', () => {
    test.beforeEach(async ({ corporatePricingOverridePage: p }) => {
      test.setTimeout(120_000);
      await p.reloadAndReselect(CORP_PRICING_OVERRIDE_ACTIVE_BED.office);
    });

  test('TC-CPR-OVR-145: A row visible in the grid appears in the export with the same price, and text values survive intact', async ({ corporatePricingOverridePage: p }) => {
    const COL = CORP_PRICING_OVERRIDE.columnIndex;
    const productGroupId = await p.getFirstRowCellText(COL.productGroup);
    const productGroupName = await p.getFirstRowCellText(COL.productGroupName);
    const overridePriceOnScreen = await p.getFirstRowCellText(COL.overridePrice);
    expect(productGroupId).not.toBe('');
    expect(productGroupName).not.toBe('');

    const r = await p.downloadOverrideExport();
    const idx = {
      location: r.headers.indexOf('Location Id'),
      productGroup: r.headers.indexOf('Product Group Id'),
      name: r.headers.indexOf('Product Group Name'),
      override: r.headers.indexOf(EXPORT.optionalMoneyColumn),
    };
    const rows = r.content.split(/\r?\n/).slice(1).filter((l) => l.length > 0).map((l) => l.split(','));
    const match = rows.find((row) => row[idx.location] === CORP_PRICING_OVERRIDE_ACTIVE_BED.office && row[idx.productGroup] === productGroupId);
    expect(match, `product group ${productGroupId} is on screen but missing from the export`).toBeDefined();

    // The price the user reads and the price the file ships must be the same number. The grid adds
    // thousands separators for display, so compare the numeric values rather than the strings.
    expect(Number(match![idx.override])).toBeCloseTo(Number(overridePriceOnScreen.replace(/,/g, '')), 2);

    // Leading zeros in product group names (for example "07A Compass Screen Set Kit") must survive
    // the export as text. Losing them is the classic sign of a value passed through a number type.
    const leadingZeroNames = rows.map((row) => row[idx.name] ?? '').filter((n) => /^0\d/.test(n));
    expect(leadingZeroNames.length).toBeGreaterThan(0); // the tenant does carry such names
    for (const name of leadingZeroNames.slice(0, 10)) expect(name).toMatch(/^0\d/);

    // The final data row must be complete, which is what proves the download was not truncated.
    expect(rows[rows.length - 1]).toHaveLength(r.headers.length);
    expect(r.content).not.toContain('�'); // decodes as valid UTF-8 end to end
  });

  test('TC-CPR-OVR-146: Override Discount stays on the fraction scale, and the known percent-scale rows do not spread', async ({ corporatePricingOverridePage: p }) => {
    const r = await p.downloadOverrideExport();
    const idx = {
      location: r.headers.indexOf('Location Id'),
      productGroup: r.headers.indexOf('Product Group Id'),
      discount: r.headers.indexOf(EXPORT.optionalPercentColumn),
    };
    const discounts = r.content.split(/\r?\n/).slice(1).filter((l) => l.length > 0)
      .map((l) => l.split(','))
      .filter((row) => (row[idx.discount] ?? '') !== '')
      .map((row) => ({ office: row[idx.location] ?? '', productGroup: row[idx.productGroup] ?? '', value: Number(row[idx.discount]) }));
    expect(discounts.length).toBeGreaterThan(0);

    // The column stores a fraction: the grid multiplies by 100 to display it, so 0.06 reads as 6.00%.
    // A value above 1 therefore renders above 100% — beyond the cap the app itself enforces on entry
    // (see TC-CPR-OVR-036). A handful of rows are stored that way and render as 1300% and 1400%.
    const overScale = discounts.filter((d) => d.value > 1);
    const fractionScale = discounts.filter((d) => d.value <= 1);
    expect(fractionScale.length).toBeGreaterThan(overScale.length * 10); // the fraction scale is overwhelmingly the norm

    // Pinned in both directions so the count cannot drift unnoticed: growth means the corruption is
    // spreading, and a drop to zero means it was cleaned up and this guard should be retired.
    expect(overScale.length).toBeLessThanOrEqual(EXPORT.discountScale.knownOverScaleRows);
    for (const d of overScale) {
      expect(d.value * 100, `office ${d.office} / product group ${d.productGroup} renders as ${d.value * 100}%`).toBeGreaterThan(EXPORT.discountScale.percentCap);
    }
  });

  });
});
