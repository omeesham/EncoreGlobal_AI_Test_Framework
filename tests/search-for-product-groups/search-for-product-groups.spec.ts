import { test, expect } from '../../src/fixtures/pages.fixture';
import { ProductGroupsPage } from '../../src/pages/product-groups/product-groups.page';
import { ProductCodePage } from '../../src/pages/products/product-code.page';
import { ProductsPage } from '../../src/pages/products/products.page';
import { ISR_OFFICE, ISR_SEARCH_WORD } from '../../src/data/products/products';
import {
  PGR_SEARCH_WORD,
  PGR_COLUMNS,
  PGR_DEFAULT_PAGE_SIZE,
  PGR_PAGE_SIZES,
  PGR_DEEP_SEARCH,
  PGR_COLUMN_FIELDS,
  PGR_DEFAULT_COLUMN_ORDER,
  PGR_DEFAULT_NAME_COLUMN_WIDTH,
  PGR_RESIZE_DRAG_PX,
  PGR_COLUMN_MENU_ENTRIES,
  PGR_GRID_OPTIONS_ENTRIES,
  PGR_MENU,
  PGR_EDIT_HEADING,
  PGR_ADD_VARIANTS,
} from '../../src/data/product-groups/product-groups';

/**
 * Search For Product Groups (NM-2258) — the Product Groups list page on office 1101.
 *
 * Covers arriving at the page, running a group search, the empty-search and pagination
 * contracts, Reset, search persistence across navigation, and the status column. The
 * create flow behind the page's Add button is the sibling sub-task NM-2259 and has its own
 * spec and workbook, delivered separately.
 *
 * Shares the Products page's behaviors (skeleton hydration, storage-restored executed
 * searches, no auto-search on load) with two deliberate differences asserted here: an
 * empty-criteria search returns ZERO groups (the Products page returns everything — the
 * inconsistency is flagged for discussion; this suite asserts today's behavior), and the
 * grid turns 20 rows per page instead of 50.
 *
 * The deeper cases (TC-008 onwards) pin the search contract (phrase match over Name and
 * Description, case and space handling, literal special characters, empty and no-match
 * states), the Active status switch, the row click to the Edit page and the two return
 * paths, the pager and rows-per-page retention, sorting and its persistence, the Grid
 * Options layout controls (hide/show, reorder, resize, Reset to Default View) and the
 * collapsible search panel. They search the automation-owned "ZZ E2E" groups because that
 * family's composition is known; counts are asserted relatively and page totals are
 * computed from the count label.
 *
 * Sorting, the page size and the grid layout all outlive a form Reset — they live in
 * browser storage — so the deeper describes restore the default grid view per test.
 */
test.describe.configure({ timeout: 300_000 });

/**
 * True when the values are in non-descending order by character code with letter case ignored —
 * the grid's own order. The grid sorts case-insensitively (read live 2026-09-10: descriptions sorted
 * descending ran "walk …", "Toast …", "special …", "Probe …", "Automated …"), so a plain code
 * comparison, which puts every lowercase initial after every uppercase one, misreads a mixed-case column.
 */
const isNonDescendingIgnoringCase = (values: string[]): boolean =>
  values.every((v, i) => i === 0 || (values[i - 1] ?? '').toLowerCase() <= v.toLowerCase());

const PAGER_BUTTONS = ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page'] as const;

/** Rows a page holds when the results are split at the given page size. */
const rowsOnPage = (count: number, pageSize: number, pageNumber: number): number =>
  Math.min(pageSize, count - pageSize * (pageNumber - 1));

// ---------------------------------------------------------------------------- surface cases

test.describe('SBC — Item Search Product Groups surface behaviors @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-PGR-001: The Product Groups page loads without auto-searching', async ({ authenticatedSession, config, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    // The covered entry is the in-app route: a selected row's toolbar on the Products
    // page. The beforeEach already reset THIS page, so the arrival state is clean.
    const products = new ProductCodePage(authenticatedSession.page, config);
    await products.ensureCleanSearch(ISR_OFFICE);
    await products.typeAnyField(ISR_SEARCH_WORD);
    await products.clickSearchAndWait((n) => n !== null && n > 0);
    await products.selectFirstRow();
    await products.productGroupButton().click();
    await pgr.waitForReady();
    expect(await pgr.readHeaderNames()).toEqual([...PGR_COLUMNS]);
    await expect(pgr.page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
    // No rows load until a search runs — the box was left empty by the reset above.
    expect(await pgr.readSearch()).toBe('');
    expect(await pgr.readRowCount()).toBe(0);
  });

  test('TC-ISR-PGR-002: A search word returns matching groups', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_SEARCH_WORD);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 20);
    expect(count as number).toBeGreaterThan(20);
    const names = await pgr.readColumnValues('Name');
    expect(names.length).toBeGreaterThan(0);
    const word = PGR_SEARCH_WORD.toLowerCase();
    for (const name of names) {
      expect(name.toLowerCase()).toContain(word);
    }
  });

  test('TC-ISR-PGR-003: Searching with an empty box returns zero groups', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Deliberately different from the Products page, where an empty search returns the
    // full set. The inconsistency is flagged for discussion with the product team; this
    // case asserts today's actual behavior and should be revisited if the rule changes.
    const count = await pgr.clickSearchAndWait((n) => n === 0);
    expect(count).toBe(0);
    expect(await pgr.readRowCount()).toBe(0);
    // The zero must be the settled response, not a loading gap — sample the count across
    // a twenty-second window and require it to stay at zero throughout.
    const started = Date.now();
    await expect
      .poll(async () => {
        if ((await pgr.readFoundCount()) !== 0) return 'results appeared';
        return Date.now() - started > 20_000 ? 'stayed empty' : 'still watching';
      }, { timeout: 60_000 })
      .toBe('stayed empty');
    expect(await pgr.readRowCount()).toBe(0);
  });

  test('TC-ISR-PGR-004: Pagination pages through at twenty rows', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_SEARCH_WORD);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 20);
    expect(count as number).toBeGreaterThan(20);
    // Twenty rows per page is this page's size — the exact count is the feature here.
    expect(await pgr.readRowsPerPage()).toBe(PGR_DEFAULT_PAGE_SIZE);
    expect(await pgr.readRowCount()).toBe(Number(PGR_DEFAULT_PAGE_SIZE));
    expect(await pgr.readPageNumber()).toBe('1');
    expect(await pgr.isPaginationEnabled('Go to first page')).toBe(false);
    expect(await pgr.isPaginationEnabled('Go to previous page')).toBe(false);
    const firstRowPage1 = await pgr.readFirstRowText();
    await pgr.clickPagination('Go to next page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    expect(await pgr.readFirstRowText()).not.toBe(firstRowPage1);
    expect(await pgr.isPaginationEnabled('Go to first page')).toBe(true);
    expect(await pgr.isPaginationEnabled('Go to previous page')).toBe(true);
    await pgr.clickPagination('Go to first page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('1');
    expect(await pgr.readFirstRowText()).toBe(firstRowPage1);
  });

  test('TC-ISR-PGR-005: An executed group search survives leaving and returning', async ({ authenticatedSession, config, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_SEARCH_WORD);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    // Leave the page entirely, then come back.
    const products = new ProductsPage(authenticatedSession.page, config);
    await products.open(ISR_OFFICE);
    await pgr.open(ISR_OFFICE);
    // The executed search is restored without clicking Search again.
    expect(await pgr.readSearch()).toBe(PGR_SEARCH_WORD);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    expect(await pgr.readRowCount()).toBeGreaterThan(0);
  });

  test('TC-ISR-PGR-006: Result rows show their status', async ({ dependencyGate }) => {
    dependencyGate([]);
    // The Active filter is checked (the reset keeps it on), so every row renders Active.
    expect(await pgr.isActiveChecked()).toBe(true);
    await pgr.typeSearch(PGR_SEARCH_WORD);
    await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    const statuses = await pgr.readColumnValues('Status');
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(status).toBe('Active');
    }
    const serviceTypes = await pgr.readColumnValues('Service Type');
    for (const serviceType of serviceTypes) {
      expect(serviceType.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------- field cases

test.describe('Item Search Product Groups search panel — fields @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
  });

  test('TC-ISR-PGR-007: Reset clears the search and keeps the Active filter', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_SEARCH_WORD);
    await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    await pgr.clickReset();
    expect(await pgr.readSearch()).toBe('');
    expect(await pgr.readFoundCount()).toBe(0);
    expect(await pgr.readRowCount()).toBe(0);
    expect(await pgr.isActiveChecked()).toBe(true);
  });
});

// ---------------------------------------------------------------------------- search contract

test.describe('Item Search Product Groups search contract @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
    await pgr.ensureDefaultGridView();
  });

  test('TC-ISR-PGR-008: The Enter key runs the group search', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const byEnter = await pgr.pressEnterAndWait((n) => n !== null && n > 0);
    expect(byEnter as number).toBeGreaterThan(0);
    const firstRowByEnter = await pgr.readFirstRowText();
    // The same word through the Search button returns the same set.
    await pgr.clickReset();
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect(await pgr.clickSearchAndWait((n) => n !== null && n > 0)).toBe(byEnter);
    expect(await pgr.readFirstRowText()).toBe(firstRowByEnter);
  });

  test('TC-ISR-PGR-009: The description column is searched too', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.descriptionPhrase);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    expect(count as number).toBeGreaterThan(0);
    const names = await pgr.readColumnValues('Name');
    const descriptions = await pgr.readColumnValues('Description');
    expect(names.length).toBeGreaterThan(0);
    // Every match came from the description — no name carries the phrase.
    const phrase = PGR_DEEP_SEARCH.descriptionPhrase.toLowerCase();
    for (let i = 0; i < names.length; i++) {
      expect((descriptions[i] ?? '').toLowerCase()).toContain(phrase);
      expect((names[i] ?? '').toLowerCase()).not.toContain(phrase);
    }
  });

  test('TC-ISR-PGR-010: Search ignores case and surrounding spaces; a spaces-only search counts as empty', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const reference = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    expect(reference as number).toBeGreaterThan(0);
    // Reset between the variants so each count is proven to come back from zero.
    await pgr.clickReset();
    await pgr.typeSearch(PGR_DEEP_SEARCH.lowerCaseWord);
    expect(await pgr.clickSearchAndWait((n) => n !== null && n > 0)).toBe(reference);
    await pgr.clickReset();
    await pgr.typeSearch(PGR_DEEP_SEARCH.paddedWord);
    expect(await pgr.clickSearchAndWait((n) => n !== null && n > 0)).toBe(reference);
    // The box keeps the spaces as typed; only the matching trims them.
    expect(await pgr.readSearch()).toBe(PGR_DEEP_SEARCH.paddedWord);
    await pgr.typeSearch(PGR_DEEP_SEARCH.spacesOnly);
    expect(await pgr.clickSearchAndWait((n) => n === 0)).toBe(0);
    expect(await pgr.readRowCount()).toBe(0);
    expect(await pgr.isNoResultsShown()).toBe(true);
  });

  test('TC-ISR-PGR-011: Search matches the typed words in order, as one phrase', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.phraseInOrder);
    expect(await pgr.clickSearchAndWait((n) => n === 1)).toBe(1);
    expect(await pgr.readColumnValues('Name')).toEqual([PGR_DEEP_SEARCH.singleMatchName]);
    // The same words reversed find nothing — the count is watched down from one.
    await pgr.typeSearch(PGR_DEEP_SEARCH.phraseReversed);
    expect(await pgr.clickSearchAndWait((n) => n === 0)).toBe(0);
    expect(await pgr.readRowCount()).toBe(0);
    // A name word next to a description word finds nothing either (watched down from the family count).
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    await pgr.typeSearch(PGR_DEEP_SEARCH.crossFieldPhrase);
    expect(await pgr.clickSearchAndWait((n) => n === 0)).toBe(0);
    expect(await pgr.readRowCount()).toBe(0);
  });

  test('TC-ISR-PGR-012: Special characters are searched literally', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.ampersandQuote);
    const withAmpersand = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    expect(withAmpersand as number).toBeGreaterThan(0);
    const namesWithAmpersand = await pgr.readColumnValues('Name');
    const descriptionsWithAmpersand = await pgr.readColumnValues('Description');
    for (let i = 0; i < namesWithAmpersand.length; i++) {
      expect(`${namesWithAmpersand[i]} ${descriptionsWithAmpersand[i]}`).toContain(PGR_DEEP_SEARCH.ampersandQuote);
    }
    // The markup fragment lives in the same names, so it returns the same groups.
    await pgr.clickReset();
    await pgr.typeSearch(PGR_DEEP_SEARCH.markupTag);
    expect(await pgr.clickSearchAndWait((n) => n !== null && n > 0)).toBe(withAmpersand);
    expect([...(await pgr.readColumnValues('Name'))].sort()).toEqual([...namesWithAmpersand].sort());
    // A percent sign is a character, not a wildcard: every match carries it literally.
    await pgr.clickReset();
    await pgr.typeSearch(PGR_DEEP_SEARCH.percent);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    const namesWithPercent = await pgr.readColumnValues('Name');
    const descriptionsWithPercent = await pgr.readColumnValues('Description');
    expect(namesWithPercent.length).toBeGreaterThan(0);
    for (let i = 0; i < namesWithPercent.length; i++) {
      expect(`${namesWithPercent[i]} ${descriptionsWithPercent[i]}`).toContain(PGR_DEEP_SEARCH.percent);
    }
  });

  test('TC-ISR-PGR-013: A term matching nothing shows zero groups and "No results"; a 200-character term is accepted', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    await pgr.typeSearch(PGR_DEEP_SEARCH.noMatch);
    expect(await pgr.clickSearchAndWait((n) => n === 0)).toBe(0);
    expect(await pgr.readRowCount()).toBe(0);
    expect(await pgr.isNoResultsShown()).toBe(true);
    expect(await Promise.all(PAGER_BUTTONS.map((name) => pgr.isPaginationEnabled(name)))).toEqual([false, false, false, false]);
    expect(await pgr.readPageNumber()).toBe('1');
    expect(await pgr.readTotalPages()).toBe(1);
    // Back to a populated grid so the long term's zero is a watched transition, not a leftover.
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    const longTerm = 'a'.repeat(PGR_DEEP_SEARCH.longTermLength);
    await pgr.typeSearch(longTerm);
    expect(await pgr.readSearch()).toBe(longTerm);
    expect(await pgr.clickSearchAndWait((n) => n === 0)).toBe(0);
    expect(await pgr.readRowCount()).toBe(0);
  });

  test('TC-ISR-PGR-014: A single match reports a count of 1 with one row', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.singleMatchName);
    expect(await pgr.clickSearchAndWait((n) => n === 1)).toBe(1);
    expect(await pgr.readColumnValues('Name')).toEqual([PGR_DEEP_SEARCH.singleMatchName]);
    expect(await pgr.readPageNumber()).toBe('1');
    expect(await pgr.readTotalPages()).toBe(1);
    expect(await Promise.all(PAGER_BUTTONS.map((name) => pgr.isPaginationEnabled(name)))).toEqual([false, false, false, false]);
  });

  test('TC-ISR-PGR-015: Names containing markup render as literal text', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.markupTag);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    const names = await pgr.readColumnValues('Name');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toContain(PGR_ADD_VARIANTS.specialCharsNamePart);
    }
    expect(await pgr.doesFirstNameCellRenderMarkup()).toBe(false);
  });

  test('TC-ISR-PGR-016: A submit inside the typing debounce runs the previous term; after the pause the typed word runs', async ({ dependencyGate }) => {
    dependencyGate([]);
    // Keystrokes reach the search on a short delay, and a submit inside that delay runs the term
    // committed before it: the empty term on a first visit, the old word after an executed search.
    // Accepted as the page's designed behaviour (ruling of 2026-09-10), so this case pins it together
    // with the other half of the contract: a submit after the pause runs the word in the box.
    // A first visit: an immediate submit runs the empty term, so nothing is found.
    await pgr.forgetStoredSearch();
    await pgr.typeSearchWithoutPause(PGR_DEEP_SEARCH.word);
    await pgr.pressEnterAndWaitForSearchToFinish();
    expect((await pgr.readStoredSearchState())?.searchText, 'the term the first immediate submit ran').toBe('');
    await expect.poll(() => pgr.readFoundCount(), { message: 'groups found by the first immediate submit', timeout: 15_000 }).toBe(0);
    expect(await pgr.readSearch(), 'the box keeps the typed word').toBe(PGR_DEEP_SEARCH.word);
    // The same word submitted after the pause runs and finds the family.
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    await pgr.pressEnterAndWaitForSearchToFinish();
    expect((await pgr.readStoredSearchState())?.searchText, 'the term the paused submit ran').toBe(PGR_DEEP_SEARCH.word);
    await expect.poll(() => pgr.readFoundCount(), { message: 'groups found by the paused submit', timeout: 15_000 }).toBeGreaterThan(0);
    const familyFirstRow = await pgr.readFirstRowText();
    // An executed search edited and submitted at once re-runs the old word, and the rows stay.
    await pgr.typeSearchWithoutPause(PGR_DEEP_SEARCH.secondWord);
    await pgr.pressEnterAndWaitForSearchToFinish();
    expect((await pgr.readStoredSearchState())?.searchText, 'the term the immediate re-submit ran').toBe(PGR_DEEP_SEARCH.word);
    expect(await pgr.readFirstRowText(), 'the first row after the immediate re-submit').toBe(familyFirstRow);
    expect(await pgr.readSearch(), 'the box keeps the new word').toBe(PGR_DEEP_SEARCH.secondWord);
    // The new word submitted after the pause runs and replaces the rows.
    await pgr.typeSearch(PGR_DEEP_SEARCH.secondWord);
    await pgr.pressEnterAndWaitForSearchToFinish();
    expect((await pgr.readStoredSearchState())?.searchText, 'the term the paused re-submit ran').toBe(PGR_DEEP_SEARCH.secondWord);
    await expect.poll(() => pgr.readFoundCount(), { message: 'groups found by the paused re-submit', timeout: 15_000 }).toBeGreaterThan(0);
    expect(await pgr.readFirstRowText(), 'the first row after the paused re-submit').not.toBe(familyFirstRow);
  });
});

// ---------------------------------------------------------------------------- status filter, rows, return paths

test.describe('Item Search Product Groups status filter, rows and return paths @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
    await pgr.ensureDefaultGridView();
  });

  test('TC-ISR-PGR-017: Clearing the Active filter lists inactive groups only', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.setActiveFilter(false);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const inactive = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    expect(inactive as number).toBeGreaterThan(0);
    const inactiveStatuses = await pgr.readColumnValues('Status');
    expect(inactiveStatuses.length).toBeGreaterThan(0);
    for (const status of inactiveStatuses) {
      expect(status).toBe('Inactive');
    }
    // Re-checked, the same word lists the active groups — a different set with a different count.
    await pgr.setActiveFilter(true);
    const active = await pgr.clickSearchAndWait((n) => n !== null && n > 0 && n !== inactive);
    expect(active).not.toBe(inactive);
    const activeStatuses = await pgr.readColumnValues('Status');
    expect(activeStatuses.length).toBeGreaterThan(0);
    for (const status of activeStatuses) {
      expect(status).toBe('Active');
    }
  });

  test('TC-ISR-PGR-018: The Active filter and its results survive a full reload', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.setActiveFilter(false);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const inactive = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    await pgr.reload();
    expect(await pgr.readSearch()).toBe(PGR_DEEP_SEARCH.word);
    expect(await pgr.isActiveChecked()).toBe(false);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(inactive);
    for (const status of await pgr.readColumnValues('Status')) {
      expect(status).toBe('Inactive');
    }
    await pgr.setActiveFilter(true);
    const active = await pgr.clickSearchAndWait((n) => n !== null && n > 0 && n !== inactive);
    await pgr.reload();
    expect(await pgr.isActiveChecked()).toBe(true);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(active);
    for (const status of await pgr.readColumnValues('Status')) {
      expect(status).toBe('Active');
    }
  });

  test('TC-ISR-PGR-019: Clicking a result row opens that group\'s Edit page', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    const names = await pgr.readColumnValues('Name');
    const descriptions = await pgr.readColumnValues('Description');
    await pgr.openRow(0, 'Description');
    const landing = await pgr.readEditLanding();
    expect(landing.heading).toBe(PGR_EDIT_HEADING);
    expect(landing.name).toBe(names[0]);
    expect(landing.description).toBe(descriptions[0]);
    expect(landing.activeChecked).toBe(true);
    expect(landing.priceBadge).toMatch(/^(Not )?Priced$/);
    expect(landing.saveEnabled).toBe(false);
    expect(landing.cancelEnabled).toBe(true);
    expect(landing.breadcrumbs).toEqual(['Products', 'Product Groups']);
    expect(landing.hasTranslationsButton).toBe(true);
    // Leave the Edit page so the next case starts on the list.
    await pgr.clickBreadcrumbToGroups();
  });

  test('TC-ISR-PGR-020: Returning from the Edit page restores the results and the page number', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > Number(PGR_DEFAULT_PAGE_SIZE));
    await pgr.clickPagination('Go to next page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    const page2Rows = await pgr.readRowCount();
    const page2FirstRow = await pgr.readFirstRowText();
    // The browser's Back restores page 2 of the same search.
    await pgr.openRow(0, 'Name');
    await pgr.goBack();
    expect(await pgr.readSearch()).toBe(PGR_DEEP_SEARCH.word);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    expect(await pgr.readRowCount()).toBe(page2Rows);
    expect(await pgr.readFirstRowText()).toBe(page2FirstRow);
    // So does the Product Groups breadcrumb on the Edit page.
    await pgr.openRow(0, 'Name');
    await pgr.clickBreadcrumbToGroups();
    expect(await pgr.readSearch()).toBe(PGR_DEEP_SEARCH.word);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    expect(await pgr.readRowCount()).toBe(page2Rows);
    expect(await pgr.readFirstRowText()).toBe(page2FirstRow);
  });

  test('TC-ISR-PGR-021: The clear control empties the box but keeps the results', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    const rows = await pgr.readRowCount();
    expect(await pgr.isClearIconShown()).toBe(true);
    await pgr.clickClearIcon();
    expect(await pgr.readSearch()).toBe('');
    expect(await pgr.readFoundCount()).toBe(count);
    expect(await pgr.readRowCount()).toBe(rows);
    expect(await pgr.isClearIconShown()).toBe(false);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word.slice(0, 2));
    expect(await pgr.isClearIconShown()).toBe(true);
    // The executed search — not the cleared or the half-typed box — is what a reload restores.
    await pgr.reload();
    expect(await pgr.readSearch()).toBe(PGR_DEEP_SEARCH.word);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
  });

  test('TC-ISR-PGR-022: A loader shows in the search box while a search runs', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.armSearchLoaderWatch();
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = await pgr.pressEnterAndWait((n) => n !== null && n > 0);
    const watch = await pgr.readSearchLoaderWatch();
    expect(watch.loaderSeen).toBe(true);
    expect(watch.skeletonSeen).toBe(true);
    expect(watch.loaderStillShown).toBe(false);
    expect(await pgr.readFoundCount()).toBe(count);
  });

  test('TC-ISR-PGR-023: The Products breadcrumb returns to the Products page', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    await pgr.clickBreadcrumbToProducts();
    expect(new URL(pgr.page.url()).pathname).toMatch(new RegExp(`/locations/${ISR_OFFICE}/products/?$`));
    await pgr.goBack();
    expect(await pgr.readSearch()).toBe(PGR_DEEP_SEARCH.word);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    expect(await pgr.readRowCount()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------- pagination

test.describe('Item Search Product Groups pagination @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;
  const pageSize = Number(PGR_DEFAULT_PAGE_SIZE);

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
    await pgr.ensureDefaultGridView();
  });

  test('TC-ISR-PGR-024: Last and first page jumps and the page-of-total label', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = (await pgr.clickSearchAndWait((n) => n !== null && n > pageSize)) as number;
    const pages = Math.ceil(count / pageSize);
    expect(await pgr.readPageNumber()).toBe('1');
    expect(await pgr.readTotalPages()).toBe(pages);
    expect(await Promise.all(PAGER_BUTTONS.map((name) => pgr.isPaginationEnabled(name)))).toEqual([false, false, true, true]);
    await pgr.clickPagination('Go to last page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe(String(pages));
    expect(await pgr.readRowCount()).toBe(rowsOnPage(count, pageSize, pages));
    expect(await Promise.all(PAGER_BUTTONS.map((name) => pgr.isPaginationEnabled(name)))).toEqual([true, true, false, false]);
    await pgr.clickPagination('Go to first page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('1');
    expect(await pgr.readRowCount()).toBe(pageSize);
    expect(await pgr.readFoundCount()).toBe(count);
  });

  test('TC-ISR-PGR-025: The page-number box jumps to a valid page and snaps back on invalid input', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = (await pgr.clickSearchAndWait((n) => n !== null && n > pageSize)) as number;
    const pages = Math.ceil(count / pageSize);
    await pgr.jumpToPage('2');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    expect(await pgr.readRowCount()).toBe(rowsOnPage(count, pageSize, 2));
    // One past the last page and zero both snap back to the page the grid is on.
    await pgr.jumpToPage(String(pages + 1));
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    await pgr.jumpToPage('0');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    // Letters are not accepted at all — the box keeps its number.
    expect(await pgr.typeIntoPageBox('abc')).toBe('2');
    await pgr.clickPagination('Go to first page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('1');
    await pgr.jumpToPage('2');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
  });

  test('TC-ISR-PGR-026: Rows per page offers 10 to 50 and reshapes the pages', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = (await pgr.clickSearchAndWait((n) => n !== null && n > pageSize)) as number;
    expect(await pgr.readRowsPerPage()).toBe(PGR_DEFAULT_PAGE_SIZE);
    expect(await pgr.readRowsPerPageOptions()).toEqual([...PGR_PAGE_SIZES]);
    // Fifty rows: the family fits on far fewer pages (one, at its current size).
    await pgr.selectRowsPerPage('50');
    await expect.poll(async () => await pgr.readRowCount(), { timeout: 60_000 }).toBe(Math.min(count, 50));
    const pagesAt50 = Math.ceil(count / 50);
    expect(await pgr.readTotalPages()).toBe(pagesAt50);
    expect(await pgr.isPaginationEnabled('Go to next page')).toBe(pagesAt50 > 1);
    expect(await pgr.isPaginationEnabled('Go to last page')).toBe(pagesAt50 > 1);
    // Ten rows: more pages, and the last page holds the remainder.
    await pgr.selectRowsPerPage('10');
    await expect.poll(async () => await pgr.readRowCount(), { timeout: 60_000 }).toBe(10);
    const pagesAt10 = Math.ceil(count / 10);
    expect(await pgr.readTotalPages()).toBe(pagesAt10);
    expect(await pgr.isPaginationEnabled('Go to next page')).toBe(true);
    await pgr.clickPagination('Go to last page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe(String(pagesAt10));
    expect(await pgr.readRowCount()).toBe(rowsOnPage(count, 10, pagesAt10));
    expect(await pgr.readFoundCount()).toBe(count);
    await pgr.selectRowsPerPage(PGR_DEFAULT_PAGE_SIZE);
    await expect.poll(async () => await pgr.readTotalPages(), { timeout: 60_000 }).toBe(Math.ceil(count / pageSize));
  });

  test('TC-ISR-PGR-027: The chosen rows-per-page and page survive leaving and returning', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = (await pgr.clickSearchAndWait((n) => n !== null && n > pageSize)) as number;
    await pgr.selectRowsPerPage('10');
    const pagesAt10 = Math.ceil(count / 10);
    await pgr.clickPagination('Go to last page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe(String(pagesAt10));
    const lastPageRows = await pgr.readRowCount();
    // Out through the Products breadcrumb and back again.
    await pgr.clickBreadcrumbToProducts();
    await pgr.goBack();
    expect(await pgr.readRowsPerPage()).toBe('10');
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe(String(pagesAt10));
    expect(await pgr.readRowCount()).toBe(lastPageRows);
    // A fresh navigation by address restores the same shape.
    await pgr.open(ISR_OFFICE);
    expect(await pgr.readRowsPerPage()).toBe('10');
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe(String(pagesAt10));
    expect(await pgr.readRowCount()).toBe(lastPageRows);
    await pgr.selectRowsPerPage(PGR_DEFAULT_PAGE_SIZE);
    await expect.poll(async () => await pgr.readTotalPages(), { timeout: 60_000 }).toBe(Math.ceil(count / pageSize));
  });

  test('TC-ISR-PGR-028: Reset from a later page returns the pager to page 1 of 1', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = (await pgr.clickSearchAndWait((n) => n !== null && n > pageSize)) as number;
    await pgr.clickPagination('Go to next page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    await pgr.clickReset();
    expect(await pgr.readSearch()).toBe('');
    expect(await pgr.readFoundCount()).toBe(0);
    expect(await pgr.readPageNumber()).toBe('1');
    expect(await pgr.readTotalPages()).toBe(1);
    expect(await Promise.all(PAGER_BUTTONS.map((name) => pgr.isPaginationEnabled(name)))).toEqual([false, false, false, false]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect(await pgr.clickSearchAndWait((n) => n !== null && n > pageSize)).toBe(count);
    expect(await pgr.readPageNumber()).toBe('1');
    expect(await pgr.readTotalPages()).toBe(Math.ceil(count / pageSize));
  });
});

// ---------------------------------------------------------------------------- sorting

test.describe('Item Search Product Groups sorting @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
    await pgr.ensureDefaultGridView();
  });

  test('TC-ISR-PGR-029: Results default to Name ascending', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.resetToDefaultView();
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    const names = await pgr.readColumnValues('Name');
    expect(names.length).toBeGreaterThan(0);
    expect(isNonDescendingIgnoringCase(names)).toBe(true);
    expect(await pgr.readSortMarker('Name')).toBe('ascending');
    expect(await pgr.readSortMarker('Description')).toBe('neutral');
    expect(await pgr.readSortMarker('Service Type')).toBe('neutral');
    expect(await pgr.readSortMarker('Status')).toBe('none');
    const stored = await pgr.readStoredSearchState();
    expect(stored?.sortBy).toBe(PGR_COLUMN_FIELDS.Name);
    expect(stored?.sortDirection).toBe('asc');
  });

  test('TC-ISR-PGR-030: The Name column menu sorts descending and ascending', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    expect(await pgr.readColumnMenuEntries('Name')).toEqual([...PGR_COLUMN_MENU_ENTRIES.Name]);
    const ascendingFirstRow = await pgr.readFirstRowText();
    await pgr.chooseColumnMenuEntry('Name', PGR_MENU.sortDescending);
    await expect.poll(async () => await pgr.readFirstRowText(), { timeout: 60_000 }).not.toBe(ascendingFirstRow);
    const descending = await pgr.readColumnValues('Name');
    expect(isNonDescendingIgnoringCase([...descending].reverse())).toBe(true);
    expect(await pgr.readSortMarker('Name')).toBe('descending');
    await pgr.chooseColumnMenuEntry('Name', PGR_MENU.sortAscending);
    await expect.poll(async () => await pgr.readFirstRowText(), { timeout: 60_000 }).toBe(ascendingFirstRow);
    expect(isNonDescendingIgnoringCase(await pgr.readColumnValues('Name'))).toBe(true);
    expect(await pgr.readSortMarker('Name')).toBe('ascending');
  });

  test('TC-ISR-PGR-031: Description and Service Type sort through their column menus', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    await pgr.chooseColumnMenuEntry('Description', PGR_MENU.sortDescending);
    const descriptions = (await pgr.readColumnValues('Description')).filter((v) => v !== '');
    expect(descriptions.length).toBeGreaterThan(0);
    expect(isNonDescendingIgnoringCase([...descriptions].reverse())).toBe(true);
    expect(await pgr.readSortMarker('Description')).toBe('descending');
    // One sort at a time — the marker leaves Name.
    expect(await pgr.readSortMarker('Name')).toBe('neutral');
    await pgr.chooseColumnMenuEntry('Service Type', PGR_MENU.sortAscending);
    const typesAscending = await pgr.readColumnValues('Service Type');
    expect(typesAscending.length).toBeGreaterThan(0);
    expect(isNonDescendingIgnoringCase(typesAscending)).toBe(true);
    expect(await pgr.readSortMarker('Service Type')).toBe('ascending');
    expect(await pgr.readSortMarker('Description')).toBe('neutral');
    await pgr.chooseColumnMenuEntry('Service Type', PGR_MENU.sortDescending);
    const typesDescending = await pgr.readColumnValues('Service Type');
    expect(isNonDescendingIgnoringCase([...typesDescending].reverse())).toBe(true);
    expect(await pgr.readSortMarker('Service Type')).toBe('descending');
  });

  test('TC-ISR-PGR-032: Sorting from a later page returns to page 1', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > Number(PGR_DEFAULT_PAGE_SIZE))) as number).toBeGreaterThan(Number(PGR_DEFAULT_PAGE_SIZE));
    await pgr.clickPagination('Go to next page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    await pgr.chooseColumnMenuEntry('Description', PGR_MENU.sortDescending);
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('1');
    expect(await pgr.readRowCount()).toBe(Number(PGR_DEFAULT_PAGE_SIZE));
    expect(await pgr.readSortMarker('Description')).toBe('descending');
  });

  test('TC-ISR-PGR-033: The applied sort survives a new search, a Reset and a reload', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    await pgr.chooseColumnMenuEntry('Service Type', PGR_MENU.sortDescending);
    expect(await pgr.readSortMarker('Service Type')).toBe('descending');
    const sortedFirstRow = await pgr.readFirstRowText();
    // A new search keeps the sort.
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect(await pgr.clickSearchAndWait((n) => n !== null && n > 0)).toBe(count);
    expect(await pgr.readSortMarker('Service Type')).toBe('descending');
    expect(await pgr.readFirstRowText()).toBe(sortedFirstRow);
    // The form Reset clears the criteria and the rows, not the sort.
    await pgr.clickReset();
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect(await pgr.clickSearchAndWait((n) => n !== null && n > 0)).toBe(count);
    expect(await pgr.readSortMarker('Service Type')).toBe('descending');
    expect(await pgr.readFirstRowText()).toBe(sortedFirstRow);
    const stored = await pgr.readStoredSearchState();
    expect(stored?.sortBy).toBe(PGR_COLUMN_FIELDS['Service Type']);
    expect(stored?.sortDirection).toBe('desc');
    // A reload restores the sorted set.
    await pgr.reload();
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    expect(await pgr.readSortMarker('Service Type')).toBe('descending');
    expect(await pgr.readFirstRowText()).toBe(sortedFirstRow);
    // Only Reset to Default View clears it.
    await pgr.resetToDefaultView();
    await expect.poll(async () => await pgr.readSortMarker('Name'), { timeout: 30_000 }).toBe('ascending');
    expect(await pgr.readSortMarker('Service Type')).toBe('neutral');
  });

  test('TC-ISR-PGR-034: Every column header opens a sort menu and Escape closes it', async ({ dependencyGate }) => {
    dependencyGate([]);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    // The header cell itself opens the menu, not only its button.
    await pgr.clickHeaderCell('Name');
    expect(await pgr.readOpenMenuItems()).toEqual([...PGR_COLUMN_MENU_ENTRIES.Name]);
    await pgr.closeOpenMenu();
    expect(await pgr.isMenuOpen()).toBe(false);
    expect(await pgr.readColumnMenuEntries('Description')).toEqual([...PGR_COLUMN_MENU_ENTRIES.Description]);
    expect(await pgr.readColumnMenuEntries('Service Type')).toEqual([...PGR_COLUMN_MENU_ENTRIES['Service Type']]);
    // Status cannot be sorted: its menu only hides the column and its header draws no marker.
    expect(await pgr.readColumnMenuEntries('Status')).toEqual([...PGR_COLUMN_MENU_ENTRIES.Status]);
    expect(await pgr.readSortMarker('Status')).toBe('none');
  });
});

// ---------------------------------------------------------------------------- grid layout

test.describe('Item Search Product Groups grid layout @item-search @product-groups', () => {
  let pgr: ProductGroupsPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pgr = new ProductGroupsPage(authenticatedSession.page, config);
    await pgr.ensureCleanSearch(ISR_OFFICE);
    await pgr.ensureDefaultGridView();
  });

  test('TC-ISR-PGR-035: Grid Options hides and shows columns and remembers the choice', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    expect(await pgr.readHeaderNames()).toEqual([...PGR_COLUMNS]);
    const entries = await pgr.readGridOptionsEntries();
    expect(entries.map((e) => e.label)).toEqual([...PGR_GRID_OPTIONS_ENTRIES]);
    expect(entries.map((e) => e.checked)).toEqual([null, true, true, true]);
    // Hide Description: the header and its cells leave, and the choice is stored.
    const withoutDescription = PGR_COLUMNS.filter((c) => c !== 'Description');
    await pgr.toggleGridOptionsColumn('Description');
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).toEqual(withoutDescription);
    expect((await pgr.readStoredGridLayout()).columnVisibility?.[PGR_COLUMN_FIELDS.Description]).toBe(false);
    await pgr.reload();
    expect(await pgr.readHeaderNames()).toEqual(withoutDescription);
    await pgr.toggleGridOptionsColumn('Description');
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).toEqual([...PGR_COLUMNS]);
    // The column menu's Hide column writes the same preference; Grid Options brings it back.
    await pgr.chooseColumnMenuEntry('Service Type', PGR_MENU.hideColumn);
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).toEqual(PGR_COLUMNS.filter((c) => c !== 'Service Type'));
    expect((await pgr.readStoredGridLayout()).columnVisibility?.[PGR_COLUMN_FIELDS['Service Type']]).toBe(false);
    await pgr.toggleGridOptionsColumn('Service Type');
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).toEqual([...PGR_COLUMNS]);
  });

  test('TC-ISR-PGR-036: Reset to Default View restores columns, sort, page and stored preferences', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > Number(PGR_DEFAULT_PAGE_SIZE));
    await pgr.toggleGridOptionsColumn('Status');
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).not.toContain('Status');
    await pgr.chooseColumnMenuEntry('Name', PGR_MENU.sortDescending);
    expect(await pgr.readSortMarker('Name')).toBe('descending');
    await pgr.clickPagination('Go to next page');
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('2');
    await pgr.resetToDefaultView();
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).toEqual([...PGR_COLUMNS]);
    await expect.poll(async () => await pgr.readSortMarker('Name'), { timeout: 30_000 }).toBe('ascending');
    expect(isNonDescendingIgnoringCase(await pgr.readColumnValues('Name'))).toBe(true);
    await expect.poll(async () => await pgr.readPageNumber(), { timeout: 60_000 }).toBe('1');
    expect(await pgr.readFoundCount()).toBe(count);
    const layout = await pgr.readStoredGridLayout();
    expect(Object.values(layout.columnVisibility ?? {}).every((shown) => shown)).toBe(true);
    expect(layout.columnOrder).toEqual([...PGR_DEFAULT_COLUMN_ORDER]);
    expect(layout.columnSizing ?? {}).toEqual({});
    const stored = await pgr.readStoredSearchState();
    expect(stored?.sortBy).toBe(PGR_COLUMN_FIELDS.Name);
    expect(stored?.sortDirection).toBe('asc');
    expect(stored?.pageIndex).toBe(1);
  });

  test('TC-ISR-PGR-037: Dragging a column header reorders the columns and the order persists', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    expect(await pgr.readHeaderNames()).toEqual([...PGR_COLUMNS]);
    await pgr.dragColumnOnto('Name', 'Service Type');
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).not.toEqual([...PGR_COLUMNS]);
    const reordered = await pgr.readHeaderNames();
    expect(reordered[0]).not.toBe('Name');
    expect([...reordered].sort()).toEqual([...PGR_COLUMNS].sort());
    // The cells moved with their header: the Name column still holds the names.
    for (const name of await pgr.readColumnValues('Name')) {
      expect(name).toContain(PGR_DEEP_SEARCH.word);
    }
    const layout = await pgr.readStoredGridLayout();
    expect(layout.columnOrder).not.toEqual([...PGR_DEFAULT_COLUMN_ORDER]);
    expect(layout.columnOrder?.[0]).not.toBe(PGR_COLUMN_FIELDS.Name);
    await pgr.reload();
    expect(await pgr.readHeaderNames()).toEqual(reordered);
    await pgr.resetToDefaultView();
    await expect.poll(async () => await pgr.readHeaderNames(), { timeout: 30_000 }).toEqual([...PGR_COLUMNS]);
  });

  test('TC-ISR-PGR-038: Dragging a column edge resizes it and the width persists', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    expect((await pgr.clickSearchAndWait((n) => n !== null && n > 0)) as number).toBeGreaterThan(0);
    expect((await pgr.readStoredGridLayout()).columnSizing ?? {}).toEqual({});
    const before = await pgr.readHeaderWidth('Name');
    await pgr.dragResizeHandle('Name', PGR_RESIZE_DRAG_PX);
    // The stored width moves by the whole drag; the rendered header widens (the table is pinned to
    // its container, so it widens by far less than the drag — recorded as a defect).
    await expect
      .poll(async () => (await pgr.readStoredGridLayout()).columnSizing?.[PGR_COLUMN_FIELDS.Name], { timeout: 15_000 })
      .toBe(PGR_DEFAULT_NAME_COLUMN_WIDTH + PGR_RESIZE_DRAG_PX);
    const after = await pgr.readHeaderWidth('Name');
    expect(after).toBeGreaterThan(before);
    await pgr.reload();
    expect(Math.abs((await pgr.readHeaderWidth('Name')) - after)).toBeLessThanOrEqual(2);
    expect((await pgr.readStoredGridLayout()).columnSizing?.[PGR_COLUMN_FIELDS.Name]).toBe(PGR_DEFAULT_NAME_COLUMN_WIDTH + PGR_RESIZE_DRAG_PX);
    await pgr.resetToDefaultView();
    await expect.poll(async () => (await pgr.readStoredGridLayout()).columnSizing ?? {}, { timeout: 15_000 }).toEqual({});
    expect(Math.abs((await pgr.readHeaderWidth('Name')) - before)).toBeLessThanOrEqual(2);
  });

  test('TC-ISR-PGR-039: The search panel collapses and expands; the state is not remembered', async ({ dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(420_000);
    await pgr.typeSearch(PGR_DEEP_SEARCH.word);
    const count = await pgr.clickSearchAndWait((n) => n !== null && n > 0);
    const rows = await pgr.readRowCount();
    const open = await pgr.readTableGeometry();
    await pgr.collapsePanel();
    // The panel's room goes to the grid: the table starts further left and is wider.
    await expect.poll(async () => (await pgr.readTableGeometry()).left, { timeout: 10_000 }).toBeLessThan(open.left);
    expect((await pgr.readTableGeometry()).width).toBeGreaterThan(open.width);
    expect(await pgr.readFoundCount()).toBe(count);
    expect(await pgr.readRowCount()).toBe(rows);
    // A reload reopens the panel — the collapsed state is not stored.
    await pgr.reload();
    expect(await pgr.isSearchPanelCollapsed()).toBe(false);
    await expect.poll(async () => await pgr.readFoundCount(), { timeout: 120_000 }).toBe(count);
    expect(Math.abs((await pgr.readTableGeometry()).left - open.left)).toBeLessThanOrEqual(2);
    await pgr.collapsePanel();
    await pgr.expandPanel();
    await expect.poll(async () => (await pgr.readTableGeometry()).left, { timeout: 10_000 }).toBe(open.left);
    expect(await pgr.readTableGeometry()).toEqual(open);
  });
});
