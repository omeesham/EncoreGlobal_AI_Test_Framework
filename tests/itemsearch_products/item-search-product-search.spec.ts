import { test, expect } from '../../src/fixtures/pages.fixture';
import { ItemSearchPage } from '../../src/pages/item-search/item-search.page';
import { ProductGroupsPage } from '../../src/pages/item-search/product-groups.page';
import { ProductCodePage } from '../../src/pages/item-search/product-code.page';
import { phase, verify } from '../../src/fixtures/report-steps';
import {
  ISR_OFFICE,
  ISR_REGION_PLACEHOLDER,
  ISR_SEARCH_WORD,
  ISR_NO_MATCH_BARCODE,
  ISR_BARCODE_NUMERIC,
  ISR_BARCODE_NUMERIC_ALT,
  ISR_BARCODE_LETTERED,
  ISR_BARCODES_SHARING_A_PRODUCT,
  ISR_SHARED_PRODUCT_CODE_ID,
  ISR_BARCODE_PREFIX,
  ISR_BARCODE_MAX_LENGTH,
  ISR_BARCODE_OVERLONG,
  ISR_COLUMNS,
  ISR_COLUMN_MENU_ITEMS,
  ISR_SORT_COLUMN,
  ISR_HIDE_COLUMN,
  ISR_PAGE_SIZES,
  ISR_DEFAULT_PAGE_SIZE,
  ISR_PAGE_COUNT_FLOOR,
  ISR_TOOLTIP_INFO,
  ISR_TOOLTIP_COLLAPSE,
  ISR_TOOLTIP_GRID_OPTIONS,
} from '../../src/data/item-search/item-search';

/**
 * Item Search — Products page (NM-3650), office 1101 (admin-only surface).
 *
 * Covers the search inputs above the "Filters" heading and the results grid below it. The
 * companion file product-search-filters.spec.ts covers the Filters controls themselves —
 * Location, Region, Product Organization, the date pair, and the two checkboxes.
 *
 * Two live behaviors shape every test:
 *  - Results load only on Search, and Reset empties to "0 products found" until the next
 *    Search. Executed criteria + results + sort order are restored from browser storage on
 *    later visits, so every test starts from Reset — defaults are never asserted on a bare
 *    load.
 *  - The page hydrates behind skeleton placeholders (~20s cold, ~11s per unfiltered
 *    search); every wait keys on the placeholder census, never a row count.
 *
 * Nothing here persists data — the page has no save; only filter state is touched and
 * each test restores what it changes.
 */
// A test can run two full searches plus a reload on a slow evening — the ceiling covers
// the worst measured stack, and the run report is where slowness gets surfaced.
test.describe.configure({ timeout: 300_000 });

/** True when the values are in non-descending order, compared case-insensitively. */
const isNonDescending = (values: string[]): boolean =>
  values.every((v, i) => i === 0 || (values[i - 1] ?? '').toLowerCase() <= v.toLowerCase());

// ---------------------------------------------------------------------------- test cases
// One describe, tests in ascending TC-id order: the alignment gate
// (scripts/check-testcase-alignment.js) requires a spec's tests to ascend by TC id,
// and every test here declares dependencyGate([]) — order carries no meaning.

test.describe('SBC — Item Search Products — surface behaviors and search panel fields @item-search @product-search', () => {
  let isr: ItemSearchPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    isr = new ItemSearchPage(authenticatedSession.page, config);
    await isr.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-PRS-001: The Products page loads with the search panel and grid ready', { tag: '@C105796' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // A full navigation is the point of this case — it proves the ready gate itself.
    await phase('Open the Products page', () => isr.open(ISR_OFFICE));
    await verify('The grid renders all thirteen columns', async () => {
      expect(await isr.readHeaderNames()).toEqual([...ISR_COLUMNS]);
    });
    await verify('The result count label renders', async () => {
      // The count number is deliberately not asserted — a bare load may restore a previous
      // search — only that the label renders at all.
      await expect.poll(async () => await isr.readFoundCount(), { timeout: 30_000 }).not.toBeNull();
    });
  });

  test('TC-ISR-PRS-002: Reset restores the default criteria and empties the results', { tag: '@C105797' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // Dirty the criteria with a real executed search first.
    await phase('Dirty the criteria with an executed search', async () => {
      await isr.typeAnyField(ISR_SEARCH_WORD);
      await isr.clickSearchAndWait((n) => n !== null && n > 0);
    });
    await phase('Click Reset', () => isr.clickReset());
    await verify('Every criterion is back to its default', async () => {
      expect(await isr.readAnyField()).toBe('');
      expect(await isr.readBarcode()).toBe('');
      expect(await isr.readRegionText()).toBe(ISR_REGION_PLACEHOLDER);
      expect(await isr.readLocationText()).toContain(ISR_OFFICE);
      expect(await isr.isFilterChecked(0)).toBe(false);
      expect(await isr.isFilterChecked(1)).toBe(true);
      expect(await isr.isKeywordSelected()).toBe(true);
    });
    await verify('The result set is emptied and stays empty', async () => {
      expect(await isr.readFoundCount()).toBe(0);
      expect(await isr.readRowCount()).toBe(0);
      // The zero state must be the settled response, not a loading gap — keep sampling the
      // count across a twenty-second window and require it to stay at zero throughout.
      const started = Date.now();
      await expect
        .poll(async () => {
          if ((await isr.readFoundCount()) !== 0) return 'results appeared';
          return Date.now() - started > 20_000 ? 'stayed empty' : 'still watching';
        }, { timeout: 60_000 })
        .toBe('stayed empty');
      expect(await isr.readRowCount()).toBe(0);
    });
  });

  test('TC-ISR-PRS-003: An Any Field word returns only matching products', { tag: '@C105798' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const total = await phase('Run an unfiltered search for the baseline count', () =>
      isr.clickSearchAndWait((n) => n !== null && n > 0));
    const filtered = await phase(`Search the Any Field box for "${ISR_SEARCH_WORD}"`, async () => {
      await isr.typeAnyField(ISR_SEARCH_WORD);
      return isr.clickSearchAndWait((n) => n !== null && n > 0 && n < (total as number));
    });
    await verify('The word narrows the result set', async () => {
      expect(filtered as number).toBeGreaterThan(0);
      expect(filtered as number).toBeLessThan(total as number);
    });
    await verify('Every returned row carries the search word', async () => {
      const rows = await isr.page.locator('tbody tr').allTextContents();
      const word = ISR_SEARCH_WORD.toLowerCase();
      for (const row of rows.slice(0, 10)) {
        expect(row.toLowerCase()).toContain(word);
      }
    });
  });

  test('TC-ISR-PRS-004: Search help opens guidance for the selected search type', { tag: '@C105799' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Open the search help', () => isr.openSearchHelp());
    await verify('The help popover describes what Any Field searches', async () => {
      const text = (await isr.openPopover().textContent()) ?? '';
      expect(text).toContain('Any Field');
      expect(text.toLowerCase()).toContain('category');
      expect(text.toLowerCase()).toContain('product group');
    });
    await phase('Dismiss the help popover', () => isr.closePopover());
    await verify('The popover closes', async () => {
      await expect(isr.openPopover()).toBeHidden({ timeout: 5_000 });
    });
  });

  test('TC-ISR-PRS-005: The header icons show their tooltips', { tag: '@C105800' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await verify('The information icon shows its tooltip', async () => {
      expect(await isr.hoverAndReadTooltip(isr.moreInformationButton())).toContain(ISR_TOOLTIP_INFO);
    });
    await verify('The collapse icon shows its tooltip', async () => {
      expect(await isr.hoverAndReadTooltip(isr.collapseButton())).toContain(ISR_TOOLTIP_COLLAPSE);
    });
    await verify('The grid options icon shows its tooltip', async () => {
      expect(await isr.hoverAndReadTooltip(isr.gridOptionsButton())).toContain(ISR_TOOLTIP_GRID_OPTIONS);
    });
  });

  test('TC-ISR-PRS-006: Grid cells show a tooltip only when their text is cut off', { tag: '@C105801' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Run an unfiltered search', () => isr.clickSearchAndWait((n) => n !== null && n > 0));
    const samples = await phase('Find a cut-off cell and a fitting one', () => isr.findTruncationSamples());
    await verify('The page offers both a cut-off and a fully-fitting cell', async () => {
      expect(samples.truncated, 'no cut-off cell found on the first page').not.toBeNull();
      expect(samples.fitting, 'no fully-fitting cell found on the first page').not.toBeNull();
    });
    // A cut-off cell shows its full text in a tooltip on hover.
    const truncated = samples.truncated!;
    const tip = await phase('Hover the cut-off cell', () =>
      isr.hoverAndReadTooltip(isr.cellAt(truncated.row, truncated.col)));
    await verify('The cut-off cell shows its full text in a tooltip', async () => {
      expect(tip).toContain(truncated.text.slice(0, 30));
    });
    // A fitting cell shows none — sampled repeatedly across the tooltip's open delay.
    // The cut-off cell's tooltip can outlive its hover, so the stage is cleared first;
    // without this the sampler reads the leftover tooltip and blames the fitting cell.
    const fitting = samples.fitting!;
    await phase('Clear the stage and hover the fitting cell', async () => {
      await isr.waitForTooltipsToClear();
      await isr.cellAt(fitting.row, fitting.col).hover();
    });
    await verify('The fitting cell shows no tooltip', async () => {
      const started = Date.now();
      await expect
        .poll(async () => {
          const tooltips = await isr.page.locator('[role="tooltip"]').count();
          if (tooltips > 0) return 'tooltip appeared';
          return Date.now() - started > 2_000 ? 'stayed clear' : 'still watching';
        }, { timeout: 10_000 })
        .toBe('stayed clear');
    });
  });

  test('TC-ISR-PRS-007: A barcode with no match shows the empty state', { tag: '@C105802' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    const none = await phase('Search a barcode that matches nothing', async () => {
      await isr.typeBarcode(ISR_NO_MATCH_BARCODE);
      return isr.clickSearchAndWait((n) => n === 0);
    });
    await verify('The empty state is shown with no rows', async () => {
      expect(none).toBe(0);
      await expect(isr.page.getByText('No results')).toBeVisible();
      expect(await isr.readRowCount()).toBe(0);
    });
    // Clearing the barcode brings the full set back.
    const restored = await phase('Clear the barcode and search again', async () => {
      await isr.typeBarcode('');
      return isr.clickSearchAndWait((n) => n !== null && n > 0);
    });
    await verify('The full result set returns', async () => {
      expect(restored as number).toBeGreaterThan(0);
    });
  });

  test('TC-ISR-PRS-008: Sorting flips through the column menu', { tag: '@C105803' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Run an unfiltered search', () => isr.clickSearchAndWait((n) => n !== null && n > 0));
    // Normalize to ascending first — the sort order also persists across visits, so the
    // starting direction is otherwise whatever the previous run left behind.
    await phase(`Open the ${ISR_SORT_COLUMN} column menu`, () => isr.openColumnMenu(ISR_SORT_COLUMN));
    await verify('The column menu offers sort and hide', async () => {
      expect(await isr.readOpenMenuItems()).toEqual([...ISR_COLUMN_MENU_ITEMS]);
    });
    await phase('Sort ascending', () => isr.clickMenuItem('Sort ascending'));
    const ascendingFirstRow = await phase('Note the top row under ascending sort', () => isr.readFirstRowText());
    await verify('The column reads in ascending order', async () => {
      const ascending = (await isr.readColumnValues(ISR_SORT_COLUMN)).filter((v) => v !== '');
      expect(isNonDescending(ascending)).toBe(true);
    });
    // Flip to descending: the page changes and the order reverses.
    await phase('Sort descending', async () => {
      await isr.openColumnMenu(ISR_SORT_COLUMN);
      await isr.clickMenuItem('Sort descending');
    });
    await verify('The order reverses and the top row changes', async () => {
      await expect.poll(async () => await isr.readFirstRowText(), { timeout: 60_000 }).not.toBe(ascendingFirstRow);
      const descending = (await isr.readColumnValues(ISR_SORT_COLUMN)).filter((v) => v !== '');
      expect(isNonDescending([...descending].reverse())).toBe(true);
    });
    // Restore ascending — the original first row returns.
    await phase('Sort ascending again', async () => {
      await isr.openColumnMenu(ISR_SORT_COLUMN);
      await isr.clickMenuItem('Sort ascending');
    });
    await verify('The original first row returns', async () => {
      await expect.poll(async () => await isr.readFirstRowText(), { timeout: 60_000 }).toBe(ascendingFirstRow);
    });
  });

  test('TC-ISR-PRS-009: Pagination moves between pages', { tag: '@C105804' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Run an unfiltered search', () => isr.clickSearchAndWait((n) => n !== null && n > 0));
    await verify('Page one rests with the backward controls disabled', async () => {
      expect(await isr.readPageNumber()).toBe('1');
      expect((await isr.readTotalPages()) ?? 0).toBeGreaterThan(ISR_PAGE_COUNT_FLOOR);
      expect(await isr.isPaginationEnabled('Go to first page')).toBe(false);
      expect(await isr.isPaginationEnabled('Go to previous page')).toBe(false);
      expect(await isr.isPaginationEnabled('Go to next page')).toBe(true);
    });
    const firstRowPage1 = await phase('Note the first row on page one', () => isr.readFirstRowText());
    await phase('Go to the next page', () => isr.clickPagination('Go to next page'));
    await verify('Page two shows different rows and enables the backward controls', async () => {
      await expect.poll(async () => await isr.readPageNumber(), { timeout: 60_000 }).toBe('2');
      expect(await isr.readFirstRowText()).not.toBe(firstRowPage1);
      expect(await isr.isPaginationEnabled('Go to first page')).toBe(true);
      expect(await isr.isPaginationEnabled('Go to previous page')).toBe(true);
    });
    await phase('Go back to the first page', () => isr.clickPagination('Go to first page'));
    await verify('Page one returns with its original rows', async () => {
      await expect.poll(async () => await isr.readPageNumber(), { timeout: 60_000 }).toBe('1');
      expect(await isr.readFirstRowText()).toBe(firstRowPage1);
    });
  });

  test('TC-ISR-PRS-010: Rows-per-page offers five sizes', { tag: '@C105805' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Run an unfiltered search', () => isr.clickSearchAndWait((n) => n !== null && n > 0));
    await verify('The five page sizes are offered, with 50 selected', async () => {
      expect(await isr.readRowsPerPage()).toBe(ISR_DEFAULT_PAGE_SIZE);
      expect(await isr.readRowsPerPageOptions()).toEqual([...ISR_PAGE_SIZES]);
    });
    await verify('Dismissing the list leaves the page size untouched', async () => {
      // Escape closed the list without choosing — the size and the page are unchanged.
      expect(await isr.readRowsPerPage()).toBe(ISR_DEFAULT_PAGE_SIZE);
      // Fifty rows per page is the feature under test here, so the exact count is correct.
      expect(await isr.readRowCount()).toBe(Number(ISR_DEFAULT_PAGE_SIZE));
    });
  });

  test('TC-ISR-PRS-011: Grid Options hides and restores a column', { tag: '@C105806' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Run an unfiltered search', () => isr.clickSearchAndWait((n) => n !== null && n > 0));
    await verify(`The ${ISR_HIDE_COLUMN} column starts visible`, async () => {
      expect(await isr.readHeaderNames()).toContain(ISR_HIDE_COLUMN);
    });
    await phase('Open Grid Options', () => isr.openGridOptions());
    const entries = await phase('Read the Grid Options entries', () => isr.readOpenMenuItems());
    await verify('Grid Options lists the hideable columns', async () => {
      expect(entries).toContain('Reset to Default View');
      expect(entries).toContain(ISR_HIDE_COLUMN);
      // The Item column has no entry — it cannot be hidden.
      expect(entries.filter((e) => e === 'Item')).toHaveLength(0);
      expect(await isr.isGridOptionChecked(ISR_HIDE_COLUMN)).toBe(true);
    });
    // Hide the column and prove it left the grid.
    await phase(`Hide the ${ISR_HIDE_COLUMN} column`, () => isr.clickMenuItem(ISR_HIDE_COLUMN));
    await verify('The column leaves the grid and its toggle clears', async () => {
      await expect.poll(async () => await isr.readHeaderNames(), { timeout: 30_000 }).not.toContain(ISR_HIDE_COLUMN);
      await isr.openGridOptions();
      expect(await isr.isGridOptionChecked(ISR_HIDE_COLUMN)).toBe(false);
    });
    // Restore it.
    await phase(`Restore the ${ISR_HIDE_COLUMN} column`, () => isr.clickMenuItem(ISR_HIDE_COLUMN));
    await verify('The column returns to the grid', async () => {
      await expect.poll(async () => await isr.readHeaderNames(), { timeout: 30_000 }).toContain(ISR_HIDE_COLUMN);
    });
  });

  test('TC-ISR-PRS-012: An executed search survives leaving and returning', { tag: '@C105807' }, async ({ authenticatedSession, config, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    const count = await phase('Run a word search', async () => {
      await isr.typeAnyField(ISR_SEARCH_WORD);
      return isr.clickSearchAndWait((n) => n !== null && n > 0);
    });
    // Leave the page entirely, then come back.
    await phase('Leave for Product Groups and come back', async () => {
      const groups = new ProductGroupsPage(authenticatedSession.page, config);
      await groups.open(ISR_OFFICE);
      await isr.open(ISR_OFFICE);
    });
    await verify('The executed search is restored without searching again', async () => {
      // The executed search is restored without clicking Search again.
      expect(await isr.readAnyField()).toBe(ISR_SEARCH_WORD);
      await expect.poll(async () => await isr.readFoundCount(), { timeout: 120_000 }).toBe(count);
      expect(await isr.readRowCount()).toBeGreaterThan(0);
    });
  });

  test('TC-ISR-PRS-013: The search panel collapses and expands', { tag: '@C105808' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // Give the panel a value that must survive the collapse cycle.
    await phase('Type a value the collapse must preserve', () => isr.typeAnyField('zz'));
    const input = isr.page.locator('[data-testid="e2e-search-input"]');
    // Collapsing slides the panel up and out of the window rather than removing it,
    // so the proof is the toggle renaming itself and the input leaving the viewport
    // (proven live: the collapsed input keeps a box at a negative height).
    await phase('Collapse the search panel', () => isr.collapseButton().click());
    await verify('The panel slides out of the viewport and the toggle renames', async () => {
      await expect(isr.collapseToggleNamed('Expand search panel')).toBeVisible({ timeout: 10_000 });
      await expect(input).not.toBeInViewport({ timeout: 10_000 });
    });
    await phase('Expand the search panel again', () => isr.collapseButton().click());
    await verify('The panel returns with its typed value intact', async () => {
      await expect(isr.collapseToggleNamed('Collapse search panel')).toBeVisible({ timeout: 10_000 });
      await expect(input).toBeInViewport({ timeout: 10_000 });
      expect(await isr.readAnyField()).toBe('zz');
    });
    // Drop the typed value so nothing leaks forward (it was never searched).
    await phase('Clear the typed value', () => isr.typeAnyField(''));
  });

  test('TC-ISR-PRS-014: A numeric barcode returns the single product it is scanned under', { tag: '@C105809' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Enter the numeric barcode', () => isr.typeBarcode(ISR_BARCODE_NUMERIC.code));
    await verify('Feeding the barcode empties the word box', async () => {
      // The two boxes are alternatives, so feeding the barcode must leave the word box empty.
      expect(await isr.readAnyField()).toBe('');
    });
    const found = await phase('Run the barcode search', () => isr.clickSearchAndWait((n) => n === 1));
    await verify('Exactly the product the barcode is scanned under comes back', async () => {
      expect(found).toBe(1);
      expect(await isr.readRowCount()).toBe(1);
      // Which product came back is the assertion — a row count alone would pass on the wrong one.
      expect(await isr.readColumnValues('Product Code ID')).toEqual([ISR_BARCODE_NUMERIC.productCodeId]);
      expect(await isr.readColumnValues('Item')).toEqual([ISR_BARCODE_NUMERIC.item]);
    });
  });

  test('TC-ISR-PRS-015: A barcode with letters resolves the same way as a numeric one', { tag: '@C105810' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Enter the lettered barcode', () => isr.typeBarcode(ISR_BARCODE_LETTERED.code));
    const found = await phase('Run the barcode search', () => isr.clickSearchAndWait((n) => n === 1));
    await verify('The lettered barcode resolves to its single product', async () => {
      expect(found).toBe(1);
      expect(await isr.readColumnValues('Product Code ID')).toEqual([ISR_BARCODE_LETTERED.productCodeId]);
      expect(await isr.readColumnValues('Item')).toEqual([ISR_BARCODE_LETTERED.item]);
    });
  });

  test('TC-ISR-PRS-016: Different barcodes on the same product all return that product', { tag: '@C105811' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    // Two of these carry the site prefix and one is plain digits — the printed form of a
    // barcode says nothing about which product it belongs to.
    for (const code of ISR_BARCODES_SHARING_A_PRODUCT) {
      const found = await phase(`Search barcode ${code}`, async () => {
        await isr.typeBarcode(code);
        return isr.clickSearchAndWait((n) => n === 1);
      });
      await verify(`Barcode ${code} returns the shared product`, async () => {
        expect(found, `barcode ${code} should find exactly one product`).toBe(1);
        expect(await isr.readColumnValues('Product Code ID'), `barcode ${code}`).toEqual([
          ISR_SHARED_PRODUCT_CODE_ID,
        ]);
      });
    }
  });

  test('TC-ISR-PRS-017: Barcode matching ignores letter case', { tag: '@C105812' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Enter the barcode as printed', () => isr.typeBarcode(ISR_BARCODE_LETTERED.code));
    await verify('The barcode as printed finds its product', async () => {
      expect(await isr.clickSearchAndWait((n) => n === 1)).toBe(1);
      expect(await isr.readColumnValues('Product Code ID')).toEqual([ISR_BARCODE_LETTERED.productCodeId]);
    });
    // Someone typing a barcode by hand should not have to match the label's case.
    await phase('Enter the same barcode in lower case', () => isr.typeBarcode(ISR_BARCODE_LETTERED.code.toLowerCase()));
    await verify('The same barcode in lower case finds the same product', async () => {
      expect(await isr.clickSearchAndWait((n) => n === 1)).toBe(1);
      expect(await isr.readColumnValues('Product Code ID')).toEqual([ISR_BARCODE_LETTERED.productCodeId]);
    });
  });

  test('TC-ISR-PRS-018: A shortened barcode matches nothing', { tag: '@C105813' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    // The full barcode first, so a later zero can only mean "no match" and never
    // "the search never ran".
    await phase('Enter the full barcode', () => isr.typeBarcode(ISR_BARCODE_NUMERIC.code));
    await verify('The full barcode matches, so the search is known to run', async () => {
      expect(await isr.clickSearchAndWait((n) => n === 1)).toBe(1);
    });
    // A prefix is not a match — one scan must not pull up a shelf of near-neighbours.
    await phase('Enter only a prefix of it', () => isr.typeBarcode(ISR_BARCODE_PREFIX));
    await verify('A prefix of that barcode matches nothing', async () => {
      expect(await isr.clickSearchAndWait((n) => n === 0)).toBe(0);
      await expect(isr.page.getByText('No results')).toBeVisible();
    });
    // A space in front is likewise not the same value. A trailing space IS tolerated,
    // which is an inconsistency raised with the product owner rather than asserted here —
    // a space is itself a legal barcode character, so neither half is obviously wrong.
    await phase('Enter it again with a leading space', () => isr.typeBarcode(` ${ISR_BARCODE_NUMERIC.code}`));
    await verify('A leading space makes it a different value', async () => {
      expect(await isr.clickSearchAndWait((n) => n === 0)).toBe(0);
    });
  });

  test('TC-ISR-PRS-019: The barcode box and the Any Field box clear each other', { tag: '@C105814' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Type a word into the Any Field box', () => isr.typeAnyField(ISR_SEARCH_WORD));
    await verify('The word lands and the barcode box is empty', async () => {
      expect(await isr.readAnyField()).toBe(ISR_SEARCH_WORD);
      expect(await isr.readBarcode()).toBe('');
    });
    // Feeding the barcode empties the word box.
    await phase('Enter a barcode instead', () => isr.typeBarcode(ISR_BARCODE_NUMERIC.code));
    await verify('The barcode clears the word box', async () => {
      expect(await isr.readBarcode()).toBe(ISR_BARCODE_NUMERIC.code);
      expect(await isr.readAnyField()).toBe('');
    });
    // And back the other way — last one set wins, exactly like Location and Region.
    await phase('Type the word back into the Any Field box', () => isr.typeAnyField(ISR_SEARCH_WORD));
    await verify('The word clears the barcode box in turn', async () => {
      expect(await isr.readAnyField()).toBe(ISR_SEARCH_WORD);
      expect(await isr.readBarcode()).toBe('');
    });
    await phase('Click Reset', () => isr.clickReset());
    await verify('Reset empties both boxes', async () => {
      expect(await isr.readAnyField()).toBe('');
      expect(await isr.readBarcode()).toBe('');
    });
  });

  test('TC-ISR-PRS-020: A barcode search survives leaving and returning', { tag: '@C105815' }, async ({ authenticatedSession, config, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    const count = await phase('Run a barcode search', async () => {
      await isr.typeBarcode(ISR_BARCODE_NUMERIC_ALT.code);
      return isr.clickSearchAndWait((n) => n === 1);
    });
    await verify('The barcode finds its single product', async () => {
      expect(count).toBe(1);
    });
    // Leave the page entirely, then come back.
    await phase('Leave for Product Groups and come back', async () => {
      const groups = new ProductGroupsPage(authenticatedSession.page, config);
      await groups.open(ISR_OFFICE);
      await isr.open(ISR_OFFICE);
    });
    await verify('The executed barcode search is restored', async () => {
      // The executed barcode search is restored without clicking Search again.
      expect(await isr.readBarcode()).toBe(ISR_BARCODE_NUMERIC_ALT.code);
      await expect.poll(async () => await isr.readFoundCount(), { timeout: 120_000 }).toBe(1);
      expect(await isr.readColumnValues('Product Code ID')).toEqual([
        ISR_BARCODE_NUMERIC_ALT.productCodeId,
      ]);
    });
  });

  test('TC-ISR-PRS-021: A product found by barcode opens in the product-code dialog', { tag: '@C105816' }, async ({ authenticatedSession, config, dependencyGate }) => {
    dependencyGate([]);
    const found = await phase('Find the product by barcode', async () => {
      await isr.typeBarcode(ISR_BARCODE_NUMERIC.code);
      return isr.clickSearchAndWait((n) => n === 1);
    });
    await verify('The barcode returns its product', async () => {
      expect(found).toBe(1);
      expect(await isr.readColumnValues('Product Code ID')).toEqual([ISR_BARCODE_NUMERIC.productCodeId]);
    });
    // A barcode result is an ordinary row — the toolbar and its dialog behave as always.
    const pc = new ProductCodePage(authenticatedSession.page, config);
    await phase('Select the row and open the product code details', async () => {
      await pc.selectFirstRow();
      await expect(pc.viewProductCodeButton()).toBeVisible();
      await pc.openViewDialog();
    });
    await verify('The dialog opens on the Item tab showing that product', async () => {
      expect(await pc.readActiveTab()).toBe('Item');
      // The product's name sits in an editable box, so it is read as a value rather than
      // from the dialog's text; the identifier is read from the text as a second anchor.
      expect(await pc.dialogNameBox().inputValue()).toBe(ISR_BARCODE_NUMERIC.item);
      expect(await pc.readDialogText()).toContain(`Product Code ID${ISR_BARCODE_NUMERIC.productCodeId}`);
    });
    await phase('Close the dialog', () => pc.closeDialog());
  });

  test('TC-ISR-PRS-022: The barcode box stops accepting characters at its limit', { tag: '@C105817' }, async ({ dependencyGate }) => {
    dependencyGate([]);
    await phase('Type a barcode past the box limit', () => isr.typeBarcode(ISR_BARCODE_OVERLONG));
    // The box refuses the surplus rather than showing an error.
    const held = await phase('Read what the box kept', () => isr.readBarcode());
    await verify('The box keeps only the characters that fit', async () => {
      expect(held).toHaveLength(ISR_BARCODE_MAX_LENGTH);
      expect(held).toBe(ISR_BARCODE_OVERLONG.slice(0, ISR_BARCODE_MAX_LENGTH));
    });
    await verify('The truncated value matches nothing', async () => {
      expect(await isr.clickSearchAndWait((n) => n === 0)).toBe(0);
      await expect(isr.page.getByText('No results')).toBeVisible();
    });
    await phase('Click Reset', () => isr.clickReset());
    await verify('Reset empties the barcode box', async () => {
      expect(await isr.readBarcode()).toBe('');
    });
  });
});
