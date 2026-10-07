import { test, expect } from '../../src/fixtures/pages.fixture';
import { PriceGuidePage, parsePrice } from '../../src/pages/price-guide/price-guide.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import {
  PRICE_GUIDE_OFFICES,
  officeLabel,
  TEXT,
  LEFT_COLUMNS,
  RIGHT_COLUMNS,
  SEARCH,
  INVALID_OFFICES,
} from '../../src/data/price-guide/price-guide';

// Setup → Price Guide (NM-4128): page load, the left Packages / Product Groups lists, search,
// sort and left-list columns. Read-only — nothing here adds a recommendation or saves.
// Every case runs on USA 1606, Canada 2359 and Mexico 7147.

test.describe.configure({ timeout: 180_000 });

/** Names in a list are compared without case, the way the app's search matches. */
const lower = (s: string): string => s.toLowerCase();

for (const office of PRICE_GUIDE_OFFICES) {
  test.describe(`Price Guide — page and search — ${officeLabel(office)}`, () => {
    let pg: PriceGuidePage;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      pg = new PriceGuidePage(authenticatedSession.page, config);
    });

    /** Product Group cases need product groups on the office; an office without any is skipped, not failed. */
    async function requireProductGroups(): Promise<number> {
      await pg.switchTab('Product Groups');
      const count = await pg.getCount('left');
      test.skip(count === 0, `Office ${office.code} lists no product groups — nothing to exercise.`);
      return count;
    }

    // ---------------------------------------------------------------- page load

    test('TC-PRG-LOD-001: Price Guide opens from the Setup menu', async () => {
      await about('Opening Setup → Price Guide from the sidebar lands on the Price Guide page for the office.');
      await phase('Open Price Guide from the Setup menu', () => pg.openViaSetupMenu(office.code));
      await verify('The URL, tab title and header are Price Guide', async () => {
        expect(pg.getUrlPath()).toBe(`/navigator/locations/${office.code}/settings/price-guide`);
        expect(await pg.getPageTitle()).toBe(TEXT.pageTitle);
        expect(await pg.getHeaderText()).toBe(TEXT.header);
      });
    });

    test('TC-PRG-LOD-002: Information icon shows the page description', async () => {
      await about('Hovering the (i) icon next to the header explains what the page is for.');
      await pg.open(office.code);
      const tip = await phase('Hover the information icon', () => pg.getInfoTooltip());
      await verify('The tooltip describes the page', async () => {
        expect(tip).toContain(TEXT.info);
      });
      await phase('Move the mouse away', () => pg.moveMouseAway());
      await verify('The tooltip closes', async () => {
        expect(await pg.isTooltipVisible()).toBe(false);
      });
    });

    test('TC-PRG-LOD-003: Default state of the page on first load', async () => {
      await about('On first load the Packages list is shown on the left and an empty recommendations grid on the right.');
      await pg.open(office.code);
      await verify('Left panel: Packages tab active, Name and Price columns, a non-zero count', async () => {
        expect(await pg.getActiveTab()).toBe('Packages');
        expect(await pg.getVisibleColumnNames('left')).toEqual([...LEFT_COLUMNS]);
        expect(await pg.getCount('left')).toBeGreaterThan(0);
        expect(await pg.getSearchValue('left')).toBe('');
      });
      await verify('Right panel: title, columns, 0 items, Save disabled, Print available', async () => {
        const text = await pg.getRightPanelText();
        expect(text).toContain(TEXT.rightTitle);
        expect(await pg.getVisibleColumnNames('right')).toEqual([...RIGHT_COLUMNS]);
        expect(await pg.getCount('right')).toBe(0);
        expect(await pg.isSaveEnabled()).toBe(false);
        expect(await pg.isPrintEnabled()).toBe(true);
      });
      await verify('The empty state explains how to add recommendations', async () => {
        expect(await pg.isEmptyStateVisible()).toBe(true);
        expect(await pg.getRightPanelText()).toContain(TEXT.emptyBody);
      });
    });

    test('TC-PRG-LOD-004: Local Office card shows the current office number and name', async () => {
      await about('The Local Office card names the office whose price guide is open.');
      await pg.open(office.code);
      await verify(`The card reads "${office.code} - ${office.name}"`, async () => {
        const card = await pg.getLocalOfficeText();
        expect(card).toContain(TEXT.localOffice);
        expect(card).toContain(`${office.code} - ${office.name}`);
      });
    });

    test('TC-PRG-LOD-005: Invalid office number in the URL shows a clean error', async () => {
      await about('An office id that does not exist shows an error message instead of a broken page or another office\'s data.');
      for (const bad of INVALID_OFFICES) {
        const text = await phase(`Open Price Guide for office "${bad}"`, () => pg.openRaw(bad));
        await verify(`Office "${bad}" shows an error and no price guide data`, async () => {
          expect(text).toMatch(/error/i);
          expect(text).not.toMatch(/items? found/);
          expect(text).not.toContain(TEXT.rightTitle);
        });
      }
    });

    test('TC-PRG-LOD-006: Sidebar toggle and collapse/expand of the left search panel', async () => {
      await about('Collapsing the search panel widens the recommendations grid; expanding brings the panel back as it was.');
      await pg.open(office.code);
      await phase('Search the Packages list so its state can be checked after expanding', () => pg.search('left', SEARCH.partial));
      const before = { count: await pg.getCount('left'), width: await pg.getPanelWidth('right') };
      await phase('Collapse the search panel', () => pg.collapsePanel());
      await verify('The left panel is hidden and the recommendations grid is wider', async () => {
        expect(await pg.isLeftPanelVisible()).toBe(false);
        expect(await pg.getPanelWidth('right')).toBeGreaterThan(before.width);
      });
      await phase('Expand the search panel', () => pg.expandPanel());
      await verify('The left panel returns with the same tab, search and count', async () => {
        expect(await pg.isLeftPanelVisible()).toBe(true);
        expect(await pg.getActiveTab()).toBe('Packages');
        expect(await pg.getSearchValue('left')).toBe(SEARCH.partial);
        expect(await pg.getCount('left')).toBe(before.count);
      });
    });

    // ---------------------------------------------------------------- left list

    test('TC-PRG-LST-001: Packages tab lists packages with name and price', async () => {
      await about('The Packages list shows a count and rows with a name and a two-decimal price.');
      await pg.open(office.code);
      const rows = await pg.getRows('left', 20);
      await attachNote('First packages', JSON.stringify(rows.slice(0, 5)));
      await verify('Count is above zero and every row has a name and a formatted price', async () => {
        expect(await pg.getCount('left')).toBeGreaterThan(0);
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) {
          expect(r.name.length, 'name').toBeGreaterThan(0);
          expect(r.price, `price of "${r.name}"`).toMatch(/^\d{1,3}(,\d{3})*\.\d{2}$/);
        }
      });
    });

    test('TC-PRG-LST-002: Product Groups tab lists product groups', async () => {
      await about('The Product Groups tab swaps the list for product groups, and Packages brings the packages back.');
      await pg.open(office.code);
      const packages = { count: await pg.getCount('left'), first: (await pg.getRows('left', 1))[0]?.name };
      const pgCount = await phase('Open the Product Groups tab', () => requireProductGroups());
      const groups = await pg.getRows('left', 10);
      await verify('Product Groups is active and lists different items', async () => {
        expect(await pg.getActiveTab()).toBe('Product Groups');
        expect(pgCount).toBeGreaterThan(0);
        expect(groups.map((g) => g.name)).not.toContain(packages.first);
        for (const g of groups) expect(g.price).toMatch(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      });
      await phase('Go back to Packages', () => pg.switchTab('Packages'));
      await verify('The packages list returns', async () => {
        expect(await pg.getCount('left')).toBe(packages.count);
        expect((await pg.getRows('left', 1))[0]?.name).toBe(packages.first);
      });
    });

    test('TC-PRG-LST-003: Scrolling to the end of the list loads every item', async () => {
      await about('Scrolling to the bottom of the Packages list keeps loading rows; the count holds and no row is blank.');
      await pg.open(office.code);
      const count = await pg.getCount('left');
      const last = await phase('Scroll to the end of the list', () => pg.scrollLeftToEnd());
      await attachNote('Last row', JSON.stringify(last));
      await verify('The count is unchanged and the last row is a real item', async () => {
        expect(await pg.getCount('left')).toBe(count);
        expect(last?.name.length ?? 0).toBeGreaterThan(0);
        expect(last?.price ?? '').toMatch(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      });
      await verify('No blank or duplicated rows on screen', async () => {
        const rows = await pg.getRows('left');
        expect(rows.every((r) => r.name.length > 0)).toBe(true);
        expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
      });
    });

    test('TC-PRG-LST-004: Item count matches the real number of items (no silent cap)', async () => {
      await about('The "items found" count is the number of items the list actually holds — scrolling to the end reaches it.');
      await pg.open(office.code);
      const count = await pg.getCount('left');
      const last = await pg.scrollLeftToEnd();
      await attachNote('Count vs last row', `count ${count}; last row ${last?.name}`);
      await verify('The list does not end before the count says it should', async () => {
        // Seeded data numbers its copies "(#N)"; the highest number on screen must reach the count.
        const tail = (await pg.getRows('left')).map((r) => Number(r.name.match(/\(#(\d+)\)\s*$/)?.[1] ?? 0));
        const highest = Math.max(...tail);
        if (highest > 0) expect(highest).toBe(count);
        expect(count).toBeGreaterThan(0);
      });
    });

    // ---------------------------------------------------------------- left search

    async function expectEveryRowContains(term: string): Promise<void> {
      const rows = await pg.getRows('left', 30);
      expect(rows.length, `rows for "${term}"`).toBeGreaterThan(0);
      for (const r of rows) expect(lower(`${r.name} ${r.price}`), `row "${r.name}"`).toContain(lower(term));
    }

    test('TC-PRG-SRC-001: Search by part of a name filters the list as you type', async () => {
      await about('Typing part of a name filters the Packages list straight away, without pressing Enter.');
      await pg.open(office.code);
      const total = await pg.getCount('left');
      const n = await phase(`Type "${SEARCH.partial}"`, () => pg.search('left', SEARCH.partial));
      await verify('Fewer items, and every row contains the text', async () => {
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(total);
        await expectEveryRowContains(SEARCH.partial);
      });
      await phase('Clear the search', () => pg.search('left', ''));
      await verify('The full list returns', async () => {
        expect(await pg.getCount('left')).toBe(total);
      });
    });

    test('TC-PRG-SRC-002: Search is not case sensitive', async () => {
      await about('Upper and lower case searches return the same items.');
      await pg.open(office.code);
      const upper = await pg.search('left', SEARCH.partialUpper);
      const upperRows = await pg.getRows('left', 10);
      const low = await pg.search('left', SEARCH.partial);
      await verify('Same count and same rows', async () => {
        expect(upper).toBe(low);
        expect(await pg.getRows('left', 10)).toEqual(upperRows);
      });
    });

    test('TC-PRG-SRC-003: Search with a longer phrase narrows the list', async () => {
      await about('A longer phrase returns fewer items than a single word, and every row contains the whole phrase.');
      await pg.open(office.code);
      const word = await pg.search('left', SEARCH.partial);
      const phrase = await pg.search('left', SEARCH.phrase);
      await verify('The phrase narrows the list', async () => {
        expect(phrase).toBeGreaterThan(0);
        expect(phrase).toBeLessThan(word);
        await expectEveryRowContains(SEARCH.phrase);
      });
    });

    test('TC-PRG-SRC-004: Search matches on price as well as name', async () => {
      await about('Searching a number finds items whose price contains it.');
      await pg.open(office.code);
      const n = await pg.search('left', SEARCH.price);
      await verify(`Rows match "${SEARCH.price}" in the name or the price`, async () => {
        expect(n).toBeGreaterThan(0);
        const rows = await pg.getRows('left', 30);
        for (const r of rows) expect(`${r.name} ${r.price.replace(/,/g, '')}`).toContain(SEARCH.price);
      });
    });

    test('TC-PRG-SRC-005: Search with quotes and apostrophes in the name', async () => {
      await about('Names with feet and inch marks can be searched without errors.');
      await pg.open(office.code);
      const n = await pg.search('left', SEARCH.quote);
      await verify('Matching rows are found', async () => {
        expect(n).toBeGreaterThan(0);
        await expectEveryRowContains(SEARCH.quote);
      });
    });

    test('TC-PRG-SRC-006: Search with no match shows an empty result', async () => {
      await about('A search that matches nothing shows "0 items found" and "No results".');
      await pg.open(office.code);
      const n = await pg.search('left', SEARCH.noMatch);
      await verify('0 items and a No results message', async () => {
        expect(n).toBe(0);
        expect(await pg.getRowCount('left')).toBe(0);
        expect(await pg.showsNoResults('left')).toBe(true);
      });
      await phase('Clear the search', () => pg.search('left', ''));
      await verify('Items return', async () => {
        expect(await pg.getCount('left')).toBeGreaterThan(0);
      });
    });

    test('TC-PRG-SRC-007: Special characters are treated as plain text', async () => {
      await about('Wildcards, SQL fragments and script tags are searched as plain text: no error, no script runs.');
      await pg.open(office.code);
      let dialogs = 0;
      pg.page.on('dialog', () => { dialogs += 1; });
      for (const term of SEARCH.special) {
        const n = await phase(`Search "${term}"`, () => pg.search('left', term));
        await verify(`"${term}" returns only literal matches`, async () => {
          expect(n).toBeGreaterThanOrEqual(0);
          if (n > 0) await expectEveryRowContains(term);
          expect(await pg.getRightPanelText()).toContain(TEXT.rightTitle);
        });
      }
      await verify('No script ran', async () => {
        expect(dialogs).toBe(0);
      });
    });

    test('TC-PRG-SRC-008: Very long search text', async () => {
      await about('A 300-character search returns no items and does not break the page.');
      await pg.open(office.code);
      const n = await pg.search('left', SEARCH.long);
      await verify('0 items, page intact', async () => {
        expect(n).toBe(0);
        expect(await pg.getRightPanelText()).toContain(TEXT.rightTitle);
        expect(await pg.isLeftPanelVisible()).toBe(true);
      });
    });

    test('TC-PRG-SRC-009: Product Groups search filters product groups', async () => {
      await about('Searching on the Product Groups tab filters product groups.');
      await pg.open(office.code);
      await requireProductGroups();
      const total = await pg.getCount('left');
      const n = await pg.search('left', SEARCH.productGroup);
      await verify(`Only product groups containing "${SEARCH.productGroup}"`, async () => {
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(total);
        await expectEveryRowContains(SEARCH.productGroup);
      });
    });

    test('TC-PRG-SRC-010: Switching tabs resets the search', async () => {
      await about('Switching between Packages and Product Groups clears the search box and shows the full list.');
      await pg.open(office.code);
      const total = await pg.getCount('left');
      await pg.search('left', SEARCH.partial);
      await phase('Switch to Product Groups', () => pg.switchTab('Product Groups'));
      await verify('The search box is empty on Product Groups', async () => {
        expect(await pg.getSearchValue('left')).toBe('');
      });
      await phase('Switch back to Packages', () => pg.switchTab('Packages'));
      await verify('The search box is empty and all packages show', async () => {
        expect(await pg.getSearchValue('left')).toBe('');
        expect(await pg.getCount('left')).toBe(total);
      });
    });

    // ---------------------------------------------------------------- left sort

    const isSorted = (values: (string | number)[], dir: 'asc' | 'desc'): boolean =>
      values.every((v, i) => i === 0 || (dir === 'asc'
        ? (typeof v === 'number' ? (values[i - 1] as number) <= v : String(values[i - 1]).localeCompare(String(v), 'en', { numeric: true, sensitivity: 'base' }) <= 0)
        : (typeof v === 'number' ? (values[i - 1] as number) >= v : String(values[i - 1]).localeCompare(String(v), 'en', { numeric: true, sensitivity: 'base' }) >= 0)));

    for (const [id, column, action] of [
      ['SRT-001', 'Name', 'Sort ascending'],
      ['SRT-002', 'Name', 'Sort descending'],
      ['SRT-003', 'Price', 'Sort ascending'],
      ['SRT-004', 'Price', 'Sort descending'],
    ] as const) {
      test(`TC-PRG-${id}: Left list: ${column} > ${action}`, async () => {
        await about(`Sorting the Packages list by ${column} (${action.replace('Sort ', '')}) orders the rows, and the order holds while scrolling.`);
        await pg.open(office.code);
        const menu = await phase(`Open the ${column} header menu`, () => pg.openHeaderMenu('left', column));
        await verify('The header menu offers sorting and hiding', async () => {
          expect(menu).toEqual([...TEXT.headerMenu]);
        });
        await pg.closeMenu();
        await phase(action, () => pg.headerMenuAction('left', column, action));
        const dir = action === 'Sort ascending' ? 'asc' : 'desc';
        const read = async () => {
          const rows = await pg.getRows('left', 30);
          return column === 'Price' ? rows.map((r) => parsePrice(r.price)) : rows.map((r) => r.name);
        };
        const top = await read();
        await attachNote('First rows', JSON.stringify(top.slice(0, 5)));
        await verify(`Rows are in ${dir} ${column} order${column === 'Price' ? ', compared as numbers' : ''}`, async () => {
          expect(top.length).toBeGreaterThan(1);
          expect(isSorted(top, dir)).toBe(true);
        });
        await phase('Scroll down', async () => { await pg.page.mouse.move(400, 600); await pg.page.mouse.wheel(0, 4_000); await pg.page.waitForTimeout(1_200); });
        await verify('The order holds on the newly loaded rows', async () => {
          expect(isSorted(await read(), dir)).toBe(true);
        });
      });
    }

    test('TC-PRG-SRT-005: Sort holds while searching and on the Product Groups tab', async () => {
      await about('A sort stays applied while searching, and product groups can be sorted by price too.');
      await pg.open(office.code);
      await pg.headerMenuAction('left', 'Price', 'Sort descending');
      await pg.search('left', SEARCH.partial);
      await verify('Search results stay sorted by price, highest first', async () => {
        const prices = (await pg.getRows('left', 30)).map((r) => parsePrice(r.price));
        expect(prices.length).toBeGreaterThan(1);
        expect(isSorted(prices, 'desc')).toBe(true);
      });
      await requireProductGroups();
      await pg.headerMenuAction('left', 'Price', 'Sort descending');
      await verify('Product groups sort by price, highest first', async () => {
        const prices = (await pg.getRows('left', 30)).map((r) => parsePrice(r.price));
        expect(isSorted(prices, 'desc')).toBe(true);
      });
    });

    // ---------------------------------------------------------------- left columns

    // Known failure: when the fix lands this reports "expected to fail, but passed" — then drop the .fail.
    test.fail('TC-PRG-COL-001: Left list: Hide column removes the column', {
      annotation: { type: 'known bug', description: 'Recorded bug: "Hide column" on the left list leaves the column in place. Fix lands with the next build; this case then flags it in regression.' },
    }, async () => {
      await about('Hiding the Price column of the left list removes it.');
      await pg.open(office.code);
      await verify('The Price header menu offers Sort ascending, Sort descending and Hide column', async () => {
        expect(await pg.openHeaderMenu('left', 'Price')).toEqual([...TEXT.headerMenu]);
      });
      await pg.closeMenu();
      await pg.headerMenuAction('left', 'Price', 'Hide column');
      await verify('Price is no longer a column of the left list', async () => {
        expect(await pg.getVisibleColumnNames('left')).toEqual(['Name']);
      });
    });

    test('TC-PRG-COL-002: Left list: resize a column', async () => {
      await about('Dragging the Name resize handle to the right widens the Name column.');
      await pg.open(office.code);
      const before = await pg.getColumnWidth('left', 'Name');
      await phase('Drag the Name resize handle 120 px right', () => pg.resizeColumn('left', 'name', 120));
      await verify('Name is about 120 px wider', async () => {
        const after = await pg.getColumnWidth('left', 'Name');
        expect(after - before).toBeGreaterThan(80);
      });
    });
  });
}
