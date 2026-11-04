import { test, expect } from '../../src/fixtures/pages.fixture';
import { OrderOriginTaxPage } from '../../src/pages/taxes/order-origin-tax.page';
import { phase, verify, about } from '../../src/fixtures/report-steps';
import {
  OOT_OFFICES,
  officeLabel,
  EDIT_OFFICE,
  ROW,
  VALIDATION_ROW_DATE,
  TEXT,
  COLUMNS,
  TAX_TYPES,
  FILTER_TAX_TYPE,
} from '../../src/data/taxes/order-origin-tax';

// Tax → Order Origin Tax (NM-4020): opening the page, the Basic Information search criteria and
// the results grid. Nothing here saves.

test.describe.configure({ timeout: 180_000 });

const ZERO = '0.000000';
const numbers = (values: string[]) => values.map(Number);

test.describe('Order Origin Tax — page and search', () => {
  let oot: OrderOriginTaxPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    oot = new OrderOriginTaxPage(authenticatedSession.page, config);
  });

  for (const office of OOT_OFFICES) {
    test(`TC-OOT-LOD-001: Order Origin Tax opens from the Tax menu — ${officeLabel(office)}`, async () => {
      await about('The Tax menu opens Order Origin Tax for the office, on the Basic Information tab.');
      await phase('Open the page from Tax > Order Origin Tax', () => oot.openFromTaxMenu(office.code));
      await verify('URL, browser title, heading and information text', async () => {
        expect(oot.page.url()).toContain(`/locations/${office.code}/taxes/order-origin-tax`);
        expect(await oot.getHeading()).toEqual({ heading: TEXT.header, title: TEXT.pageTitle });
        expect(await oot.getInfoTooltip()).toBe(TEXT.info);
      });
      await verify('Basic Information is the open tab; History is offered', async () => {
        await expect(oot.tab('basic')).toHaveAttribute('aria-selected', 'true');
        await expect(oot.tab('history')).toHaveAttribute('aria-selected', 'false');
      });
    });
  }

  test('TC-OOT-LOD-002: Search criteria start at their defaults with an empty grid', async () => {
    await about('Before a search: all locations, all tax types, today, non-zero rates only, no rows and Save off.');
    await oot.open(EDIT_OFFICE);
    const today = await oot.browserToday();
    await verify('Criteria are All locations / All / today / ticked', async () => {
      expect(await oot.getCriteria()).toEqual({ location: TEXT.allLocations, taxType: TEXT.allTaxTypes, date: today, notEqualZero: true });
    });
    await verify('The grid is empty and asks for a search; Save is disabled', async () => {
      expect(await oot.getCount()).toBe(0);
      expect(await oot.isEmptyMessageVisible('basic')).toBe(true);
      expect(await oot.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-OOT-LOD-003: The grid shows the twelve order origin tax columns', async () => {
    await about('The grid and its Grid Options list the same twelve columns, all shown.');
    await oot.open(EDIT_OFFICE);
    await verify('Column headers in order', async () => {
      expect(await oot.getHeaders()).toEqual([...COLUMNS]);
    });
    await verify('Grid Options lists every column, ticked', async () => {
      expect(await oot.getGridOptionColumns()).toEqual(COLUMNS.map((label) => ({ label, checked: true })));
    });
  });

  test('TC-OOT-SRC-001: Searching with the defaults lists non-zero rates of all locations', async () => {
    await about('The default search returns rows, and none of them has a zero Additional Tax.');
    await oot.open(EDIT_OFFICE);
    const count = await phase('Search with the default criteria', () => oot.search());
    await verify('Rows are found, from more than one location, all non-zero', async () => {
      expect(count).toBeGreaterThan(0);
      expect(new Set(await oot.readColumn('Location No')).size).toBeGreaterThan(1);
      expect(await oot.readColumn('Additional Tax')).not.toContain(ZERO);
    });
  });

  for (const office of OOT_OFFICES) {
    test(`TC-OOT-SRC-002: The Location filter lists only that office's rows — ${officeLabel(office)}`, async () => {
      await about('Choosing an office lists its own rows only: one per tax type, zero rates included.');
      await oot.open(office.code);
      await phase('Choose the office and include zero rates', async () => {
        await oot.selectLocation(office.code);
        await oot.setNotEqualZero(false);
      });
      const count = await phase('Search', () => oot.search());
      await verify(`One row per tax type, all for ${office.code}`, async () => {
        expect(count).toBe(TAX_TYPES.length);
        expect(new Set(await oot.readColumn('Location No'))).toEqual(new Set([office.code]));
        expect(TAX_TYPES).toEqual(expect.arrayContaining(await oot.readColumn('Tax Type')));
      });
    });
  }

  test('TC-OOT-SRC-003: The Change Local Office dialog finds offices and needs one ticked', async () => {
    await about('The Location picker searches by number and name, enables Select only once an office is ticked, and Cancel changes nothing.');
    await oot.open(EDIT_OFFICE);
    await oot.openLocationDialog();
    await verify('The dialog is titled Change Local Office and Select starts disabled', async () => {
      await expect(oot.dialog()).toContainText(TEXT.dialogTitle);
      expect(await oot.isDialogSelectEnabled()).toBe(false);
    });
    await verify('Searching by number lists that office', async () => {
      expect(await oot.searchLocationDialog(EDIT_OFFICE)).toEqual([expect.stringContaining(EDIT_OFFICE)]);
    });
    await verify('Searching by name lists matching offices only', async () => {
      const rows = await oot.searchLocationDialog('Embassy Suites');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.join(' ')).toContain(EDIT_OFFICE);
    });
    await phase('Search the number again and tick it', async () => {
      await oot.searchLocationDialog(EDIT_OFFICE);
      await oot.tickDialogOffice(EDIT_OFFICE);
    });
    await verify('Select is enabled once an office is ticked', async () => {
      expect(await oot.isDialogSelectEnabled()).toBe(true);
    });
    await oot.cancelLocationDialog();
    await verify('Cancel leaves the filter on All locations', async () => {
      expect((await oot.getCriteria()).location).toBe(TEXT.allLocations);
    });
  });

  test('TC-OOT-SRC-004: The Tax Type filter offers every tax type and narrows the rows to one', async () => {
    await about('Tax Type lists All plus the forty tax types, and choosing one lists only that tax type.');
    await oot.open(EDIT_OFFICE);
    await verify('Options are All followed by the tax types', async () => {
      expect(await oot.getTaxTypeOptions()).toEqual([TEXT.allTaxTypes, ...TAX_TYPES]);
    });
    await oot.selectTaxType(FILTER_TAX_TYPE);
    const count = await phase(`Search ${FILTER_TAX_TYPE}`, () => oot.search());
    await verify(`Every row is ${FILTER_TAX_TYPE}`, async () => {
      expect(count).toBeGreaterThan(0);
      expect(new Set(await oot.readColumn('Tax Type'))).toEqual(new Set([FILTER_TAX_TYPE]));
    });
  });

  test('TC-OOT-SRC-005: Unticking "Percentage not equal to 0" adds the zero-rate rows', async () => {
    await about('Ticked, zero rates are left out; unticked, they are listed too.');
    await oot.open(EDIT_OFFICE);
    const nonZero = await phase('Search with the box ticked', () => oot.search());
    await oot.setNotEqualZero(false);
    const all = await phase('Search with the box unticked', () => oot.search());
    await verify('More rows with the box unticked', async () => {
      expect(all).toBeGreaterThan(nonZero);
    });
    await phase(`Narrow to office ${EDIT_OFFICE}, whose rows are all zero`, async () => {
      await oot.selectLocation(EDIT_OFFICE);
      await oot.search();
    });
    await verify('Zero-rate rows are listed', async () => {
      expect(await oot.readColumn('Additional Tax')).toContain(ZERO);
    });
  });

  test('TC-OOT-SRC-006: The Effective Date filter lists the rate in effect on that date', async () => {
    await about(`Office ${EDIT_OFFICE} ${ROW.validation} has one record, effective ${VALIDATION_ROW_DATE}: it is listed from that day, not the day before.`);
    await oot.open(EDIT_OFFICE);
    await phase('Choose the office and tax type, zero rates included', async () => {
      await oot.selectLocation(EDIT_OFFICE);
      await oot.selectTaxType(ROW.validation);
      await oot.setNotEqualZero(false);
    });
    await oot.setEffectiveDateFilter('12/31/1999');
    await verify('Day before the record: nothing listed', async () => {
      expect(await oot.search()).toBe(0);
    });
    await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
    await verify('Day of the record: the record is listed', async () => {
      expect(await oot.search()).toBe(1);
      expect(await oot.readColumn('Tax Type')).toEqual([ROW.validation]);
    });
  });

  test('TC-OOT-SRC-007: An invalid or empty Effective Date filter blocks the search', async () => {
    await about('Search is disabled while the Effective Date is not a real date or is empty, and enabled again for a valid date.');
    await oot.open(EDIT_OFFICE);
    for (const value of ['13/40/2026', '']) {
      await oot.setEffectiveDateFilter(value);
      await verify(`Effective Date "${value}": Search disabled`, async () => {
        expect(await oot.isSearchEnabled()).toBe(false);
      });
    }
    await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
    await verify('A valid date enables Search again', async () => {
      expect(await oot.isSearchEnabled()).toBe(true);
    });
  });

  test('TC-OOT-SRC-008: Reset restores the default criteria and clears the grid', async () => {
    await about('After changing every criterion and searching, Reset puts each back and empties the grid.');
    await oot.open(EDIT_OFFICE);
    const today = await oot.browserToday();
    await phase('Change every criterion and search', async () => {
      await oot.selectLocation(EDIT_OFFICE);
      await oot.selectTaxType(ROW.validation);
      await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
      await oot.setNotEqualZero(false);
      await oot.search();
    });
    await oot.reset();
    await verify('Criteria are back to their defaults and the grid is empty', async () => {
      expect(await oot.getCriteria()).toEqual({ location: TEXT.allLocations, taxType: TEXT.allTaxTypes, date: today, notEqualZero: true });
      expect(await oot.getCount()).toBe(0);
      expect(await oot.isEmptyMessageVisible('basic')).toBe(true);
    });
  });

  test('TC-OOT-SRC-009: The last search criteria are kept when the page is reloaded', async () => {
    await about('The criteria of the last search are still set after a browser reload; the grid waits for a new search.');
    await oot.open(EDIT_OFFICE);
    await phase('Choose criteria and search', async () => {
      await oot.selectLocation(EDIT_OFFICE);
      await oot.selectTaxType(ROW.validation);
      await oot.setEffectiveDateFilter(VALIDATION_ROW_DATE);
      await oot.setNotEqualZero(false);
      await oot.search();
    });
    const searched = await oot.getCriteria();
    await oot.reload();
    await verify('The same criteria after reload, and an empty grid', async () => {
      expect(await oot.getCriteria()).toEqual(searched);
      expect(await oot.getCount()).toBe(0);
    });
    await verify('Searching again finds the same row', async () => {
      expect(await oot.search()).toBe(1);
    });
  });

  test('TC-OOT-GRD-001: Results are sorted by Location No, newest first, and any column sorts both ways', async () => {
    await about('The default order is Location No descending; the header menu sorts a column ascending and descending.');
    await oot.open(EDIT_OFFICE);
    await oot.search();
    const desc = (v: number[]) => [...v].sort((a, b) => b - a);
    const asc = (v: number[]) => [...v].sort((a, b) => a - b);
    await verify('Location No is descending by default', async () => {
      const locations = numbers(await oot.readColumn('Location No'));
      expect(locations).toEqual(desc(locations));
    });
    await oot.sortBy('Additional Tax', 'ascending');
    await verify('Additional Tax ascending', async () => {
      const taxes = numbers(await oot.readColumn('Additional Tax'));
      expect(taxes).toEqual(asc(taxes));
    });
    await oot.sortBy('Additional Tax', 'descending');
    await verify('Additional Tax descending', async () => {
      const taxes = numbers(await oot.readColumn('Additional Tax'));
      expect(taxes).toEqual(desc(taxes));
    });
  });

  test('TC-OOT-GRD-002: A hidden column comes back with Reset to Default View', async () => {
    await about('Hide column removes a column and unticks it in Grid Options; Reset to Default View shows all twelve again.');
    await oot.open(EDIT_OFFICE);
    try {
      await oot.hideColumn('County');
      await verify('County is gone from the grid and unticked in Grid Options', async () => {
        expect(await oot.getHeaders()).toEqual(COLUMNS.filter((c) => c !== 'County'));
        expect(await oot.getGridOptionColumns()).toContainEqual({ label: 'County', checked: false });
      });
      await oot.resetGridView();
      await verify('All twelve columns are back, in order', async () => {
        expect(await oot.getHeaders()).toEqual([...COLUMNS]);
      });
    } finally {
      await oot.resetGridView().catch(() => {});
    }
  });

  test('TC-OOT-GRD-003: The search criteria panel collapses and expands', async () => {
    await about('Collapse filters hides the search criteria; Expand filters brings them back.');
    await oot.open(EDIT_OFFICE);
    await oot.collapseFilters();
    await verify('Search criteria hidden', async () => {
      await expect(oot.searchButton()).not.toBeInViewport();
    });
    await oot.expandFilters();
    await verify('Search criteria shown again', async () => {
      await expect(oot.searchButton()).toBeInViewport();
    });
  });
});
