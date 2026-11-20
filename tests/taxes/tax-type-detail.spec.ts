import { test, expect } from '../../src/fixtures/pages.fixture';
import { TaxTypeDetailPage } from '../../src/pages/taxes/tax-type-detail.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import { TTD_OFFICES, officeLabel, OFFICE, TAX_TYPES, LONG_NAME, COLUMNS, HIDEABLE, TEXT } from '../../src/data/taxes/tax-type-detail';

// Tax → Tax Type Detail (NM-4024): a read-only list of the company's active tax types with their default
// taxability. Covered: opening the page, its loading and failure states, the list, sorting, hiding,
// moving and resizing columns, the kept layout, tooltips and the keyboard. Nothing here changes data.

test.describe.configure({ timeout: 180_000 });

const A_TO_Z = [...TAX_TYPES].sort((a, b) => a.localeCompare(b));
const Z_TO_A = [...A_TO_Z].reverse();

test.describe('Tax Type Detail @taxes', () => {
  let ttd: TaxTypeDetailPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    ttd = new TaxTypeDetailPage(authenticatedSession.page, config);
  });

  test.describe('A. Page load', () => {
    test('TC-TAX-TTD-001: Without a session the page sends the user to sign in', { tag: '@C107767' }, async ({ browser, config }) => {
      await about('Opening the page with no signed-in session lands on the sign-in page, which returns to this page afterwards.');
      // An explicitly empty state: the project's own default would sign the context in.
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await context.newPage();
        const path = `/locations/${OFFICE}/taxes/tax-type-detail`;
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

    test('TC-TAX-TTD-002: The page asks for the active tax types once', { tag: '@C107768' }, async () => {
      await about('Opening the page sends one tax type list request, asking for active tax types.');
      const sent = await ttd.open(OFFICE);
      await verify('The request asks for active tax types', async () => {
        expect(sent).toMatchObject({ bActive: true, includeAll: true });
      });
    });

    test('TC-TAX-TTD-003: While the list loads, placeholders show, then every tax type', { tag: '@C107769' }, async () => {
      await about(`With the list reply held back, the grid shows loading placeholders and the count line reads "${TEXT.count(0)}" until the list arrives; then the ${TAX_TYPES.length} tax types show.`);
      await ttd.open(OFFICE);
      const undo = await ttd.delayList(6_000);
      try {
        const loading = await ttd.readWhileLoading();
        await verify(`Placeholders show; the count line reads "${TEXT.count(0)}" while loading`, async () => {
          expect(loading.skeletons).toBeGreaterThan(0);
          expect([null, TEXT.count(0)], 'count line while loading').toContain(loading.count);
        });
      } finally {
        await undo();
      }
      await ttd.waitForReady();
      await verify(`Then ${TAX_TYPES.length} tax types`, async () => expect(await ttd.getCount()).toBe(TAX_TYPES.length));
    });

    test('TC-TAX-TTD-004: The count line gives the number of tax types listed', { tag: '@C107770' }, async () => {
      await about(`The count above the grid reads "${TEXT.count(TAX_TYPES.length)}", matching the rows listed.`);
      await ttd.open(OFFICE);
      await verify(`"${TEXT.count(TAX_TYPES.length)}"`, async () => {
        expect(await ttd.countText()).toBe(TEXT.count(TAX_TYPES.length));
        expect(await ttd.taxTypes()).toHaveLength(TAX_TYPES.length);
      });
    });

    test('TC-TAX-TTD-005: The page fits a phone screen', { tag: '@C107771' }, async () => {
      await about('At 390 × 844 the page does not scroll sideways, and the count and the tax type names show.');
      await ttd.open(OFFICE);
      const size = ttd.page.viewportSize();
      try {
        await ttd.page.setViewportSize({ width: 390, height: 844 });
        await verify('No sideways scroll; count and first tax type visible', async () => {
          expect(await ttd.scrollsSideways()).toBe(false);
          expect(await ttd.getCount()).toBe(TAX_TYPES.length);
          await expect(ttd.row(TAX_TYPES[0]).locator('td').first()).toBeVisible();
        });
      } finally {
        if (size) await ttd.page.setViewportSize(size);
      }
    });

    for (const office of TTD_OFFICES) {
      test.describe(officeLabel(office), () => {
        test('TC-TAX-TTD-006: Tax Type Detail opens from the Tax menu with every tax type', { tag: '@C107772' }, async () => {
          await about(`Tax > Tax Type Detail opens the page with its three columns and the ${TAX_TYPES.length} tax types, A to Z; every office lists the same.`);
          await phase('Open the page from Tax > Tax Type Detail', () => ttd.openFromTaxMenu(office.code));
          await verify('URL, browser title and heading', async () => {
            expect(ttd.page.url()).toContain(`/locations/${office.code}/taxes/tax-type-detail`);
            expect(await ttd.getHeading()).toEqual({ heading: TEXT.header, title: TEXT.pageTitle });
          });
          await verify(`Columns Tax Type, Default Taxability, Active; ${TAX_TYPES.length} tax types A to Z; the count matches`, async () => {
            expect(await ttd.getColumns()).toEqual([...COLUMNS]);
            expect(await ttd.taxTypes()).toEqual([...TAX_TYPES]);
            expect(await ttd.getCount()).toBe(TAX_TYPES.length);
          });
        });
      });
    }
  });

  test.describe('B. Load failure', () => {
    for (const [label, how] of [['No connection', 'network'], ['Server error 500', 500]] as const) {
      test.describe(label, () => {
        test('TC-TAX-TTD-007: A list that fails to load shows the empty list message', { tag: '@C107773' }, async () => {
          await about(`When the tax type list cannot be loaded, the page stays usable and shows "${TEXT.count(0)}" with "${TEXT.empty}"; it does not crash or keep loading.`);
          await ttd.open(OFFICE);
          const undo = await ttd.failList(how);
          try {
            await phase('Reload with the list failing', () => ttd.reload());
            await verify(`Heading shown; "${TEXT.count(0)}" and "${TEXT.empty}"; no rows`, async () => {
              await expect.poll(() => ttd.countText(), { timeout: 30_000 }).toBe(TEXT.count(0));
              await expect.poll(() => ttd.isTextVisible(TEXT.empty), { timeout: 30_000 }).toBe(true);
              expect((await ttd.getHeading()).heading).toBe(TEXT.header);
              expect(await ttd.taxTypes()).toEqual([]);
            });
          } finally {
            await undo();
          }
        });
      });
    }
  });

  test.describe('C. Keyboard', () => {
    test('TC-TAX-TTD-008: The grid works from the keyboard', { tag: '@C107774' }, async () => {
      await about('Tab moves from the heading to Grid Options and the three column headers; Enter opens a header menu and Arrow Down + Enter sorts.');
      await ttd.open(OFFICE);
      await ttd.focusHeading();
      const order: string[] = [];
      for (let i = 0; i < 4; i++) order.push(await ttd.press('Tab'));
      await verify('Tab order: Grid Options, Tax Type, Default Taxability, Active', async () => {
        expect(order).toEqual([TEXT.gridOptions, ...COLUMNS]);
      });
      await ttd.press('Shift+Tab');
      await ttd.press('Shift+Tab');
      await ttd.press('Enter');
      await ttd.waitForMenu();
      await ttd.press('ArrowDown');
      await ttd.press('Enter');
      await verify('Tax Type sorted Z to A', async () => {
        await expect.poll(() => ttd.sortState('Tax Type')).toBe('descending');
        expect(await ttd.taxTypes()).toEqual(Z_TO_A);
      });
    });
  });

  test.describe('D. List', () => {
    test.beforeEach(async () => {
      await ttd.open(OFFICE);
    });

    test('TC-TAX-TTD-009: Every tax type is listed once, active and with its default taxability', { tag: '@C107775' }, async () => {
      await about(`The ${TAX_TYPES.length} tax types are listed once each; as only active tax types are listed, each is ticked Active; each is ticked Default Taxability; the mark columns hold only ticks.`);
      const rows = await ttd.getRows();
      await verify(`${TAX_TYPES.length} distinct tax types, each ticked Active and Default Taxability`, async () => {
        expect(new Set(rows.map((r) => r.taxType)).size).toBe(rows.length);
        expect(rows.filter((r) => !r.active).map((r) => r.taxType), 'not ticked Active').toEqual([]);
        expect(rows.filter((r) => !r.defaultTaxability).map((r) => r.taxType), 'not ticked Default Taxability').toEqual([]);
        expect(await ttd.markColumnTexts(), 'text in the mark columns').toEqual([]);
      });
    });

    test('TC-TAX-TTD-010: The list cannot be edited', { tag: '@C107776' }, async () => {
      await about('Clicking, double-clicking and right-clicking a row and its marks opens nothing, changes nothing and sends nothing; the page has no inputs or Save.');
      const before = await ttd.rowCells(25);
      const sent = await ttd.clickAroundRow('Rental');
      await verify('No request, no change, no edit controls', async () => {
        expect(sent).toEqual([]);
        expect(await ttd.rowCells(25)).toEqual(before);
        expect(await ttd.editControls()).toEqual([]);
      });
    });

    test('TC-TAX-TTD-011: A name cut off by a narrow column shows in full on hover', { tag: '@C107777' }, async () => {
      await about(`At the default width "${LONG_NAME}" shows in full and opens no tooltip; after narrowing Tax Type it is cut off and hovering it shows the full name.`);
      const wide = await ttd.nameTooltip(LONG_NAME);
      // The longest name still fits at about 200 px, so the column is narrowed well below that.
      await ttd.resizeColumn('Tax Type', -700);
      await verify('Default width: in full, no tooltip', async () => expect(wide).toBeNull());
      await verify('Narrow: cut off; the tooltip shows the full name', async () => {
        expect(await ttd.isNameCutOff(LONG_NAME)).toBe(true);
        expect(await ttd.nameTooltip(LONG_NAME)).toBe(LONG_NAME);
      });
    });

    test('TC-TAX-TTD-012: Tax types with an "M" variant show their names as stored', { tag: '@C107778' }, async () => {
      const mNames = TAX_TYPES.filter((t) => / [–-] M$/.test(t));
      await about(`The ${mNames.length} "M" variants show exactly as stored, dash included: ${mNames.join(', ')}.`);
      const shown = (await ttd.taxTypes()).filter((t) => / [–-] M$/.test(t));
      await verify('Each "M" name as stored', async () => expect(shown).toEqual(mNames));
    });
  });

  test.describe('E. Sorting', () => {
    test.beforeEach(async () => {
      await ttd.open(OFFICE);
    });

    test('TC-TAX-TTD-013: Each header has its menu', { tag: '@C107779' }, async () => {
      await about('Tax Type sorts both ways; Default Taxability and Active also have Hide column.');
      const menus: Record<string, string[]> = {};
      for (const column of COLUMNS) menus[column] = await ttd.headerMenuItems(column);
      await verify('Menus', async () => {
        expect(menus).toEqual({
          'Tax Type': ['Sort ascending', 'Sort descending'],
          'Default Taxability': ['Sort ascending', 'Sort descending', 'Hide column'],
          Active: ['Sort ascending', 'Sort descending', 'Hide column'],
        });
      });
    });

    test('TC-TAX-TTD-014: Tax Type sorts both ways in the browser and shows the direction', { tag: '@C107780' }, async () => {
      await about('The list starts A to Z with no sort arrow; Sort descending gives Z to A with a down arrow, Sort ascending A to Z with an up arrow; sorting does not reload the list.');
      const start = { order: await ttd.taxTypes(), arrow: await ttd.sortState('Tax Type') };
      const descSent = await ttd.sortBy('Tax Type', 'descending');
      const desc = await ttd.taxTypes();
      const ascSent = await ttd.sortBy('Tax Type', 'ascending');
      const asc = await ttd.taxTypes();
      await verify('A to Z; Z to A (down arrow); A to Z (up arrow); the list is not reloaded', async () => {
        expect(start).toEqual({ order: A_TO_Z, arrow: 'none' });
        expect(desc).toEqual(Z_TO_A);
        expect(asc).toEqual(A_TO_Z);
        expect(await ttd.sortState('Tax Type')).toBe('ascending');
        expect([...descSent, ...ascSent], 'tax type list requests').toEqual([]);
      });
    });

    test('TC-TAX-TTD-015: Sorting by a mark column keeps every tax type', { tag: '@C107781' }, async () => {
      await about('Sorting Default Taxability or Active either way keeps all the tax types listed.');
      const seen: Record<string, number> = {};
      for (const column of HIDEABLE) {
        for (const direction of ['descending', 'ascending'] as const) {
          await ttd.sortBy(column, direction);
          seen[`${column} ${direction}`] = new Set(await ttd.taxTypes()).size;
        }
      }
      await verify(`${TAX_TYPES.length} tax types after each sort`, async () => {
        for (const [sort, n] of Object.entries(seen)) expect.soft(n, sort).toBe(TAX_TYPES.length);
        expect(Object.values(seen).every((n) => n === TAX_TYPES.length)).toBe(true);
      });
    });

    test('TC-TAX-TTD-016: A sort lasts for the visit; a reload lists A to Z again', { tag: '@C107782' }, async () => {
      await about('Sorting Tax Type Z to A applies until the page is reloaded; after a reload the list is back to A to Z with no sort arrow.');
      await ttd.sortBy('Tax Type', 'descending');
      const sorted = await ttd.taxTypes();
      await ttd.reload();
      await verify('Z to A before the reload; A to Z with no sort arrow after it', async () => {
        expect(sorted).toEqual(Z_TO_A);
        expect(await ttd.taxTypes()).toEqual(A_TO_Z);
        expect(await ttd.sortState('Tax Type')).toBe('none');
      });
    });
  });

  test.describe('F. Hiding and moving columns', () => {
    test.beforeEach(async () => {
      await ttd.open(OFFICE);
    });

    test('TC-TAX-TTD-017: A column hidden from its header comes back from Grid Options', { tag: '@C107783' }, async () => {
      await about('Hide column on Default Taxability removes it; Grid Options then shows it unticked; ticking it brings it back in its place.');
      await ttd.hideColumn('Default Taxability');
      const hidden = { columns: await ttd.getColumns(), options: await ttd.getGridOptionColumns(), cells: await ttd.rowCells(0) };
      await ttd.toggleGridOptionColumn('Default Taxability');
      await verify('Hidden: Tax Type and Active only; Grid Options unticked', async () => {
        expect(hidden.columns).toEqual(['Tax Type', 'Active']);
        expect(hidden.cells).toEqual([TAX_TYPES[0], '✓']);
        expect(hidden.options).toEqual([{ label: 'Default Taxability', checked: false }, { label: 'Active', checked: true }]);
      });
      await verify('Ticked again: back in its place', async () => expect(await ttd.getColumns()).toEqual([...COLUMNS]));
    });

    test('TC-TAX-TTD-018: Grid Options lists the optional columns', { tag: '@C107784' }, async () => {
      await about('Grid Options lists Default Taxability and Active, both ticked (Tax Type always shows); unticking both leaves only Tax Type.');
      const options = await ttd.getGridOptionColumns();
      for (const column of HIDEABLE) await ttd.toggleGridOptionColumn(column);
      await verify('Default Taxability and Active, ticked', async () => {
        expect(options).toEqual(HIDEABLE.map((label) => ({ label, checked: true })));
      });
      await verify('Both unticked: Tax Type only, still listing every tax type', async () => {
        expect(await ttd.getColumns()).toEqual(['Tax Type']);
        expect(await ttd.getCount()).toBe(TAX_TYPES.length);
      });
    });

    test('TC-TAX-TTD-019: A column can be dragged to another place', { tag: '@C107785' }, async () => {
      await about('Dragging Active by its grip onto Tax Type moves it first; the cells move with it.');
      await ttd.dragColumn('Active', 'Tax Type');
      await verify('Active, Tax Type, Default Taxability; cells follow', async () => {
        await expect.poll(() => ttd.getColumns()).toEqual(['Active', 'Tax Type', 'Default Taxability']);
        expect(await ttd.rowCells(0)).toEqual(['✓', TAX_TYPES[0], '✓']);
      });
    });
  });

  test.describe('G. Resizing columns', () => {
    test.beforeEach(async () => {
      await ttd.open(OFFICE);
    });

    test('TC-TAX-TTD-020: Tax Type resizes with the mouse', { tag: '@C107786' }, async () => {
      await about('Dragging the Tax Type border 100 px right widens it by about 100 px; dragging it 100 px left from the default narrows it by about 100 px; the other columns keep their width.');
      const start = await ttd.columnWidths();
      await ttd.resizeColumn('Tax Type', 100);
      const wider = await ttd.columnWidths();
      await ttd.resetGridView();
      await ttd.resizeColumn('Tax Type', -100);
      const narrower = await ttd.columnWidths();
      await verify('±100 px on Tax Type only', async () => {
        expect(Math.abs(wider['Tax Type']! - start['Tax Type']! - 100)).toBeLessThanOrEqual(10);
        expect(Math.abs(start['Tax Type']! - narrower['Tax Type']! - 100)).toBeLessThanOrEqual(10);
        expect({ ...wider, 'Tax Type': 0 }).toEqual({ ...start, 'Tax Type': 0 });
        expect({ ...narrower, 'Tax Type': 0 }).toEqual({ ...start, 'Tax Type': 0 });
      });
    });

    for (const column of HIDEABLE) {
      test.describe(column, () => {
        test('TC-TAX-TTD-021: Dragging the Default Taxability or Active border widens the grid', { tag: '@C107787' }, async () => {
          await about(`Dragging the ${column} border 100 px right makes the grid about 100 px wider; no column gets narrower.`);
          const start = await ttd.columnWidths();
          await ttd.resizeColumn(column, 100);
          const after = await ttd.columnWidths();
          const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
          await verify('Grid about 100 px wider; no column narrower', async () => {
            expect(Math.abs(total(after) - total(start) - 100), `widths ${JSON.stringify(start)} → ${JSON.stringify(after)}`).toBeLessThanOrEqual(10);
            for (const c of COLUMNS) expect.soft(after[c]!, c).toBeGreaterThanOrEqual(start[c]!);
          });
        });
      });
    }
  });

  test.describe('H. Kept layout and reset', () => {
    test.beforeEach(async () => {
      await ttd.open(OFFICE);
    });

    test('TC-TAX-TTD-022: The column layout is kept after a reload', { tag: '@C107788' }, async () => {
      await about('A hidden column, a moved column and a resized column stay that way after the page is reloaded.');
      await ttd.hideColumn('Default Taxability');
      await ttd.dragColumn('Active', 'Tax Type');
      await expect.poll(() => ttd.getColumns()).toEqual(['Active', 'Tax Type']);
      await ttd.resizeColumn('Tax Type', 100);
      const before = await ttd.columnWidths();
      await ttd.reload();
      await verify('Same columns, order and widths', async () => {
        expect(await ttd.getColumns()).toEqual(['Active', 'Tax Type']);
        expect(await ttd.columnWidths()).toEqual(before);
      });
    });

    test('TC-TAX-TTD-023: Reset to Default View undoes hidden, moved and resized columns', { tag: '@C107789' }, async () => {
      await about('After hiding, moving and resizing columns, Reset to Default View brings back the three columns in order and their widths.');
      const start = await ttd.columnWidths();
      await ttd.hideColumn('Default Taxability');
      await ttd.dragColumn('Active', 'Tax Type');
      await expect.poll(() => ttd.getColumns()).toEqual(['Active', 'Tax Type']);
      await ttd.resizeColumn('Tax Type', 120);
      await ttd.resetGridView();
      await verify('Columns and widths as at the start', async () => {
        expect(await ttd.getColumns()).toEqual([...COLUMNS]);
        expect(await ttd.columnWidths()).toEqual(start);
        expect(await ttd.keptLayout()).toMatchObject({ columnVisibility: {}, columnSizing: {} });
      });
    });

    test('TC-TAX-TTD-024: Reset to Default View resets the columns and keeps the chosen sort', { tag: '@C107790' }, async () => {
      await about('Reset to Default View is about the columns: after sorting Tax Type Z to A and resetting, the three columns are back and the list stays Z to A.');
      await ttd.sortBy('Tax Type', 'descending');
      await ttd.hideColumn('Active');
      await ttd.resetGridView();
      await verify('Three columns; still Z to A with the down arrow', async () => {
        expect(await ttd.getColumns()).toEqual([...COLUMNS]);
        expect(await ttd.taxTypes()).toEqual(Z_TO_A);
        expect(await ttd.sortState('Tax Type')).toBe('descending');
      });
    });
  });

  test.describe('I. Tooltips', () => {
    test('TC-TAX-TTD-025: Grid Options names itself on hover', { tag: '@C107791' }, async () => {
      await about('Hovering Grid Options opens the tooltip "Grid Options".');
      await ttd.open(OFFICE);
      const tip = await ttd.tooltipOf(ttd.gridOptionsButton());
      await verify('"Grid Options"', async () => expect(tip).toBe(TEXT.gridOptions));
    });
  });
});
