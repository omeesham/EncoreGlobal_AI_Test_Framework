import { test, expect } from '../../src/fixtures/pages.fixture';
import { PriceGuidePage, GuideRow, parsePrice } from '../../src/pages/price-guide/price-guide.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import {
  PRICE_GUIDE_OFFICES,
  officeLabel,
  TEXT,
  ITEM_TYPE,
  RIGHT_COLUMNS,
  GRID_OPTION_COLUMNS,
  COLUMN_ID,
  MANY_ITEMS,
  SEARCH,
} from '../../src/data/price-guide/price-guide';

// Setup → Price Guide (NM-4128): building the recommendations list — add, delete, search, sort,
// columns, the unsaved-changes guard and print. Nothing here clicks Save, so no office data
// changes; unsaved edits are dropped when the next test opens the page.
// The recommendations column layout is kept in the browser, which the suite reuses across a
// worker's tests; every column case restores the default view, and open() checks it again.

test.describe.configure({ timeout: 240_000 });

const PRICE = /^\d{1,3}(,\d{3})*\.\d{2}$/;

for (const office of PRICE_GUIDE_OFFICES) {
  test.describe(`Price Guide — recommendations — ${officeLabel(office)}`, () => {
    let pg: PriceGuidePage;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      pg = new PriceGuidePage(authenticatedSession.page, config);
      await pg.open(office.code);
      // Every case starts from an empty grid; Save has never persisted anything, but a future fix
      // plus a manual session could leave rows behind.
      test.skip((await pg.getCount('right')) !== 0, `Office ${office.code} already has saved recommendations — run the cleanup first.`);
    });

    async function requireProductGroups(): Promise<void> {
      await pg.switchTab('Product Groups');
      test.skip((await pg.getCount('left')) === 0, `Office ${office.code} lists no product groups — nothing to exercise.`);
    }

    /** Adds the first three packages that have different prices; returns them in add order. */
    async function addThree(): Promise<GuideRow[]> {
      const rows = await pg.getRows('left', 30);
      const picked: number[] = [];
      for (let i = 0; i < rows.length && picked.length < 3; i++) {
        if (!picked.some((p) => rows[p]!.price === rows[i]!.price)) picked.push(i);
      }
      const added: GuideRow[] = [];
      for (const i of picked) added.push(await pg.addByDoubleClick(i));
      return added;
    }

    // ---------------------------------------------------------------- adding

    test('TC-PRG-ADD-001: Double-click a package adds it to recommendations', async () => {
      await about('Double-clicking a package in the left list adds it to the recommendations as a Package with its price.');
      const item = await phase('Double-click the first package', () => pg.addByDoubleClick(0));
      await verify('One recommendation with the same name, price and Item Type "Package"', async () => {
        expect(await pg.getCount('right')).toBe(1);
        expect(await pg.getRows('right')).toEqual([{ name: item.name, price: item.price, itemType: ITEM_TYPE.package }]);
      });
      await verify('Save is enabled and the package is still in the left list', async () => {
        expect(await pg.isSaveEnabled()).toBe(true);
        expect((await pg.getRows('left', 5)).map((r) => r.name)).toContain(item.name);
      });
    });

    test('TC-PRG-ADD-002: Double-click a product group adds it with Item Type "Product Group"', async () => {
      await about('Double-clicking a product group adds it as a Product Group with its price.');
      await requireProductGroups();
      const item = await pg.addByDoubleClick(0);
      await verify('One recommendation with Item Type "Product Group"', async () => {
        expect(await pg.getRows('right')).toEqual([{ name: item.name, price: item.price, itemType: ITEM_TYPE.productGroup }]);
        expect(await pg.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-PRG-ADD-003: Drag and drop a package onto the recommendations grid', async () => {
      await about('Dragging a package onto the empty recommendations grid adds it once.');
      const item = await phase('Drag the second package onto the grid', () => pg.addByDrag(1));
      await verify('Added once, as a Package', async () => {
        expect(await pg.getRows('right')).toEqual([{ name: item.name, price: item.price, itemType: ITEM_TYPE.package }]);
        expect(await pg.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-PRG-ADD-004: Drag and drop a product group onto the recommendations grid', async () => {
      await about('Dragging a product group onto the grid adds it once, as a Product Group.');
      await requireProductGroups();
      const item = await pg.addByDrag(1);
      await verify('Added once, as a Product Group', async () => {
        expect(await pg.getRows('right')).toEqual([{ name: item.name, price: item.price, itemType: ITEM_TYPE.productGroup }]);
      });
    });

    test('TC-PRG-ADD-005: Dropping outside the recommendations grid adds nothing', async () => {
      await about('Dropping a package back on the left list or on the page header adds nothing.');
      await phase('Drop a package on the left list', () => pg.dragLeftItemTo(2, 'left list'));
      await phase('Drop a package on the page header', () => pg.dragLeftItemTo(3, 'page header'));
      await verify('Nothing was added and Save stays disabled', async () => {
        expect(await pg.getCount('right')).toBe(0);
        expect(await pg.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-PRG-ADD-006: The same item cannot be added twice', async () => {
      await about('Adding a package that is already recommended — by double-click or drag — is ignored quietly: no duplicate row and no message (as designed, client 2026-10-07).');
      const item = await pg.addByDoubleClick(0);
      await phase('Double-click the same package again', () => pg.addByDoubleClick(0));
      await phase('Drag the same package onto the grid', () => pg.addByDrag(0));
      await verify('Still exactly one row for the package', async () => {
        expect(await pg.getCount('right')).toBe(1);
        expect((await pg.getRows('right')).map((r) => r.name)).toEqual([item.name]);
      });
      await verify('No message is shown', async () => {
        expect(await pg.page.locator('[data-sonner-toast]').count()).toBe(0);
      });
    });

    test('TC-PRG-ADD-007: Packages and product groups can be mixed in one list', async () => {
      await about('A package and a product group can sit in the same recommendations list, each with its own Item Type.');
      const pkg = await pg.addByDoubleClick(0);
      await requireProductGroups();
      const grp = await pg.addByDoubleClick(0);
      await verify('Both rows are listed with the right Item Type', async () => {
        const rows = await pg.getRows('right');
        expect(rows).toHaveLength(2);
        expect(rows).toEqual(expect.arrayContaining([
          { name: pkg.name, price: pkg.price, itemType: ITEM_TYPE.package },
          { name: grp.name, price: grp.price, itemType: ITEM_TYPE.productGroup },
        ]));
      });
    });

    test('TC-PRG-ADD-008: Price on the recommendation matches the source list', async () => {
      await about('Each recommendation shows exactly the price the left list shows, in the same format.');
      const added = await addThree();
      await verify('Prices match the left list for every added package', async () => {
        const rows = await pg.getRows('right');
        for (const a of added) {
          const r = rows.find((x) => x.name === a.name);
          expect(r, `recommendation "${a.name}"`).toBeTruthy();
          expect(r!.price).toBe(a.price);
          expect(r!.price).toMatch(PRICE);
        }
      });
    });

    test('TC-PRG-ADD-009: Add from filtered search results', async () => {
      await about('Double-clicking the third search result adds that exact item, not the third item of the full list.');
      await pg.search('left', 'Rear');
      const third = (await pg.getRows('left', 3))[2]!;
      await pg.addByDoubleClick(2);
      await verify(`"${third.name}" was added`, async () => {
        expect((await pg.getRows('right')).map((r) => r.name)).toEqual([third.name]);
      });
    });

    // No limit on recommendations (client, 2026-10-06); the epic's 50 applies to Sales Lists.
    test('TC-PRG-ADD-010: Many recommendations: no limit', async () => {
      await about('More than fifty distinct packages can be recommended: every one is listed and no limit message appears.');
      const added = new Set<string>();
      // The list renders a screenful at a time, so distinct packages are taken from several searches.
      for (const term of ['(#1', '(#2', '(#3', '(#4']) {
        if (added.size >= MANY_ITEMS) break;
        await pg.search('left', term);
        const rows = await pg.getRows('left', 25);
        for (let i = 0; i < rows.length && added.size < MANY_ITEMS; i++) {
          if (added.has(rows[i]!.name)) continue;
          await pg.addByDoubleClick(i);
          added.add(rows[i]!.name);
        }
      }
      await verify(`All ${MANY_ITEMS} distinct packages are listed`, async () => {
        expect(added.size).toBe(MANY_ITEMS);
        expect(await pg.getCount('right')).toBe(MANY_ITEMS);
      });
      await verify('No limit message is shown', async () => {
        expect(await pg.page.locator('[data-sonner-toast]').count()).toBe(0);
      });
    });

    // ---------------------------------------------------------------- recommendations grid

    test('TC-PRG-REC-001: Delete removes one recommendation', async () => {
      await about('The trash icon removes that one recommendation straight away, and the item can be added again.');
      const added = await addThree();
      await phase(`Delete "${added[0]!.name}"`, () => pg.deleteRecommendation(added[0]!.name));
      await verify('Two remain, the deleted one is gone, Save is enabled', async () => {
        expect(await pg.getCount('right')).toBe(2);
        expect((await pg.getRows('right')).map((r) => r.name)).not.toContain(added[0]!.name);
        expect(await pg.isSaveEnabled()).toBe(true);
      });
      await phase('Add the deleted package again', () => pg.addByDoubleClick(added[0]!.name));
      await verify('It is back', async () => {
        expect(await pg.getCount('right')).toBe(3);
      });
    });

    test('TC-PRG-REC-002: Deleting every recommendation shows the empty state', async () => {
      await about('Removing every recommendation brings back the "No recommendations yet" empty state.');
      await addThree();
      await phase('Delete all three rows', () => pg.deleteAllRecommendations());
      await verify('0 items and the empty state', async () => {
        expect(await pg.getCount('right')).toBe(0);
        expect(await pg.isEmptyStateVisible()).toBe(true);
      });
    });

    test('TC-PRG-REC-003: Save is enabled only while there are unsaved changes', async () => {
      await about('Save turns on when the list changes and off again when the change is undone.');
      await verify('Save starts disabled', async () => { expect(await pg.isSaveEnabled()).toBe(false); });
      const item = await pg.addByDoubleClick(0);
      await verify('Adding enables Save', async () => { expect(await pg.isSaveEnabled()).toBe(true); });
      await pg.deleteRecommendation(item.name);
      await verify('Removing it again (back to the saved list) disables Save', async () => { expect(await pg.isSaveEnabled()).toBe(false); });
    });

    test('TC-PRG-REC-004: Search recommendations by name', async () => {
      await about('Searching the recommendations by part of a name shows only the matching rows.');
      const added = await addThree();
      const term = added[0]!.name.slice(0, 12);
      const n = await pg.search('right', term);
      await verify(`Only recommendations containing "${term}"`, async () => {
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThanOrEqual(3);
        for (const r of await pg.getRows('right')) expect(r.name.toLowerCase()).toContain(term.toLowerCase());
      });
      await pg.search('right', '');
      await verify('All three return', async () => { expect(await pg.getCount('right')).toBe(3); });
    });

    // Accepted by the client (2026-10-06): a no-match search shows the empty-list message.
    test('TC-PRG-REC-005: Search with no match shows 0 items and the empty-list message', async () => {
      await about('A recommendations search that matches nothing shows "0 items found" with the "No recommendations yet" message, and clearing it brings every recommendation back.');
      await addThree();
      await pg.search('right', SEARCH.noMatch);
      await verify('0 items found and "No recommendations yet"', async () => {
        expect(await pg.getCount('right')).toBe(0);
        expect(await pg.isEmptyStateVisible()).toBe(true);
      });
      await pg.search('right', '');
      await verify('Clearing the search lists all three again', async () => {
        expect(await pg.getCount('right')).toBe(3);
        expect(await pg.isEmptyStateVisible()).toBe(false);
      });
    });

    const sortCases: [string, 'Name' | 'Price' | 'Item Type', (r: GuideRow) => string | number][] = [
      ['REC-006', 'Name', (r) => r.name],
      ['REC-007', 'Price', (r) => parsePrice(r.price)],
      ['REC-008', 'Item Type', (r) => r.itemType ?? ''],
    ];
    for (const [id, column, key] of sortCases) {
      test(`TC-PRG-${id}: Recommendations: sort by ${column}`, async () => {
        await about(`Sorting the recommendations by ${column} orders them ascending, then descending.`);
        await pg.addByDoubleClick(0);
        await pg.addByDoubleClick(1);
        if (column !== 'Name') {
          // A product group (price and type differ from packages) makes Price and Item Type sorts observable.
          await pg.switchTab('Product Groups');
          if ((await pg.getCount('left')) > 0) await pg.addByDoubleClick(0);
          await pg.switchTab('Packages');
        }
        const cmp = (a: string | number, b: string | number) => (typeof a === 'number' ? a - (b as number) : String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' }));
        for (const [action, dir] of [['Sort ascending', 1], ['Sort descending', -1]] as const) {
          await pg.headerMenuAction('right', column, action);
          const values = (await pg.getRows('right')).map(key);
          await attachNote(`${action} by ${column}`, JSON.stringify(values));
          await verify(`${action} by ${column}`, async () => {
            expect(values.length).toBeGreaterThan(1);
            expect(values.every((v, i) => i === 0 || dir * cmp(values[i - 1]!, v) <= 0)).toBe(true);
          });
        }
      });
    }

    test('TC-PRG-REC-009: Recommendations stay when switching between Packages and Product Groups', async () => {
      await about('Switching the left tab does not touch the recommendations being built.');
      const item = await pg.addByDoubleClick(0);
      await pg.switchTab('Product Groups');
      await pg.switchTab('Packages');
      await verify('The package is still listed and Save is still enabled', async () => {
        expect((await pg.getRows('right')).map((r) => r.name)).toEqual([item.name]);
        expect(await pg.isSaveEnabled()).toBe(true);
      });
    });

    // ---------------------------------------------------------------- recommendations columns

    test('TC-PRG-COL-003: Grid Options lists the columns with check marks', async () => {
      await about('Grid Options offers "Reset to Default View" and a ticked entry for each visible column.');
      const opts = await pg.getGridOptions();
      await attachNote('Grid Options column labels (the menu says "ItemType" where the header says "Item Type" — accepted)', JSON.stringify(opts.columns));
      await verify('Reset is offered and all three columns are ticked', async () => {
        expect(opts.reset).toBe(true);
        expect(opts.columns.map((c) => c.label)).toEqual([...GRID_OPTION_COLUMNS]);
        expect(opts.columns.every((c) => c.checked)).toBe(true);
      });
    });

    test('TC-PRG-COL-004: Hide a column from its header and bring it back from Grid Options', async () => {
      await about('A column hidden from its header menu shows as unticked in Grid Options, and ticking it brings it back in place.');
      try {
        await addThree();
        await pg.headerMenuAction('right', 'Price', 'Hide column');
        await verify('Price is hidden and unticked', async () => {
          expect(await pg.getVisibleColumnNames('right')).toEqual(['Name', 'Item Type']);
          expect((await pg.getGridOptions()).columns.find((c) => c.label === 'Price')?.checked).toBe(false);
        });
        await pg.toggleGridColumn('Price');
        await verify('Price is back between Name and Item Type', async () => {
          expect(await pg.getVisibleColumnNames('right')).toEqual([...RIGHT_COLUMNS]);
        });
      } finally {
        await pg.ensureDefaultView();
      }
    });

    // Known failure: when the fix lands this reports "expected to fail, but passed" — then drop the .fail.
    test.fail('TC-PRG-COL-005: The last visible column cannot be hidden', {
      annotation: { type: 'known bug', description: 'Recorded bug: every column can be unticked, leaving a grid with no columns. Fix expected in E2E within a week; this case then flags it in regression.' },
    }, async () => {
      await about('Grid Options keeps at least one column visible.');
      try {
        await addThree();
        for (const c of GRID_OPTION_COLUMNS) await pg.toggleGridColumn(c);
        await verify('At least one column remains', async () => {
          expect((await pg.getVisibleColumnNames('right')).length).toBeGreaterThan(0);
        });
      } finally {
        await pg.ensureDefaultView();
      }
    });

    test('TC-PRG-COL-006: Reset to Default View restores the columns', async () => {
      await about('After hiding columns and resizing, Reset to Default View brings back the default columns and widths.');
      try {
        await addThree();
        const width = await pg.getColumnWidth('right', 'Name');
        await pg.headerMenuAction('right', 'Price', 'Hide column');
        await pg.headerMenuAction('right', 'Item Type', 'Hide column');
        await pg.resizeColumn('right', COLUMN_ID.Name, -150);
        await verify('Layout changed', async () => {
          expect(await pg.getVisibleColumnNames('right')).toEqual(['Name']);
        });
        await pg.resetDefaultView();
        await verify('Default columns, in order, at the default Name width', async () => {
          expect(await pg.getVisibleColumnNames('right')).toEqual([...RIGHT_COLUMNS]);
          expect(Math.abs((await pg.getColumnWidth('right', 'Name')) - width)).toBeLessThan(5);
        });
      } finally {
        await pg.ensureDefaultView();
      }
    });

    test('TC-PRG-COL-007: Column layout is remembered after reload', async () => {
      await about('A hidden recommendations column stays hidden after a reload, until the view is reset.');
      try {
        await pg.headerMenuAction('right', 'Item Type', 'Hide column');
        await pg.reload();
        await verify('Item Type is still hidden after reload', async () => {
          expect(await pg.getVisibleColumnNames('right')).toEqual(['Name', 'Price']);
        });
        await pg.resetDefaultView();
        await verify('Reset brings it back', async () => {
          expect(await pg.getVisibleColumnNames('right')).toEqual([...RIGHT_COLUMNS]);
        });
      } finally {
        await pg.ensureDefaultView();
      }
    });

    test('TC-PRG-COL-008: Resize a recommendations column', async () => {
      await about('Dragging the Price resize handle to the right widens Price.');
      try {
        await addThree();
        const before = await pg.getColumnWidth('right', 'Price');
        await pg.resizeColumn('right', COLUMN_ID.Price, 120);
        await verify('Price is about 120 px wider', async () => {
          expect((await pg.getColumnWidth('right', 'Price')) - before).toBeGreaterThan(80);
        });
      } finally {
        await pg.resetDefaultView();
      }
    });

    test('TC-PRG-COL-009: Reorder columns with the header grip', async () => {
      await about('Dragging the Item Type header by its grip in front of Name moves it to the first position.');
      try {
        await addThree();
        await pg.dragColumnHeader('right', 'Item Type', 'Name');
        await verify('Item Type is now first', async () => {
          expect(await pg.getVisibleColumnNames('right')).toEqual(['Item Type', 'Name', 'Price']);
        });
      } finally {
        await pg.resetDefaultView();
      }
    });

    // ---------------------------------------------------------------- unsaved changes

    test('TC-PRG-UNS-001: Leaving with unsaved changes asks to Stay or Discard', async () => {
      await about('Leaving the page with unsaved recommendations asks first; Stay keeps the user on the page with the changes intact.');
      const item = await pg.addByDoubleClick(0);
      await pg.clickSidebarHome();
      await verify('The Unsaved changes dialog explains the risk', async () => {
        expect(await pg.isUnsavedDialogVisible()).toBe(true);
        const text = await pg.getUnsavedDialogText();
        expect(text).toContain(TEXT.unsavedTitle);
        expect(text).toContain(TEXT.unsavedBody);
      });
      await pg.stay();
      await verify('Still on Price Guide with the change and Save enabled', async () => {
        expect(pg.getUrlPath()).toContain('/settings/price-guide');
        expect((await pg.getRows('right')).map((r) => r.name)).toEqual([item.name]);
        expect(await pg.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-PRG-UNS-002: Discard leaves the page and drops the changes', async () => {
      await about('Discard leaves the page, and the unsaved recommendation is gone when the page is opened again.');
      await pg.addByDoubleClick(0);
      await pg.clickSidebarHome();
      await pg.discard();
      await verify('The Home page opened', async () => {
        await pg.page.waitForURL(/\/home$/, { timeout: 30_000 });
      });
      await pg.open(office.code);
      await verify('No recommendation was kept', async () => {
        expect(await pg.getCount('right')).toBe(0);
      });
    });

    test('TC-PRG-UNS-003: Reload or closing the tab warns about unsaved changes', async () => {
      await about('Reloading the tab with unsaved recommendations triggers the browser leave-page warning; cancelling keeps the page.');
      const item = await pg.addByDoubleClick(0);
      const dialog = await pg.reloadAndCatchWarning();
      await verify('The browser asked before leaving', async () => {
        expect(dialog).toBe('beforeunload');
      });
      await verify('Cancelling kept the page and the change', async () => {
        expect((await pg.getRows('right')).map((r) => r.name)).toEqual([item.name]);
      });
    });

    test('TC-PRG-UNS-004: No warning when nothing changed', async () => {
      await about('With nothing changed — or a change undone — leaving the page asks nothing.');
      await pg.clickSidebarHome();
      await verify('Home opened with no dialog', async () => {
        expect(await pg.isUnsavedDialogVisible()).toBe(false);
        await pg.page.waitForURL(/\/home$/, { timeout: 30_000 });
      });
      await pg.open(office.code);
      const item = await pg.addByDoubleClick(0);
      await pg.deleteRecommendation(item.name);
      await pg.clickSidebarHome();
      await verify('Add-then-remove leaves without a dialog', async () => {
        expect(await pg.isUnsavedDialogVisible()).toBe(false);
        await pg.page.waitForURL(/\/home$/, { timeout: 30_000 });
      });
    });

    test('TC-PRG-UNS-005: Switching office with unsaved changes warns first', async () => {
      await about('Picking another office in the location switcher with unsaved recommendations asks before leaving.');
      const other = PRICE_GUIDE_OFFICES.find((o) => o.code !== office.code)!;
      await pg.addByDoubleClick(0);
      await pg.switchOffice(other.code);
      await verify('The Unsaved changes dialog appears before the office changes', async () => {
        expect(await pg.isUnsavedDialogVisible()).toBe(true);
        expect(pg.getUrlPath()).toContain(`/locations/${office.code}/`);
      });
      await pg.discard();
      await verify(`The app moves to office ${other.code}`, async () => {
        await pg.page.waitForURL(new RegExp(`/locations/${other.code}/`), { timeout: 30_000 });
      });
    });

    // ---------------------------------------------------------------- print

    test('TC-PRG-PRT-001: Print opens the browser print dialog', async () => {
      await about('Print sends the recommendations to the browser print dialog.');
      await addThree();
      const calls = await pg.clickPrint();
      await verify('The print dialog was opened once', async () => {
        expect(calls).toBe(1);
      });
    });

    test('TC-PRG-PRT-002: Print with no recommendations', async () => {
      await about('With no recommendations, Print is either unavailable or still opens without an error.');
      const calls = await pg.clickPrint();
      await attachNote('Print with an empty list', calls === -1 ? 'Print is disabled' : `print dialog opened ${calls} time(s)`);
      await verify('No error, page intact', async () => {
        expect([-1, 1]).toContain(calls);
        expect(await pg.isEmptyStateVisible()).toBe(true);
      });
    });

    test('TC-PRG-PRT-003: Print respects the search filter and hidden columns', async () => {
      await about('Printing with a search and a hidden column opens the print dialog; what the printout holds is recorded for the client.');
      try {
        const added = await addThree();
        await pg.search('right', added[0]!.name.slice(0, 12));
        await pg.headerMenuAction('right', 'Item Type', 'Hide column');
        const shown = await pg.getRowCount('right');
        const view = await pg.getPrintView();
        await attachNote('Print with filter and hidden column', JSON.stringify({ rowsOnScreen: shown, view }));
        const calls = await pg.clickPrint();
        await verify('The print dialog opened', async () => { expect(calls).toBe(1); });
      } finally {
        await pg.ensureDefaultView();
      }
    });
  });
}
