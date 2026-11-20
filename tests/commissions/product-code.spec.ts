import { test, expect } from '../../src/fixtures/pages.fixture';
import { ProductCodePage, Row } from '../../src/pages/commissions/product-code.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import {
  OFFICE, OFFICE_NAME, COUNTRY_OFFICES, EDIT_OFFICE, COPY_OFFICE, LEVELS, TREE, CHILD_LEVEL, GRID_COLUMNS, RESIZABLE_COLUMNS, HISTORY_COLUMNS, PAGE_SIZES, SEARCHES,
  LITERAL_SEARCHES, VALID_ENTRIES, STRIPPED_ENTRIES, BELOW_ONE, OVER_100, BAD_PAGE_NUMBERS, EXPORT, TEXT,
} from '../../src/data/commissions/product-code';
import type { GridColumn } from '../../src/data/commissions/product-code';

// Commissions → Product Code (NM-3349): search an office's product codes and set a commission on any level of
// the product tree (Category > Sub Category > Class > Sub Class > Item), optionally passed down to every child
// (Propagate), then copy it to other offices. The corporate office (1101) picks the office through Change Local
// Office and edits; a local office opened on its own only views. Covered: opening (1101, the three country
// offices), the search criteria, Change Local Office, the grid (sorting, columns, paging, tooltips), the edit
// dialog and its Comm % field, saving with and without Propagate, Copy to Location(s), History, both exports
// and the keyboard. Saving cases change 1606 (and Copy 2359) and put every commission back on its default.

test.describe.configure({ timeout: 240_000 });

const pct = (shown: string): number => Number.parseFloat(shown.replace(/[^\d.]/g, ''));
/** Today as History shows it (MM/DD/YYYY), in the browser's time zone. */
const today = (): string => new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' });
const ordered = (values: string[], dir: 'ascending' | 'descending'): string[] =>
  [...values].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }) * (dir === 'ascending' ? 1 : -1));

test.describe('Product Code Commission @commissions', () => {
  let pc: ProductCodePage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    pc = new ProductCodePage(authenticatedSession.page, config);
  });

  /** Opens the Sub Class of the "Stingers" row on the edit office, from 1101. */
  const openSubClass = async (level: (typeof LEVELS)[number] = 'Sub Class'): Promise<void> => {
    await pc.openOffice(EDIT_OFFICE.code, TREE.search);
    // Use Default Commission filters both ways: ticked lists only items on the default, unticked only
    // items with their own commission. A test interrupted between its save and its reset (e.g. a network
    // drop) leaves Stingers on its own commission, which would hide it from every later test — so look
    // there too rather than fail them all.
    if ((await pc.rows()).length === 0) await pc.search({ any: TREE.search, useDefault: false });
    await pc.openLevel(level);
  };

  test.describe('A. Page load', () => {
    test('TC-COM-PCC-001: Without a session the page sends the user to sign in', { tag: '@C108011' }, async ({ browser, config }) => {
      await about('Opening the page with no signed-in session lands on the sign-in page, which returns to this page afterwards.');
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await context.newPage();
        const path = `/locations/${OFFICE}/commissions/product-code`;
        await phase('Open the page without signing in', () => page.goto(`${config.base_url.replace(/\/+$/, '')}${path}`));
        await verify('The sign-in page, with this page as the return address', async () => {
          await expect(page).toHaveURL(/\/auth\/sign-in\?callbackUrl=/, { timeout: 30_000 });
          expect(decodeURIComponent(new URL(page.url()).searchParams.get('callbackUrl') ?? '')).toBe(path);
          await expect(page).toHaveTitle(TEXT.signInTitle);
        });
      } finally {
        await context.close();
      }
    });

    test('TC-COM-PCC-002: The Commissions menu opens Product Code Commission on Basic Information', { tag: '@C108012' }, async () => {
      await about(`The Commissions menu lists ${TEXT.menuItems.join(', ')}; Product Code opens "${TEXT.heading}" with its two tabs, Basic Information selected.`);
      const items = await pc.openFromMenu(OFFICE);
      const head = await pc.heading();
      await verify('Menu items, page title, heading and tabs', async () => {
        expect(items).toEqual(expect.arrayContaining([...TEXT.menuItems]));
        expect(head).toEqual({ heading: true, title: TEXT.pageTitle, tabs: [...TEXT.tabs], selected: TEXT.tabs[0] });
      });
    });

    test('TC-COM-PCC-003: The first view shows the search criteria and an empty grid', { tag: '@C108013' }, async () => {
      await about(`On ${OFFICE}: Local Office ${OFFICE_NAME} (changeable), Any Field empty, Use Default Commission ticked, Include Inactive unticked, Reset and Search; the grid shows "0 items found", its columns, "${TEXT.noResults}" and page 1 of 1 with every page button off.`);
      await pc.open(OFFICE);
      const criteria = await pc.criteria();
      await verify('Criteria, grid and pager', async () => {
        expect(criteria).toEqual({ office: OFFICE_NAME, changeable: true, any: '', useDefault: true, inactive: false });
        await expect(pc.main.getByText(TEXT.criteria, { exact: true })).toBeVisible();
        for (const b of ['Reset', 'Search', 'Export', 'Grid Options']) await expect.soft(pc.button(b), b).toBeEnabled();
        expect(await pc.countText()).toBe('0 items found');
        expect(await pc.columns()).toEqual([...GRID_COLUMNS]);
        await expect(pc.main.getByText(TEXT.noResults, { exact: true })).toBeVisible();
        expect(await pc.pager()).toEqual({ page: '1', pages: 1, first: false, previous: false, next: false, last: false });
      });
    });

    test('TC-COM-PCC-004: The information icon explains the page, by mouse and by keyboard', { tag: '@C108014' }, async () => {
      await about(`Hovering or focusing the (i) next to the heading shows "${TEXT.info}".`);
      await pc.open(OFFICE);
      const tips = [await pc.infoTooltip('hover'), await pc.infoTooltip('focus')];
      await verify('The same tooltip both ways', async () => expect(tips).toEqual([TEXT.info, TEXT.info]));
    });

    for (const office of COUNTRY_OFFICES) {
      test.describe(`${office.country} ${office.code}`, () => {
        test(`${office.tc}: Opened on ${office.code}, the page lists its product codes and only views them`, { tag: office.tag }, async () => {
          await about(`On ${office.code} the office is fixed (${office.name}), Search lists its product codes (the first 1001, with "${TEXT.limit}"), there is no Export, and a level's dialog has every box, Save and Copy to Location(s) off.`);
          await pc.open(office.code);
          const criteria = await pc.criteria();
          await pc.search();
          const rows = await pc.rows();
          await pc.openLevel('Sub Class');
          const dialog = await pc.dialogView();
          await verify('Fixed office, rows of this office, no Export, view-only dialog', async () => {
            expect(criteria).toMatchObject({ office: office.name, changeable: false });
            expect(await pc.countText()).toBe('1,001 items found');
            await expect(pc.main.getByText(TEXT.limit)).toBeVisible();
            for (const r of rows) expect.soft(r['Local Office ID'], 'office').toBe(office.code);
            await expect(pc.button('Export')).toHaveCount(0);
            expect(dialog).toMatchObject({ save: false, copy: false, segment: { editable: false, useDefault: true, propagate: true } });
          });
        });
      });
    }

    test.describe(`Corporate office ${OFFICE}`, () => {
      test('TC-COM-PCC-008: The corporate office itself has no product codes', { tag: '@C108018' }, async () => {
        await about(`Searching ${OFFICE} itself, with and without Use Default Commission, finds nothing.`);
        await pc.open(OFFICE);
        const found: string[] = [];
        for (const useDefault of [true, false]) { await pc.search({ useDefault }); found.push(await pc.countText()); }
        await verify('0 items both ways', async () => expect(found).toEqual(['0 items found', '0 items found']));
      });
    });
  });

  test.describe('B. Search', () => {
    test('TC-COM-PCC-009: Searching an office lists its active items on the default commission, up to 1001', { tag: '@C108019' }, async () => {
      await about(`From ${OFFICE}, picking ${EDIT_OFFICE.code} and searching sends the criteria and lists the first 1001 items with "${TEXT.limit}", ten to a page (101 pages), each on 0.00 % with Use Default Commission ticked.`);
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      const sent = await pc.search();
      const rows = await pc.rows();
      await verify('Criteria sent, 1001 rows, limit message', async () => {
        expect(sent).toEqual({ locationNo: EDIT_OFFICE.code, anyField: '', useDefaultCommission: true, includeInactive: false, culture: 'en-US' });
        expect(await pc.countText()).toBe('1,001 items found');
        await expect(pc.main.getByText(TEXT.limit)).toBeVisible();
        expect((await pc.pager()).pages).toBe(101);
        expect(rows).toHaveLength(10);
        for (const r of rows) expect.soft(r, r.Item).toMatchObject({ 'Local Office ID': EDIT_OFFICE.code, Commission: '0.00 %', 'Use Default Commission': '✓' });
      });
    });

    test('TC-COM-PCC-010: Any Field finds an item and shows its whole product tree; Enter searches too', { tag: '@C108020' }, async () => {
      await about(`"${SEARCHES.one}" finds one row: ${LEVELS.map((l) => TREE[l]).join(' > ')}; Enter in Any Field searches too ("${SEARCHES.inactive.term}": ${SEARCHES.inactive.active} rows).`);
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      await pc.search({ any: SEARCHES.one });
      const byClick = await pc.rows();
      const sent = await pc.search({ any: SEARCHES.inactive.term }, 'enter');
      await verify('One row with its tree; Enter searches', async () => {
        expect(byClick).toEqual([expect.objectContaining({ ...Object.fromEntries(LEVELS.map((l) => [l, TREE[l]])), Description: TREE.Item })]);
        expect(sent?.anyField).toBe(SEARCHES.inactive.term);
        expect(await pc.count()).toBe(SEARCHES.inactive.active);
      });
    });

    test('TC-COM-PCC-011: Any Field ignores letter case and the spaces around the text', { tag: '@C108021' }, async () => {
      await about(`"${SEARCHES.one.toLowerCase()}", "${SEARCHES.one.toUpperCase()}" and " ${SEARCHES.one} " find the same row as "${SEARCHES.one}".`);
      await pc.openOffice(EDIT_OFFICE.code, SEARCHES.one);
      const found: Record<string, string> = {};
      for (const q of [SEARCHES.one.toLowerCase(), SEARCHES.one.toUpperCase(), ` ${SEARCHES.one} `]) { await pc.search({ any: q }); found[q] = (await pc.rows()).map((r) => r.Item).join(); }
      await verify('The same item each time', async () => { for (const [q, item] of Object.entries(found)) expect.soft(item, `"${q}"`).toBe(TREE.Item); });
    });

    test('TC-COM-PCC-012: A search that matches nothing shows no rows', { tag: '@C108022' }, async () => {
      await about(`"${SEARCHES.none}" shows "0 items found", "${TEXT.noResults}" and page 1 of 1.`);
      await pc.openOffice(EDIT_OFFICE.code, SEARCHES.none);
      await verify('No rows', async () => {
        expect(await pc.countText()).toBe('0 items found');
        await expect(pc.main.getByText(TEXT.noResults, { exact: true })).toBeVisible();
        expect((await pc.pager()).pages).toBe(1);
      });
    });

    test('TC-COM-PCC-013: Wildcard and quote characters are searched as text', { tag: '@C108023' }, async () => {
      await about(`${LITERAL_SEARCHES.map((q) => `"${q}"`).join(', ')} each find only rows holding that character, without an error.`);
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      const found: Record<string, Row[]> = {};
      for (const q of LITERAL_SEARCHES) { await pc.search({ any: q }); await pc.setPageSize('50'); found[q] = await pc.rows(); }
      await verify('Rows holding the character', async () => {
        for (const [q, rows] of Object.entries(found)) {
          expect.soft(rows.length, `"${q}" finds rows`).toBeGreaterThan(0);
          for (const r of rows) expect.soft(Object.values(r).join(' '), `"${q}"`).toContain(q);
        }
        expect(await pc.toasts()).toEqual([]);
      });
    });

    test('TC-COM-PCC-014: Any Field finds a name written with a hyphen', { tag: '@C108024' }, async () => {
      await about(`Part of an item name that holds " - " ("Stingers - Royalty") finds that item, as "${SEARCHES.one}" does.`);
      await pc.openOffice(EDIT_OFFICE.code, 'Stingers - Royalty');
      await verify(`The item ${TREE.Item}`, async () => expect((await pc.rows()).map((r) => r.Item)).toEqual([TREE.Item]));
    });

    test('TC-COM-PCC-015: Include Inactive adds the inactive items', { tag: '@C108025' }, async () => {
      await about(`"${SEARCHES.inactive.term}" finds ${SEARCHES.inactive.active} active items, and ${SEARCHES.inactive.all} with Include Inactive ticked; the request says so.`);
      await pc.openOffice(EDIT_OFFICE.code, SEARCHES.inactive.term);
      const active = await pc.count();
      const sent = await pc.search({ inactive: true });
      await verify('More rows with inactive items', async () => {
        expect([active, await pc.count()]).toEqual([SEARCHES.inactive.active, SEARCHES.inactive.all]);
        expect(sent?.includeInactive).toBe(true);
      });
    });

    test('TC-COM-PCC-016: With Use Default Commission unticked only rows off the default are listed', { tag: '@C108026' }, async () => {
      await about(`On ${EDIT_OFFICE.code}, where every commission is on its default, unticking Use Default Commission lists nothing and sends useDefaultCommission false.`);
      await pc.openOffice(EDIT_OFFICE.code);
      const sent = await pc.search({ useDefault: false });
      await verify('No rows off the default', async () => {
        expect(sent?.useDefaultCommission).toBe(false);
        expect(await pc.countText()).toBe('0 items found');
      });
    });

    test('TC-COM-PCC-017: Reset puts back the first view', { tag: '@C108027' }, async () => {
      await about(`After a search on ${EDIT_OFFICE.code} with every criterion changed, Reset returns to ${OFFICE_NAME}, empty Any Field, Use Default ticked, Include Inactive unticked and no rows.`);
      await pc.openOffice(EDIT_OFFICE.code, SEARCHES.inactive.term);
      await pc.search({ useDefault: false, inactive: true });
      await pc.reset();
      await verify('First view again', async () => {
        expect(await pc.criteria()).toEqual({ office: OFFICE_NAME, changeable: true, any: '', useDefault: true, inactive: false });
        expect(await pc.countText()).toBe('0 items found');
      });
    });

    test('TC-COM-PCC-018: When the search fails, a message shows and the grid is empty', { tag: '@C108028' }, async () => {
      await about(`With the search failing, "${TEXT.loadFailed[500]}" (server error) or "${TEXT.loadFailed.network}" (no connection) shows and the grid lists nothing.`);
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      for (const how of [500, 'network'] as const) {
        const undo = await pc.fail('search', how);
        try {
          const seen = await pc.watchToasts();
          await pc.search({ any: how === 500 ? SEARCHES.one : SEARCHES.inactive.term });
          await verify(`${how}: message, no rows`, async () => {
            // The network message carries the host, e.g. "Failed to fetch (cloudapps-e2e...)".
            await expect.poll(async () => (await seen()).some((t) => t.includes(TEXT.loadFailed[how]))).toBe(true);
            expect(await pc.rows()).toEqual([]);
          });
        } finally {
          await undo();
        }
      }
    });
  });

  test.describe('C. Change Local Office', () => {
    test('TC-COM-PCC-019: The dialog shows the current office, a filter, a search, All Locations and the office list', { tag: '@C108029' }, async () => {
      await about(`Change Local Office names ${OFFICE_NAME} as current, has Active/Inactive ticked, "${TEXT.pickerSearch}", Local Office and Local Office Name columns, an "${TEXT.allLocations}" row and ${OFFICE} ticked; Select is on.`);
      await pc.open(OFFICE);
      await pc.openPicker();
      const info = await pc.pickerInfo();
      await verify('Dialog contents', async () => {
        expect(info).toEqual({ current: OFFICE_NAME, activeTicked: true, placeholder: TEXT.pickerSearch, columns: ['Local Office', 'Local Office Name'], checked: [OFFICE_NAME.replace(' - ', ' ')], select: true, allLocations: true });
        expect((await pc.pickerOffices()).length).toBeGreaterThan(1);
      });
    });

    test('TC-COM-PCC-020: Search finds offices by number, part of a number or name in any case', { tag: '@C108030' }, async () => {
      await about(`"${EDIT_OFFICE.code}", "toronto hilton" and "TORONTO HILTON" find their office; "zzzz" shows "No results.".`);
      await pc.open(OFFICE);
      await pc.openPicker();
      const found: Record<string, string[]> = {};
      for (const q of [EDIT_OFFICE.code, 'toronto hilton', 'TORONTO HILTON', 'zzzz']) found[q] = await pc.searchOffices(q);
      await verify('Each search', async () => {
        expect.soft(found[EDIT_OFFICE.code]).toEqual([EDIT_OFFICE.name.replace(' - ', ' ')]);
        for (const q of ['toronto hilton', 'TORONTO HILTON']) expect.soft(found[q], q).toContain(COPY_OFFICE.name.replace(' - ', ' '));
        expect.soft(found.zzzz).toEqual(['No results.']);
      });
    });

    test('TC-COM-PCC-021: Unticking Active/Inactive adds the inactive offices', { tag: '@C108031' }, async () => {
      await about('Unticked, the list adds inactive offices (0000, 1099, 1100); ticked again, they go.');
      await pc.open(OFFICE);
      await pc.openPicker();
      const codes = async () => (await pc.pickerOffices()).map((o) => o.slice(0, 4));
      const active = await codes();
      await pc.toggleActiveFilter();
      const all = await codes();
      await pc.toggleActiveFilter();
      await verify('Inactive offices only while unticked', async () => {
        for (const o of ['0000', '1099', '1100']) expect.soft([active.includes(o), all.includes(o)], o).toEqual([false, true]);
        expect(await codes()).toEqual(active);
      });
    });

    test('TC-COM-PCC-022: Cancel, Close and Escape leave the office unchanged', { tag: '@C108032' }, async () => {
      await about(`With ${EDIT_OFFICE.code} ticked, each way of closing the dialog without Select keeps ${OFFICE_NAME}.`);
      await pc.open(OFFICE);
      for (const how of ['Cancel', 'Close', 'Escape'] as const) {
        await pc.openPicker();
        await pc.searchOffices(EDIT_OFFICE.code);
        await pc.tickOffice(EDIT_OFFICE.code);
        await pc.closePicker(how);
        await verify(`${how}: still ${OFFICE}`, async () => expect((await pc.criteria()).office).toBe(OFFICE_NAME));
      }
    });

    test('TC-COM-PCC-023: All Locations can be chosen to search every office', { tag: '@C108033' }, async () => {
      await about(`Clicking "${TEXT.allLocations}" and Select shows it as the Local Office; "${SEARCHES.one}" then finds the item in several offices. ${OFFICE} is picked again after.`);
      await pc.open(OFFICE);
      try {
        await pc.openPicker();
        await pc.button(TEXT.allLocations, pc.picker).click();
        if (await pc.picker.isVisible()) await pc.button('Select', pc.picker).click();
        await pc.picker.waitFor({ state: 'hidden' });
        const office = (await pc.criteria()).office;
        await pc.search({ any: SEARCHES.one });
        const offices = new Set((await pc.rows()).map((r) => r['Local Office ID']));
        await verify('All Locations chosen, rows from several offices', async () => {
          expect(office).toBe(TEXT.allLocations);
          expect(offices.size).toBeGreaterThan(1);
        });
      } finally {
        await pc.pickOffice(OFFICE);
      }
    });
  });

  test.describe('D. Grid', () => {
    test('TC-COM-PCC-024: Each row links every level of its product tree; the other cells are plain text', { tag: '@C108034' }, async () => {
      await about(`The "${TREE.search}" row offers Category, Sub Category, Class, Sub Class and Item as links; Local Office ID, Description, Commission and Use Default Commission are not links.`);
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      await verify('Five links, one per level', async () => expect(await pc.rowLinks()).toEqual(LEVELS.map((l) => TREE[l])));
    });

    test('TC-COM-PCC-025: Each column sorts both ways from its header menu', { tag: '@C108035' }, async () => {
      await about('Every header menu offers Sort ascending, Sort descending and Hide column; each text column orders the rows A to Z and Z to A ("Audio" search, all rows on one page).');
      await pc.openOffice(EDIT_OFFICE.code, 'Audio');
      await pc.setPageSize('50');
      const menus: string[][] = [];
      for (const c of GRID_COLUMNS) menus.push(await pc.headerMenuItems(c));
      const results: [string, string[], string[]][] = [];
      for (const c of GRID_COLUMNS.slice(1, 7)) {
        for (const dir of ['ascending', 'descending'] as const) {
          const got = (await pc.sort(c, dir)).map((r) => r[c]!);
          results.push([`${c} ${dir}`, got, ordered(got, dir)]);
        }
      }
      await verify('Menus and orders', async () => {
        for (const m of menus) expect.soft(m).toEqual(['Sort ascending', 'Sort descending', 'Hide column']);
        for (const [label, got, want] of results) expect.soft(got, label).toEqual(want);
      });
    });

    test('TC-COM-PCC-026: Columns can be hidden and shown, and Reset to Default View brings them all back', { tag: '@C108036' }, async () => {
      await about('Hide column on Description removes it and unticks it in Grid Options; unticking Class there hides it too; ticking Class shows it; Reset to Default View shows every column again.');
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      const options = await pc.gridOptions();
      await pc.hideColumn('Description');
      await pc.useGridOption('Class');
      const hidden = [await pc.columns(), await pc.gridOptions()];
      await pc.useGridOption('Class');
      const shown = await pc.columns();
      await pc.hideColumn('Class');
      await pc.useGridOption('Reset to Default View');
      await verify('Hidden, shown, reset', async () => {
        expect(options).toEqual([{ label: 'Reset to Default View', checked: false }, ...GRID_COLUMNS.map((label) => ({ label, checked: true }))]);
        expect(hidden[0]).toEqual(GRID_COLUMNS.filter((c) => !['Description', 'Class'].includes(c)));
        expect((hidden[1] as { label: string; checked: boolean }[]).filter((o) => !o.checked).map((o) => o.label)).toEqual(['Reset to Default View', 'Class', 'Description']);
        expect(shown).toEqual(GRID_COLUMNS.filter((c) => c !== 'Description'));
        expect(await pc.columns()).toEqual([...GRID_COLUMNS]);
      });
    });

    test('TC-COM-PCC-027: Only Class, Sub Class, Item and Description can be widened by dragging', { tag: '@C108037' }, async () => {
      await about(`Dragging each column's edge 80 px to the right widens ${RESIZABLE_COLUMNS.join(', ')}; the other columns keep their width (each is dragged back after).`);
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      const widths: [GridColumn, number, number][] = [];
      for (const c of GRID_COLUMNS) {
        const { before, after } = await pc.resizeColumn(c, 80);
        widths.push([c, before, after]);
        await pc.resizeColumn(c, -80);
      }
      await verify('Those four wider, the others not', async () => {
        for (const [c, before, after] of widths) {
          if (RESIZABLE_COLUMNS.includes(c)) expect.soft(after, `${c} wider`).toBeGreaterThan(before + 40);
          else expect.soft(after, `${c} not widened`).toBeLessThan(before + 40);
        }
      });
    });

    test('TC-COM-PCC-028: A column can be moved by dragging its grip', { tag: '@C108038' }, async () => {
      await about('Dragging Description\'s grip onto Category moves Description before Category; Reset to Default View puts it back.');
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      const moved = await pc.dragColumn('Description', 'Category');
      await pc.useGridOption('Reset to Default View');
      await verify('Moved, then back', async () => {
        expect(moved.indexOf('Description')).toBeLessThan(moved.indexOf('Category'));
        expect(await pc.columns()).toEqual([...GRID_COLUMNS]);
      });
    });

    test('TC-COM-PCC-029: Rows per page sets the rows shown and the page count', { tag: '@C108039' }, async () => {
      await about(`Rows per page offers ${PAGE_SIZES.join(', ')}; on 1001 rows each size shows that many rows and ceil(1001 / size) pages.`);
      await pc.openOffice(EDIT_OFFICE.code);
      const options = await pc.pageSizeOptions();
      const seen: [string, number, number][] = [];
      for (const size of [...PAGE_SIZES.slice(1), PAGE_SIZES[0]]) {
        await pc.setPageSize(size);
        seen.push([size, (await pc.rows()).length, (await pc.pager()).pages]);
      }
      await verify('Options, rows and pages', async () => {
        expect(options).toEqual([...PAGE_SIZES]);
        for (const [size, rows, pages] of seen) expect.soft([rows, pages], `size ${size}`).toEqual([Number(size), Math.ceil(1001 / Number(size))]);
      });
    });

    test('TC-COM-PCC-030: The page buttons and the page number move through the rows', { tag: '@C108040' }, async () => {
      await about(`First/previous are off on page 1; next, last, previous and first move as named; on the last page next/last are off; a typed page number opens that page; a number out of range or ${BAD_PAGE_NUMBERS.map((v) => `"${v}"`).join(', ')} is not taken.`);
      await pc.openOffice(EDIT_OFFICE.code);
      const start = await pc.pager();
      const first = JSON.stringify(await pc.rows());
      await pc.goToPage('next');
      const second = { ...(await pc.pager()), changed: JSON.stringify(await pc.rows()) !== first };
      await pc.goToPage('last');
      const last = { ...(await pc.pager()), rows: (await pc.rows()).length };
      await pc.goToPage('previous');
      const beforeLast = (await pc.pager()).page;
      await pc.goToPage('first');
      await pc.goToPage(start.pages + 5);
      const outOfRange = (await pc.pager()).page;
      await pc.goToPage(3);
      const typed = (await pc.pager()).page;
      const bad: string[] = [];
      for (const v of BAD_PAGE_NUMBERS) { await pc.goToPage(v); bad.push((await pc.pager()).page); }
      await verify('Pages and buttons', async () => {
        expect(start).toMatchObject({ page: '1', pages: 101, first: false, previous: false, next: true, last: true });
        expect(second).toMatchObject({ page: '2', first: true, previous: true, changed: true });
        expect(last).toMatchObject({ page: '101', next: false, last: false, rows: 1 });
        expect(beforeLast).toBe('100');
        expect(outOfRange).toBe('1');
        expect(typed).toBe('3');
        expect(bad).toEqual(BAD_PAGE_NUMBERS.map(() => '3'));
      });
    });

    test('TC-COM-PCC-031: A cut-off cell shows its full text on hover', { tag: '@C108041' }, async () => {
      await about(`The Item cell of the "${TREE.search}" row is too long for its column; hovering it shows "${TREE.Item}".`);
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      const cell = await pc.cellTooltip(0, 'Item');
      await verify('Cut off, full text in the tooltip', async () => expect(cell).toMatchObject({ cut: true, tip: TREE.Item }));
    });
  });

  test.describe('E. Edit dialog', () => {
    test('TC-COM-PCC-032: Each level opens its dialog with the segment and the segments under it', { tag: '@C108042' }, async () => {
      await about('Clicking Category, Sub Category, Class, Sub Class and Item in a row opens "Product Code Commission" with a section for that level (Name, Comm %, Use Default Commission, and Propagate except on Item) and one listing the level below.');
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      const seen: Record<string, Awaited<ReturnType<ProductCodePage['dialogView']>>> = {};
      for (const level of LEVELS) {
        await pc.openLevel(level);
        seen[level] = await pc.dialogView();
        await pc.closeDialog('Cancel');
      }
      await verify('Sections, segment and children per level', async () => {
        for (const level of LEVELS) {
          const v = seen[level]!;
          expect.soft(v.sections, level).toEqual([level, CHILD_LEVEL[level]].filter(Boolean));
          expect.soft(v.columns, level).toEqual(['Name', 'Comm %', 'Use Default Commission', ...(level === 'Item' ? [] : ['Propagate'])]);
          expect.soft(v.segment, level).toMatchObject({ name: TREE[level], comm: '0.00 %', useDefault: true, editable: true, propagate: level === 'Item' ? null : true });
          expect.soft(v.children.length > 0, `${level} lists children`).toBe(level !== 'Item');
        }
        expect(seen['Sub Class']!.children.map((c) => c.name)).toEqual([...TREE.items]);
        expect(seen.Class!.children.map((c) => c.name)).toEqual([...TREE.subClasses]);
      });
    });

    test('TC-COM-PCC-033: As opened, Save is off and Copy to Location(s) is on', { tag: '@C108043' }, async () => {
      await about('Before any change the dialog has Save off and Copy to Location(s) and Cancel on; Comm % is plain text.');
      await openSubClass();
      const view = await pc.dialogView();
      await verify('Save off, Copy on, Comm % not a field', async () => {
        expect([view.save, view.copy]).toEqual([false, true]);
        await expect(pc.dialog.locator('table').first().locator('input')).toHaveCount(0);
      });
    });

    test('TC-COM-PCC-034: Unticking Use Default Commission makes Comm % editable, turns Save on and Copy off', { tag: '@C108044' }, async () => {
      await about('After unticking, a click on Comm % turns it into a field; Save is on and Copy to Location(s) off. Ticking it again makes Comm % plain text again.');
      await openSubClass();
      await pc.setUseDefault(false);
      const unticked = await pc.dialogView();
      const field = await pc.commField();
      await pc.page.keyboard.press('Tab');
      await pc.setUseDefault(true);
      await verify('Editable while unticked', async () => {
        expect([unticked.save, unticked.copy]).toEqual([true, false]);
        expect(field.type).toBe('text');
        await pc.dialog.locator('table').first().locator('tbody td').nth(1).click();
        await expect(pc.dialog.locator('table').first().locator('input')).toHaveCount(0);
      });
    });

    test('TC-COM-PCC-035: Comm % is a decimal text field with a 0.00 placeholder', { tag: '@C108045' }, async () => {
      await about('The field asks for a decimal keyboard, shows 0.00 when empty and is not marked invalid.');
      await openSubClass();
      await pc.setUseDefault(false);
      const attrs = await pc.commField();
      await verify('text, decimal, 0.00, valid', async () => expect(attrs).toEqual({ type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-invalid': 'false' }));
    });

    test('TC-COM-PCC-036: Whole and decimal percentages up to 100 are shown with two decimals', { tag: '@C108046' }, async () => {
      await about(`${VALID_ENTRIES.map(([t, s]) => `"${t}" → "${s}"`).join(', ')}.`);
      await openSubClass();
      await pc.setUseDefault(false);
      const got: [string, string][] = [];
      for (const [typed] of VALID_ENTRIES) got.push([typed, (await pc.typeComm(typed)).shown]);
      await verify('Each value', async () => expect(got).toEqual(VALID_ENTRIES.map(([t, s]) => [t, s])));
    });

    test('TC-COM-PCC-037: Letters, signs and a second decimal point are not typed', { tag: '@C108047' }, async () => {
      await about(`${STRIPPED_ENTRIES.map(([t, s]) => `"${t}" → "${s}"`).join(', ')} while typing.`);
      await openSubClass();
      await pc.setUseDefault(false);
      const got: [string, string][] = [];
      for (const [typed] of STRIPPED_ENTRIES) got.push([typed, (await pc.typeComm(typed)).typed]);
      await verify('What the field takes', async () => expect(got).toEqual(STRIPPED_ENTRIES.map(([t, s]) => [t, s])));
    });

    test('TC-COM-PCC-038: A value below 1 is read as a fraction and shown as a percentage', { tag: '@C108048' }, async () => {
      await about(`${BELOW_ONE.map(([t, s]) => `"${t}" → "${s}"`).join(', ')}.`);
      await openSubClass();
      await pc.setUseDefault(false);
      const got: [string, string][] = [];
      for (const [typed] of BELOW_ONE) got.push([typed, (await pc.typeComm(typed)).shown]);
      await verify('Each value as a percentage', async () => expect(got).toEqual(BELOW_ONE.map(([t, s]) => [t, s])));
    });

    test('TC-COM-PCC-039: Over 100 is marked invalid and the previous value is kept', { tag: '@C108049' }, async () => {
      await about(`With 5.00 % entered, ${OVER_100.join(' and ')} are marked invalid while typing; leaving the field puts 5.00 % back.`);
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('5');
      const got: ({ v: string } & Awaited<ReturnType<ProductCodePage["typeComm"]>>)[] = [];
      for (const v of OVER_100) got.push({ v, ...(await pc.typeComm(v)) });
      await verify('Marked invalid, 5.00 % kept', async () => {
        for (const g of got) {
          expect.soft(g.invalid, `${g.v} marked invalid`).toBe('true');
          expect.soft(g.shown, `${g.v}: previous value kept`).toBe('5.00 %');
        }
      });
    });

    test('TC-COM-PCC-040: Clearing Comm % keeps the last value', { tag: '@C108050' }, async () => {
      await about('An empty Comm % is not taken: after typing 7 and then clearing the field, it shows 7.00 % again.');
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('7');
      const cleared = await pc.typeComm('');
      await verify('7.00 % kept', async () => expect([cleared.typed, cleared.shown]).toEqual(['', '7.00 %']));
    });

    test('TC-COM-PCC-041: Escape in Comm % closes the dialog without saving', { tag: '@C108051' }, async () => {
      await about('With 7.00 % entered, typing 8 and pressing Escape inside Comm % closes the dialog; nothing is saved, so the Sub Class opens again on the default 0.00 %.');
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('7');
      await pc.escapeInComm('8');
      const open = await pc.dialogsOpen();
      await pc.openLevel('Sub Class');
      const view = await pc.dialogView();
      await verify('Dialog closed, nothing saved', async () => {
        expect(open).toBe(0);
        expect(view.segment).toMatchObject({ comm: '0.00 %', useDefault: true });
      });
    });

    test('TC-COM-PCC-042: Closing the dialog with unsaved changes closes it without saving', { tag: '@C108052' }, async () => {
      await about('With Comm % changed, Cancel and Escape each close the dialog straight away; the change is not saved, so the Sub Class opens again on the default 0.00 %.');
      const closed: Record<string, { open: number; comm: string; useDefault: boolean | null }> = {};
      for (const how of ['Cancel', 'Escape'] as const) {
        await openSubClass();
        await pc.setUseDefault(false);
        await pc.typeComm('7');
        await pc.closeDialog(how);
        const open = await pc.dialogsOpen();
        await pc.openLevel('Sub Class');
        const { comm, useDefault } = (await pc.dialogView()).segment;
        closed[how] = { open, comm, useDefault };
      }
      const unchanged = { open: 0, comm: '0.00 %', useDefault: true };
      await verify('Closed each way, nothing saved', async () => expect(closed).toEqual({ Cancel: unchanged, Escape: unchanged }));
    });

    test('TC-COM-PCC-043: Cancel and Escape close an unchanged dialog and send nothing', { tag: '@C108053' }, async () => {
      await about('Without a change, Cancel and Escape close the dialog with no request and no message.');
      await openSubClass();
      const closed: number[] = [];
      for (const how of ['Cancel', 'Escape'] as const) {
        if (!(await pc.dialog.isVisible())) await pc.openLevel('Sub Class');
        await pc.closeDialog(how);
        closed.push(await pc.dialogsOpen());
      }
      await verify('Closed both ways', async () => {
        expect(closed).toEqual([0, 0]);
        expect(await pc.toasts()).toEqual([]);
      });
    });
  });

  test.describe('F. Saving', () => {
    test.afterEach(async () => {
      await pc?.restoreDefaults(EDIT_OFFICE.code); // unset when the session itself failed to start
    });

    test('TC-COM-PCC-044: Saving with Propagate asks first, counting the segment and every segment below it', { tag: '@C108054' }, async () => {
      const subClassCount = TREE.items.length + 1;
      const classCount = TREE.classChildren + 1;
      await about(`The count includes the segment itself: Save on the Sub Class (itself and ${TREE.items.length} items) asks "${TEXT.confirm(subClassCount)}"; on the Class (itself and ${TREE.classChildren} segments below) it asks with [${classCount}]. Cancel sends nothing.`);
      const asked: string[] = [];
      for (const level of ['Sub Class', 'Class'] as const) {
        await openSubClass(level);
        await pc.setUseDefault(false);
        await pc.typeComm('3');
        asked.push((await pc.save('Cancel')).asked ?? '');
      }
      await verify('The question and its count', async () => {
        expect.soft(asked[0]).toBe(`${TEXT.confirmTitle} ${TEXT.confirm(subClassCount)} Cancel Ok`);
        expect.soft(asked[1]).toBe(`${TEXT.confirmTitle} ${TEXT.confirm(classCount)} Cancel Ok`);
      });
    });

    test('TC-COM-PCC-045: Cancel or Escape on the question sends nothing and keeps the edit', { tag: '@C108055' }, async () => {
      await about('After Cancel, and after Escape, the dialog is still open with 3.00 % and Save on; nothing was saved.');
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('3');
      const results: { sent: number; comm: string; save: boolean }[] = [];
      for (const answer of ['Cancel', 'Escape'] as const) {
        const { sent } = await pc.save(answer);
        results.push({ sent: sent.length, comm: (await pc.dialogView()).segment.comm, save: (await pc.dialogView()).save });
      }
      await verify('Nothing sent, edit kept', async () => expect(results).toEqual([{ sent: 0, comm: '3.00 %', save: true }, { sent: 0, comm: '3.00 %', save: true }]));
    });

    test('TC-COM-PCC-046: Saving with Propagate sets the segment and every item below it, and History records each', { tag: '@C108056' }, async () => {
      await about(`5 on the Sub Class with Propagate sends commission 0.05 for ${EDIT_OFFICE.code}, shows "${TEXT.saved}" and closes the dialog; the ${TREE.items.length} items are then listed off the default at 5.00 %, the dialog shows 5.00 % everywhere, and History adds a Modify entry for the Sub Class and each item.`);
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('5');
      const { sent, toasts } = await pc.save();
      const closed = await pc.dialogsOpen();
      await pc.search({ any: '', useDefault: false });
      const rows = await pc.rows();
      await pc.openLevel('Sub Class');
      const view = await pc.dialogView();
      await pc.closeDialog('Cancel');
      await pc.openTab(TEXT.tabs[1]);
      const history = (await pc.rows()).slice(0, TREE.items.length + 1);
      await verify('Sent, saved, shown and recorded', async () => {
        expect(sent).toEqual([{ locationNo: EDIT_OFFICE.code, productId: TREE.subClassId, commission: 0.05, useDefaultComm: false, propagate: true, includeInactive: false }]);
        expect(toasts).toContain(TEXT.saved);
        expect(closed).toBe(0);
        expect(rows.map((r) => [r.Item, r.Commission, r['Use Default Commission']])).toEqual(TREE.items.map((i) => [i, '5.00 %', '']));
        expect(view.segment).toMatchObject({ comm: '5.00 %', useDefault: false });
        expect(view.children).toEqual(TREE.items.map((name) => ({ name, comm: '5.00 %', useDefault: false })));
        expect(history.map((h) => [h.Level, h.Name, h.Action, h.Commission]).sort()).toEqual([['Sub Class', TREE['Sub Class']], ...TREE.items.map((i) => ['Item', i])].map(([l, n]) => [l, n, TEXT.modify, '5.00 %']).sort());
        for (const h of history) expect.soft(h['Modified Date'], 'today').toContain(today());
      });
    });

    test('TC-COM-PCC-047: After a save the grid runs the search again by itself', { tag: '@C108057' }, async () => {
      await about(`After saving 5 on the Sub Class from the "${TREE.search}" row (listed with Use Default Commission ticked), the page searches again: the row, now off the default, leaves the list.`);
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('5');
      await pc.save();
      await verify('The list is up to date', async () => {
        expect(await pc.countText()).toBe('0 items found');
        expect(await pc.rows()).toEqual([]);
      });
    });

    test('TC-COM-PCC-048: Without Propagate only the segment is saved; its items keep their own setting', { tag: '@C108058' }, async () => {
      await about(`4 on the Sub Class with Propagate unticked saves without a question and sends propagate false; the grid then lists ${TREE.Item} at the Sub Class's 4.00 %, while the dialog shows its items still on their own default 0.00 %.`);
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('4');
      await pc.setPropagate(false);
      const { asked, sent, toasts } = await pc.save();
      await pc.search({ any: TREE.search, useDefault: false });
      const grid = (await pc.rows()).map((r) => [r.Item, r.Commission]);
      await pc.openLevel('Sub Class');
      const view = await pc.dialogView();
      await verify('Saved alone; items keep their own setting', async () => {
        expect(asked).toBeNull();
        expect(sent).toEqual([expect.objectContaining({ commission: 0.04, useDefaultComm: false, propagate: false })]);
        expect(toasts).toContain(TEXT.saved);
        expect(view.segment).toMatchObject({ comm: '4.00 %', useDefault: false });
        expect(view.children).toEqual(TREE.items.map((name) => ({ name, comm: '0.00 %', useDefault: true })));
        expect(grid).toEqual([[TREE.Item, '4.00 %']]);
      });
    });

    test('TC-COM-PCC-049: An item is saved on its own, without Propagate or a question', { tag: '@C108059' }, async () => {
      await about(`The Item dialog has no Propagate; 6 on ${TREE.Item} saves without a question and only that item is then off the default.`);
      await openSubClass('Item');
      const view = await pc.dialogView();
      await pc.setUseDefault(false);
      await pc.typeComm('6');
      const { asked, sent, toasts } = await pc.save();
      await pc.search({ any: '', useDefault: false });
      await verify('Only the item changed', async () => {
        expect(view.segment.propagate).toBeNull();
        expect(asked).toBeNull();
        expect(sent).toEqual([expect.objectContaining({ commission: 0.06, useDefaultComm: false })]);
        expect(toasts).toContain(TEXT.saved);
        expect((await pc.rows()).map((r) => [r.Item, r.Commission])).toEqual([[TREE.Item, '6.00 %']]);
      });
    });

    test('TC-COM-PCC-050: 100 % can be saved, and ticking Use Default again puts the default back', { tag: '@C108060' }, async () => {
      await about(`100 is sent as 1 on the Sub Class; the dialog shows 100.00 %, while the grid and History show the stored 1 as 1.00 %. Ticking Use Default Commission and saving again puts it and its items back on the default: opened afresh, the page lists the item under Use Default Commission at 0.00 % and History adds a "${TEXT.modify}" 0.00 % entry.`);
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('100');
      const hundred = await pc.save();
      await pc.search({ any: TREE.search, useDefault: false });
      const grid100 = (await pc.rows()).map((r) => r.Commission);
      await pc.openLevel('Sub Class');
      const dialog100 = (await pc.dialogView()).segment.comm;
      await pc.setUseDefault(true);
      const back = await pc.save();
      await pc.openOffice(EDIT_OFFICE.code, TREE.search); // a fresh page: the page reuses the answers of searches it already ran
      const rows = await pc.rows();
      await pc.openTab(TEXT.tabs[1]);
      const subClass = (await pc.rows()).filter((h) => h.Level === 'Sub Class');
      await verify('100 saved, shown as 100.00 % in the dialog and 1.00 % in grid and History, default back', async () => {
        expect(hundred.sent.at(-1)?.commission).toBe(1);
        expect.soft(grid100, 'grid').toEqual(['1.00 %']);
        expect.soft(dialog100, 'dialog').toBe('100.00 %');
        expect.soft(subClass[1]?.Commission, 'History of the 100 % save').toBe('1.00 %');
        expect(back.sent.at(-1)).toMatchObject({ useDefaultComm: true, propagate: true });
        expect(rows.map((r) => [r.Commission, r['Use Default Commission']])).toEqual([['0.00 %', '✓']]);
        expect(subClass[0]).toMatchObject({ Name: TREE['Sub Class'], Action: TEXT.modify, Commission: '0.00 %' });
      });
    });

    test('TC-COM-PCC-051: A failed save says so and keeps the dialog and the edit', { tag: '@C108061' }, async () => {
      await about('When the save fails (500 or no connection) an error message shows, the dialog stays open with 3.00 % and nothing is stored.');
      await openSubClass();
      await pc.setUseDefault(false);
      await pc.typeComm('3');
      for (const how of [500, 'network'] as const) {
        const undo = await pc.fail('save', how);
        try {
          const { toasts } = await pc.save();
          await verify(`${how}: message, edit kept`, async () => {
            expect(toasts.join(' ')).not.toContain(TEXT.saved);
            expect(toasts.length).toBeGreaterThan(0);
            await expect(pc.dialog).toBeVisible();
            expect((await pc.dialogView()).segment.comm).toBe('3.00 %');
          });
        } finally {
          await undo();
        }
      }
    });
  });

  test.describe('G. Copy to Location(s)', () => {
    test('TC-COM-PCC-052: The copy panel names the source office and lists the other offices', { tag: '@C108062' }, async () => {
      await about(`Copy to Location(s) opens "${TEXT.copyTitle}" with Source Location ${EDIT_OFFICE.name}, "${TEXT.copySearch}", a Destination Location(s) list with Select all, the source left out, nothing ticked and Apply off.`);
      await openSubClass();
      await pc.openCopy();
      const info = await pc.copyInfo();
      await verify('Panel contents', async () => {
        expect(info).toMatchObject({ title: TEXT.copyTitle, source: EDIT_OFFICE.name, placeholder: TEXT.copySearch, columns: ['Destination Location(s)'], ticked: 0, apply: false });
        expect(info.destinations.length).toBeGreaterThan(1);
        expect(info.destinations).not.toContain(EDIT_OFFICE.name);
        await expect(pc.panel.getByRole('checkbox', { name: 'Select all' })).toBeVisible();
      });
    });

    test('TC-COM-PCC-053: The destination search finds offices by number or name in any case', { tag: '@C108063' }, async () => {
      await about(`"${COPY_OFFICE.code}" finds ${COPY_OFFICE.name}; "toronto" and "TORONTO" list only Toronto offices; "zzzz" shows "No results.".`);
      await openSubClass();
      await pc.openCopy();
      const found: Record<string, string[]> = {};
      for (const q of [COPY_OFFICE.code, 'toronto', 'TORONTO', 'zzzz']) found[q] = await pc.searchDestinations(q);
      await verify('Each search', async () => {
        expect.soft(found[COPY_OFFICE.code]).toEqual([COPY_OFFICE.name]);
        expect.soft(found.toronto).toEqual(found.TORONTO);
        for (const o of found.toronto!) expect.soft(o.toLowerCase()).toContain('toronto');
        expect.soft(found.zzzz).toEqual(['No results.']);
      });
    });

    test('TC-COM-PCC-054: Select all ticks every listed office and turns Apply on; again unticks them', { tag: '@C108064' }, async () => {
      await about('Select all ticks every destination listed and turns Apply on; a second click unticks them all and turns Apply off. Close hides the panel and keeps the dialog.');
      await openSubClass();
      await pc.openCopy();
      const listed = (await pc.destinations()).length;
      const all = [await pc.selectAll(), await pc.button('Apply', pc.panel).isEnabled()];
      const none = [await pc.selectAll(), await pc.button('Apply', pc.panel).isEnabled()];
      await pc.closeCopy();
      await verify('All, none, closed', async () => {
        expect(all).toEqual([listed, true]);
        expect(none).toEqual([0, false]);
        await expect(pc.dialog).toBeVisible();
      });
    });

    test('TC-COM-PCC-055: Apply copies the commission to the chosen office and History records the copy', { tag: '@C108065' }, async () => {
      await about(`With 5 % saved on the ${EDIT_OFFICE.code} Sub Class, copying it to ${COPY_OFFICE.code} sends both offices, shows "${TEXT.copied(TREE.items.length + 1)}", and ${COPY_OFFICE.code} then lists the items at 5.00 % with a "${TEXT.copy}" History entry per segment noting ${EDIT_OFFICE.code}. Both offices are put back.`);
      try {
        await pc.setCommission(EDIT_OFFICE.code, 'Sub Class', '5', { term: TREE.search });
        await pc.search({ any: TREE.search, useDefault: false });
        await pc.openLevel('Sub Class');
        await pc.openCopy();
        await pc.tickDestination(COPY_OFFICE.code);
        const { sent, toasts } = await pc.applyCopy();
        await pc.page.keyboard.press('Escape');
        await pc.pickOffice(COPY_OFFICE.code);
        await pc.search({ any: '', useDefault: false });
        const rows = await pc.rows();
        await pc.openTab(TEXT.tabs[1]);
        const history = (await pc.rows()).slice(0, TREE.items.length + 1);
        await verify(`Copied to ${COPY_OFFICE.code} and recorded`, async () => {
          expect(sent).toEqual({ sourceLocationNo: EDIT_OFFICE.code, productCodeId: TREE.subClassId, destinationLocationNos: COPY_OFFICE.code, includeInactive: false });
          expect(toasts).toContain(TEXT.copied(TREE.items.length + 1));
          expect(rows.map((r) => [r['Local Office ID'], r.Item, r.Commission])).toEqual(TREE.items.map((i) => [COPY_OFFICE.code, i, '5.00 %']));
          for (const h of history) expect.soft(h, h.Name).toMatchObject({ Action: TEXT.copy, Commission: '5.00 %', Notes: EDIT_OFFICE.code });
          expect(history.map((h) => h.Level).sort()).toEqual(['Item', 'Item', 'Item', 'Sub Class']);
        });
      } finally {
        await pc.restoreDefaults(COPY_OFFICE.code);
        await pc.restoreDefaults(EDIT_OFFICE.code);
      }
    });
  });

  test.describe('H. History', () => {
    test('TC-COM-PCC-056: History lists the picked office\'s changes, newest first', { tag: '@C108066' }, async () => {
      await about(`After picking ${EDIT_OFFICE.code}, History has the columns ${HISTORY_COLUMNS.join(', ')}, lists only ${EDIT_OFFICE.code} entries, ten to a page, newest first.`);
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      await pc.openTab(TEXT.tabs[1]);
      const rows = await pc.rows();
      await verify('Columns, office, order', async () => {
        expect(await pc.columns()).toEqual([...HISTORY_COLUMNS]);
        expect(rows.length).toBe(Math.min(10, await pc.count()));
        for (const r of rows) expect.soft(r['Local Office ID']).toBe(EDIT_OFFICE.name.replace(' - ', ' '));
        const dates = rows.map((r) => Date.parse(r['Modified Date']!));
        expect(dates).toEqual([...dates].sort((a, b) => b - a));
      });
    });

    test('TC-COM-PCC-057: Each History entry shows the level, name, action, commission, user and date', { tag: '@C108067' }, async () => {
      await about('Every row has a level of the product tree, a name, Modify or Copy, a commission with two decimals and %, a user e-mail and Modified Date as MM/DD/YYYY, hh:mm AM/PM.');
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      await pc.openTab(TEXT.tabs[1]);
      await pc.setPageSize('50');
      await verify('Each row\'s format', async () => {
        for (const r of await pc.rows()) {
          expect.soft(r, r.Name).toMatchObject({
            Level: expect.stringMatching(new RegExp(`^(${LEVELS.join('|')})$`)), Name: expect.stringMatching(/\S/), Action: expect.stringMatching(/^(Modify|Copy)$/),
            Commission: expect.stringMatching(/^\d+\.\d{2} %$/), 'Modified By': expect.stringMatching(/^\S+@\S+$/), 'Modified Date': expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} (AM|PM)$/),
          });
        }
      });
    });

    test('TC-COM-PCC-058: History columns sort both ways', { tag: '@C108068' }, async () => {
      await about('Level, Name, Action and Modified By sort A to Z and Z to A; Commission sorts by the stored value, so descending is ascending reversed (all entries on one page).');
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      await pc.openTab(TEXT.tabs[1]);
      await pc.setPageSize('50');
      const results: [string, unknown[], unknown[]][] = [];
      for (const c of ['Level', 'Name', 'Action', 'Modified By'] as const) {
        for (const dir of ['ascending', 'descending'] as const) { const got = (await pc.sort(c, dir)).map((r) => r[c]!); results.push([`${c} ${dir}`, got, ordered(got, dir)]); }
      }
      const commission: Record<string, string[]> = {};
      for (const dir of ['ascending', 'descending'] as const) commission[dir] = (await pc.sort('Commission', dir)).map((r) => r.Commission!);
      await verify('Each order', async () => {
        for (const [label, got, want] of results) expect.soft(got, label).toEqual(want);
        expect.soft(commission.descending, 'Commission descending is ascending reversed').toEqual([...(commission.ascending ?? [])].reverse());
        expect.soft(new Set(commission.ascending).size, 'Commission holds more than one value').toBeGreaterThan(1);
      });
    });

    test('TC-COM-PCC-059: History Export holds every entry of every page', { tag: '@C108069' }, async () => {
      await about(`The export (${EXPORT.history}) has the columns ${EXPORT.historyColumns.join(', ')} and, read page by page, every entry of the grid: level, name, action, commission (the export writes 100 % as 100, the grid shows it as 1.00 %) and user. Entries saved in the same minute may be listed in another order; right after other saves the grid can lag behind, and the export then also holds those newest entries.`);
      await pc.open(OFFICE);
      await pc.pickOffice(EDIT_OFFICE.code);
      await pc.openTab(TEXT.tabs[1]);
      const grid = await pc.allRows(['Level', 'Name', 'Action', 'Commission', 'Modified By']);
      const file = await pc.exportFile();
      const [header = [], ...entries] = file?.rows ?? [];
      const cell = (r: string[], c: string): string => r[header.indexOf(c)] ?? '';
      const asShown = (exported: number): number => (exported === 100 ? 1 : exported);
      const exported = entries.map((e) => JSON.stringify([cell(e, 'Level'), cell(e, 'Name'), cell(e, 'Action'), asShown(pct(cell(e, 'Comm %'))), cell(e, 'Modified By')]));
      const shown = grid.map((g) => JSON.stringify([g.Level, g.Name, g.Action, pct(g.Commission!), g['Modified By']]));
      const left = [...exported];
      const missing = shown.filter((s) => { const i = left.indexOf(s); if (i < 0) return true; left.splice(i, 1); return false; });
      await verify(`${grid.length} entries, as on screen`, async () => {
        expect(file?.name).toMatch(EXPORT.history);
        expect(header).toEqual([...EXPORT.historyColumns]);
        expect(grid.length).toBeGreaterThan(0);
        expect(missing, 'grid entries not in the export').toEqual([]);
      });
    });

    test('TC-COM-PCC-060: When History fails to load, a message shows and the grid is empty', { tag: '@C108070' }, async () => {
      await about(`With the History list failing, "${TEXT.loadFailed[500]}" (server error) or "${TEXT.loadFailed.network}" (no connection) shows and the grid reads "${TEXT.noResults}".`);
      for (const how of [500, 'network'] as const) {
        await pc.open(OFFICE);
        await pc.pickOffice(EDIT_OFFICE.code);
        const undo = await pc.fail('history', how);
        try {
          const seen = await pc.watchToasts();
          await pc.openTab(TEXT.tabs[1]);
          await verify(`${how}: message, no rows`, async () => {
            // The network message carries the host, e.g. "Failed to fetch (cloudapps-e2e...)".
            await expect.poll(async () => (await seen()).some((t) => t.includes(TEXT.loadFailed[how]))).toBe(true);
            await expect(pc.main.getByText(TEXT.noResults, { exact: true })).toBeVisible();
          });
        } finally {
          await undo();
        }
      }
    });

    test('TC-COM-PCC-061: A local office sees its own History without Export', { tag: '@C108071' }, async () => {
      await about(`Opened on ${EDIT_OFFICE.code}, History lists ${EDIT_OFFICE.code}'s entries and has no Export; on ${OFFICE} without a picked office it is empty.`);
      await pc.open(EDIT_OFFICE.code);
      await pc.openTab(TEXT.tabs[1]);
      const local = { rows: (await pc.rows()).length, offices: [...new Set((await pc.rows()).map((r) => r['Local Office ID']))], exportButtons: await pc.button('Export').count() };
      await pc.open(OFFICE);
      await pc.openTab(TEXT.tabs[1]);
      await verify(`${EDIT_OFFICE.code}'s own entries, no Export; none on ${OFFICE}`, async () => {
        expect(local.rows).toBeGreaterThan(0);
        expect(local.offices).toEqual([EDIT_OFFICE.name.replace(' - ', ' ')]);
        expect(local.exportButtons).toBe(0);
        expect(await pc.countText()).toBe('0 items found');
      });
    });
  });

  test.describe('I. Export', () => {
    test('TC-COM-PCC-062: Export downloads the rows found', { tag: '@C108072' }, async () => {
      await about(`After searching "Royalty Free", the export (${EXPORT.basic}) has the columns ${EXPORT.basicColumns.join(', ')} and one row per row found, with the office, Item, the item name, its commission and "Yes".`);
      await pc.openOffice(EDIT_OFFICE.code, 'Royalty Free');
      const grid = await pc.rows();
      const file = await pc.exportFile();
      const [header = [], ...rows] = file?.rows ?? [];
      await verify('File name, columns and rows', async () => {
        expect(file?.name).toMatch(EXPORT.basic);
        expect(header).toEqual([...EXPORT.basicColumns]);
        expect(rows.map((r) => [r[0], r[1], r[2], pct(r[3] ?? ''), r[4]])).toEqual(grid.map((g) => [EDIT_OFFICE.name.replace(' - ', ' '), 'Item', g.Item, pct(g.Commission!), 'Yes']));
      });
    });

    test('TC-COM-PCC-063: Export with no rows downloads nothing and says so', { tag: '@C108073' }, async () => {
      await about(`With nothing found, Export is on; clicking it downloads no file and shows "${TEXT.exportFailed}".`);
      await pc.open(OFFICE);
      const enabled = await pc.button('Export').isEnabled();
      const seen = await pc.watchToasts();
      const file = await pc.exportFile();
      await verify('No file, the message shown', async () => {
        expect(enabled).toBe(true);
        expect(file).toBeNull();
        await expect.poll(seen).toContain(TEXT.exportFailed);
      });
    });
  });

  test.describe('J. Keyboard and layout', () => {
    test('TC-COM-PCC-064: Tab moves through the search panel in reading order', { tag: '@C108074' }, async () => {
      await about('From the Basic Information tab, Tab reaches the office, Any Field, Use Default Commission, Include Inactive, Reset, Search, the panel toggle and Export, in that order.');
      await pc.open(OFFICE);
      await verify('Reading order', async () => {
        await expect(async () => expect(await pc.tabOrder(pc.page.getByRole('tab', { name: TEXT.tabs[0] }), 8))
          .toEqual([OFFICE_NAME, 'Any Field', 'Use Default Commission', 'Include Inactive', 'Reset', 'Search', 'Collapse search panel', 'Export'])).toPass({ timeout: 30_000 });
      });
    });

    test('TC-COM-PCC-065: The dialog works from the keyboard', { tag: '@C108075' }, async () => {
      await about('In the Sub Class dialog, Space unticks Use Default Commission; Shift+Tab reaches Comm %, Enter opens it, 7 and Tab show 7.00 %. Tab goes first to the dialog itself, then back to Comm % (7.00 %), then Use Default Commission, Propagate, Cancel and Save.');
      await openSubClass();
      const box = pc.dialog.getByRole('checkbox', { name: 'Use Default Commission' });
      await box.focus();
      await pc.page.keyboard.press('Space');
      await pc.page.keyboard.press('Shift+Tab');
      await pc.page.keyboard.press('Enter');
      await pc.page.keyboard.type('7');
      const [first = '', ...order] = await pc.tabOrder(pc.dialog.locator('table').first().locator('input'), 6);
      await verify('7.00 % entered, then the dialog, Comm % and the controls in order', async () => {
        expect((await pc.dialogView()).segment.comm).toBe('7.00 %');
        expect(first.startsWith(TEXT.dialogTitle), `first stop is the dialog: "${first.slice(0, 40)}"`).toBe(true);
        expect(order).toEqual(['7.00 %', 'Use Default Commission', 'Propagate', 'Cancel', 'Save']);
      });
    });

    test('TC-COM-PCC-066: Arrow keys move between the tabs', { tag: '@C108076' }, async () => {
      await about('With focus on Basic Information, Arrow Right opens History; Arrow Left goes back to Basic Information.');
      await pc.open(OFFICE);
      const first = pc.page.getByRole('tab', { name: TEXT.tabs[0] });
      await expect(async () => {
        await first.focus();
        await expect(first).toBeFocused({ timeout: 1_000 });
        await pc.page.keyboard.press('ArrowRight');
        await expect.poll(() => pc.selectedTab(), { timeout: 3_000 }).toBe(TEXT.tabs[1]);
      }).toPass({ timeout: 30_000 });
      await pc.page.keyboard.press('ArrowLeft');
      await verify('History, then Basic Information', async () => {
        await expect.poll(() => pc.selectedTab()).toBe(TEXT.tabs[0]);
        await expect(pc.anyField).toBeVisible();
      });
    });

    test('TC-COM-PCC-067: The search panel collapses and expands, keeping the rows', { tag: '@C108077' }, async () => {
      await about('Collapse search panel hides the criteria and keeps the rows found; Expand search panel shows them again with the same values.');
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      const before = [await pc.criteria(), await pc.rows()];
      const states = [await pc.toggleSearchPanel(), JSON.stringify(await pc.rows()) === JSON.stringify(before[1]), await pc.toggleSearchPanel()];
      await verify('Hidden, rows kept, shown again', async () => {
        expect(states).toEqual([false, true, true]);
        expect(await pc.criteria()).toEqual(before[0]);
      });
    });

    test('TC-COM-PCC-068: The sidebar toggle hides and shows the menu and the page keeps its state', { tag: '@C108078' }, async () => {
      await about('The toggle at the top left collapses the sidebar and expands it again; the criteria and rows stay the same.');
      await pc.openOffice(EDIT_OFFICE.code, TREE.search);
      const before = [await pc.criteria(), await pc.rows()];
      const states = [await pc.toggleSidebar(), await pc.toggleSidebar()];
      await verify('Collapsed, expanded, page unchanged', async () => {
        expect(states).toEqual(['collapsed', 'expanded']);
        expect([await pc.criteria(), await pc.rows()]).toEqual(before);
      });
    });
  });
});
