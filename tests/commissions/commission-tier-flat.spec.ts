import { createRequire } from 'module';
import { Locator } from '@playwright/test';
import { test, expect } from '../../src/fixtures/pages.fixture';
import { CommissionTierFlatPage, GridRow, toNumber, tierRecords, SEARCH_REQUEST } from '../../src/pages/commissions/commission-tier-flat.page';
import { phase, verify, about, attachNote } from '../../src/fixtures/report-steps';
import {
  TF_OFFICES,
  TF_FOREIGN_OFFICES,
  officeLabel,
  TF_PATH,
  PRODUCT_CODE_PATH,
  TF_HISTORY_OFFICE,
  WRITES_ALLOWED,
  BASIC_COLUMNS_REQUIRED,
  HISTORY_COLUMNS,
  HISTORY_ACTIONS,
  READ_ONLY_FIELDS,
  ADD_ROW_DEFAULTS,
  AUTO_UPPER,
  LOWER_INPUT,
  UPPER_INPUT,
  UPPER_LOWER_SEED,
  COMM_INPUT,
  RATE_EDGES,
  OVERLAPPING,
  SEPARATE,
  BAD_UPLOADS,
  PAGE_BOX_INPUT,
  EXPORT_FILE,
  EXPORT_HEADERS,
  AUDIT_FILE,
  AUDIT_HEADERS,
  MONTHS,
  MONTH_NAMES,
  daysInMonth,
  TEXT,
} from '../../src/data/commissions/commission-tier-flat';

// Setup → Commissions → Tier/Flat (NM-3350): commission bands per service type on Basic Information, with a
// read-only History tab. Covered: opening the page, the search, Add Row, field validation of every editable cell,
// the overlap rule, the unsaved-changes guard, saving, export, import, the Copy panels, Reset Dates and History.
// Validation cases work on rows added on a service type with no tiers and never save. The save cases write E2E
// bands with the AUTO_UPPER marker and remove them again; TF_WRITES=off skips them.

/** Editing is only offered on the corporate office (live on e2e): every case that edits runs there. */
const OFFICE = TF_OFFICES.corporate;
/** A local office: read-only Local Office and a read-only grid. */
const LOCAL = TF_OFFICES.local;
const HISTORY = 'Commission Tier/Flat History' as const;
const DEFAULT_UPPER = ADD_ROW_DEFAULTS['Upper Tier Boundary'];

/** A typed value as a step title shows it. */
const shown = (v: string) => (v === '' ? '(empty)' : v.length > 24 ? `${v.slice(0, 21)}…` : v);
const pagesFor = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

test.describe.configure({ timeout: 180_000 });

test.describe('Commission Tier/Flat @commissions', () => {
  let tf: CommissionTierFlatPage;

  // A band left by an interrupted earlier run would make a free service type look taken.
  test.beforeAll(async ({ authenticatedSession, config }, testInfo) => {
    if (!WRITES_ALLOWED) return;
    testInfo.setTimeout(180_000);
    const page = new CommissionTierFlatPage(authenticatedSession.page, config);
    await page.open(OFFICE);
    await page.search();
    await page.purgeLeftovers();
  });

  // Opening the page and the search criteria before any search. Nothing here saves.
  test.describe('A. Page load', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
    });

    test('TC-COM-TF-001: Without a session the page sends the user to sign in', { tag: '@C107910' }, async ({ browser, config }) => {
      await about('Opening the page with no signed-in session lands on the sign-in page, which returns to this page afterwards.');
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await context.newPage();
        const path = TF_PATH(OFFICE);
        await phase('Open the page without signing in', () => page.goto(`${config.base_url.replace(/\/+$/, '')}${path}`));
        await verify('The sign-in page, with this page as the return address', async () => {
          await expect(page).toHaveURL(/\/auth\/sign-in\?callbackUrl=/, { timeout: 30_000 });
          expect(decodeURIComponent(new URL(page.url()).searchParams.get('callbackUrl') ?? '')).toBe(path);
          await expect(page.locator('main table')).toHaveCount(0);
        });
      } finally {
        await context.close();
      }
    });

    test('TC-COM-TF-002: Commission Tier/Flat opens on Basic Information', { tag: '@C107911' }, async () => {
      await about('The page opens with its heading, information text and both tabs, on Basic Information.');
      await tf.open(OFFICE);
      await verify('URL, browser title, heading and information text', async () => {
        expect(tf.page.url()).toContain(TF_PATH(OFFICE));
        expect(await tf.getHeading()).toEqual({ heading: TEXT.header, title: TEXT.pageTitle });
        expect(await tf.getInfoTooltip()).toBe(TEXT.info);
      });
      await verify('Basic Information is the open tab; History is offered', async () => {
        expect(await tf.tabNames()).toEqual(['Basic Information', HISTORY]);
        expect(await tf.selectedTab()).toBe('Basic Information');
      });
    });

    test('TC-COM-TF-003: A local office shows its Local Office as read-only text', { tag: '@C107912' }, async () => {
      await about(`On local office ${LOCAL} the Local Office reads "${LOCAL} - <name>" and cannot be changed (TC-TF-02).`);
      await tf.open(LOCAL);
      const lo = await tf.getLocalOffice();
      await verify(`"${LOCAL} - …" as plain text, no picker`, async () => {
        expect(lo.text.startsWith(`${LOCAL} - `), lo.text).toBe(true);
        expect(lo.readOnlyText).toBe(true);
      });
    });

    test('TC-COM-TF-004: The corporate office offers a Location picker', { tag: '@C107913' }, async () => {
      await about(`On the corporate office ${TF_OFFICES.corporate} the Local Office is a Location picker (TC-TF-01).`);
      await tf.open(TF_OFFICES.corporate);
      await verify('The Local Office field is a picker', async () => {
        expect((await tf.getLocalOffice()).isPicker).toBe(true);
      });
    });

    test('TC-COM-TF-005: A local office lists its tiers read-only', { tag: '@C107914' }, async () => {
      await about(`On local office ${LOCAL} the search lists the tiers with no toolbar, no Delete button and no editor in any cell; editing is for the corporate office.`);
      await tf.open(LOCAL);
      const count = await phase('Search with the default criteria', () => tf.search());
      test.skip(count === 0, 'The office has no tiers');
      await verify('No Save, Add Row, Export, Import, Copy or Reset Dates', async () => {
        expect(await tf.toolbarState()).toEqual({ save: null, addRow: null, export: null, import: null, copy: null, resetDates: null });
      });
      await verify('No Delete button and no editable cell', async () => {
        expect(await tf.hasDeleteButton(tf.rows().first()).catch(() => false)).toBe(false);
        expect(await tf.editableColumns(tf.rows().first())).toEqual([]);
      });
    });

    test('TC-COM-TF-006: The Product Code banner shows when the office has product-code commissions', { tag: '@C107915' }, async () => {
      await about(`Office ${LOCAL} has product-code commissions, so after a search the page says "${TEXT.productCodeBanner}" above the tabs (NM-3384, TC-TF-05).`);
      await tf.open(LOCAL);
      await phase('Search with the default criteria', () => tf.search());
      await verify('Banner shown', async () => {
        await expect(tf.productCodeBanner()).toHaveText(TEXT.productCodeBanner);
      });
    });

    test('TC-COM-TF-007: Currency lists the office currencies and starts on one of them', { tag: '@C107916' }, async () => {
      // The dropdown shows even for a single currency (accepted on review 2026-11-12; the requirements said > 1 only).
      await about('The Currency dropdown lists the office currencies with no blank and starts on one of them (TC-TF-04).');
      await tf.open(LOCAL);
      const options = await tf.getCriteriaOptions('Currency');
      await verify('At least one currency, no blank, the default among them', async () => {
        expect(options.length).toBeGreaterThan(0);
        expect(options).not.toContain('');
        expect(options).toContain(await tf.getCriteriaValue('Currency'));
      });
    });

    test('TC-COM-TF-008: Business Type lists each business type once', { tag: '@C107917' }, async () => {
      await about('Business Type offers each business type once, with no blank, and starts on one of them (NM-1635).');
      await tf.open(OFFICE);
      const options = await tf.getCriteriaOptions('Business Type');
      await verify('Unique, non-blank options; the default among them', async () => {
        expect(options.length).toBeGreaterThan(0);
        expect(options).not.toContain('');
        expect(new Set(options).size).toBe(options.length);
        expect(options).toContain(await tf.getCriteriaValue('Business Type'));
      });
    });

    test('TC-COM-TF-009: Before a search the grid is empty and Save is off', { tag: '@C107918' }, async () => {
      await about('Before a search: "0 items found", the prompt to search, and no Save available.');
      await tf.open(OFFICE);
      await verify('Empty grid asking for a search; Save not available', async () => {
        expect(await tf.getCount()).toBe(0);
        expect(await tf.isMessageVisible(TEXT.emptyBasic)).toBe(true);
        expect(await tf.isSaveEnabled()).toBe(false);
      });
    });
  });

  test.describe('B. Search', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
    });

    test('TC-COM-TF-010: A search starts clean: no errors, Save off, actions on', { tag: '@C107919' }, async () => {
      await about('A fresh search shows no validation marker, Save disabled, and Export, Import, Copy and Reset Dates enabled (NM-3554, TC-TF-06).');
      await phase('Search with the default criteria', () => tf.search());
      const state = await tf.toolbarState();
      await verify('No row flagged and no grid message', async () => {
        expect(await tf.page.locator('main tbody [aria-invalid="true"], main tbody [role="alert"]').count()).toBe(0);
        expect(await tf.gridMessages()).toEqual([]);
      });
      await verify('Save off; Export, Import, Copy and Reset Dates on', async () => {
        expect(state).toMatchObject({ save: false, export: true, import: true, copy: true, resetDates: true });
      });
    });

    test('TC-COM-TF-011: The grid shows every required column, and Grid Options lists them', { tag: '@C107920' }, async () => {
      await about(`The grid offers ${BASIC_COLUMNS_REQUIRED.join(', ')}, each once, all ticked in Grid Options (NM-3621).`);
      await tf.search();
      const headers = await tf.getHeaders();
      await verify('Every required column, none twice', async () => {
        expect(BASIC_COLUMNS_REQUIRED.filter((c) => !headers.includes(c))).toEqual([]);
        expect(new Set(headers).size).toBe(headers.length);
      });
      await verify('Grid Options lists the same columns, ticked', async () => {
        expect(await tf.getGridOptionColumns()).toEqual(headers.map((label) => ({ label, checked: true })));
      });
    });

    test('TC-COM-TF-012: Comm % sits in the same place on both tabs', { tag: '@C107921' }, async () => {
      await about('Lower Tier Boundary, Upper Tier Boundary, Comm % and Profit Only come in the same order on both tabs.');
      const order = (h: string[]) => ['Lower Tier Boundary', 'Upper Tier Boundary', 'Comm %', 'Profit Only'].filter((c) => h.includes(c)).sort((a, b) => h.indexOf(a) - h.indexOf(b));
      await tf.search();
      const basic = order(await tf.getHeaders());
      await tf.openTab(HISTORY);
      await verify('Same order on both tabs', async () => {
        expect(basic).toEqual(order(await tf.getHeaders()));
      });
    });

    test('TC-COM-TF-013: A search lists only service types of the chosen Business Type', { tag: '@C107922' }, async () => {
      await about('Every Service Type in the results is one the row editor offers for the chosen Business Type (NM-1635).');
      await tf.search();
      const listed = new Set(await tf.readColumn('Service Type'));
      test.skip(listed.size === 0, 'No tiers for the default Business Type');
      const allowed = await tf.serviceTypeOptions(await tf.addRow());
      await verify('Each listed service type belongs to the Business Type', async () => {
        expect([...listed].filter((s) => !allowed.includes(s))).toEqual([]);
      });
    });

    test('TC-COM-TF-014: Reset restores the default criteria and clears the grid', { tag: '@C107923' }, async () => {
      await about('After choosing another Business Type and searching, Reset puts the default back and empties the grid.');
      const defaultType = await tf.getCriteriaValue('Business Type');
      const other = (await tf.getCriteriaOptions('Business Type')).find((o) => o !== defaultType);
      await phase('Change Business Type and search', async () => {
        if (other) await tf.chooseCriteria('Business Type', other);
        await tf.search();
      });
      await tf.reset();
      await verify('Default Business Type and an empty grid', async () => {
        await expect.poll(() => tf.getCriteriaValue('Business Type')).toBe(defaultType);
        await expect.poll(() => tf.getCount()).toBe(0);
        expect(await tf.isMessageVisible(TEXT.emptyBasic)).toBe(true);
      });
    });

    test('TC-COM-TF-015: The search criteria panel collapses and expands', { tag: '@C107924' }, async () => {
      await about('Collapse filters hides the search criteria; Expand filters brings them back.');
      await tf.collapseFilters();
      await verify('Search criteria hidden', async () => {
        await expect(tf.searchButton()).not.toBeInViewport();
      });
      await tf.expandFilters();
      await verify('Search criteria shown again', async () => {
        await expect(tf.searchButton()).toBeInViewport();
      });
    });

    test('TC-COM-TF-016: A failed search says so and a retry works', { tag: '@C107925' }, async () => {
      await about('When the server fails the search the page reports it instead of hanging; the next Search lists the tiers.');
      const held = await tf.holdRequests('fail', 0, SEARCH_REQUEST);
      let message = '';
      try {
        await tf.clickSearch();
        message = await tf.readFeedback().catch(() => '');
      } finally {
        await held.undo();
      }
      await verify('An error is shown', async () => {
        expect(message).toMatch(/fail|error|unable|try again|unexpected response/i);
      });
      await verify('Searching again works', async () => {
        expect(await tf.search()).toBeGreaterThanOrEqual(0);
        await expect(tf.page.getByText(TEXT.unexpectedError)).toHaveCount(0);
      });
    });

    test('TC-COM-TF-017: Loading placeholders show while a slow search runs', { tag: '@C107926' }, async () => {
      await about('With the search reply held back, the grid shows loading placeholders until it arrives.');
      const held = await tf.holdRequests('delay', 5_000, SEARCH_REQUEST);
      try {
        await tf.clickSearch();
        await verify('Placeholders or a busy grid while waiting', async () => {
          await expect.poll(async () => tf.page.locator('main [data-slot="skeleton"], main [aria-busy="true"]').count(), { timeout: 4_000 }).toBeGreaterThan(0);
        });
      } finally {
        await held.undo();
      }
    });

    test('TC-COM-TF-018: The search panel works from the keyboard', { tag: '@C107927' }, async () => {
      await about('From Business Type, Tab goes to Reset and then Search, and Enter on Search runs the search.');
      await tf.criteria('Business Type').focus();
      const order: string[] = [];
      for (let i = 0; i < 2; i++) {
        await tf.page.keyboard.press('Tab');
        order.push(await tf.page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText.trim() ?? ''));
      }
      await verify('Business Type → Reset → Search', async () => {
        expect(order).toEqual(['Reset', 'Search']);
      });
      await tf.page.keyboard.press('Enter');
      await verify('Enter on Search lists the results', async () => {
        await expect.poll(() => tf.isMessageVisible(TEXT.emptyBasic), { timeout: 60_000 }).toBe(false);
      });
    });
  });

  // Add Row, the row editors and the context menu. Nothing here saves.
  test.describe('C. Add Row and row controls', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    test('TC-COM-TF-019: Add Row adds a row with the documented defaults and marks the page changed', { tag: '@C107928' }, async () => {
      await about('Add Row adds one row — Lower 0, Upper 100,000,000, every rate 0 %, both flags off — and turns Export, Import, Copy and Reset Dates off (TC-TF-14).');
      const before = await tf.rows().count();
      const row = await phase('Add a row', () => tf.addRow());
      const values = await tf.readRow(row);
      await attachNote('New row', JSON.stringify(values, null, 2));
      await verify('One more row, with the defaults', async () => {
        await expect(tf.rows()).toHaveCount(before + 1);
        for (const [column, expected] of Object.entries(ADD_ROW_DEFAULTS)) {
          if (typeof expected === 'number') expect.soft(toNumber(values[column] ?? ''), column).toBe(expected);
          else expect.soft(values[column], column).toBe(expected);
        }
      });
      await verify('Export, Import, Copy and Reset Dates are off', async () => {
        expect(await tf.toolbarState()).toMatchObject({ export: false, import: false, copy: false, resetDates: false });
      });
    });

    test('TC-COM-TF-020: A new row without a Service Type cannot be saved', { tag: '@C107929' }, async () => {
      await about('A row added with no Service Type keeps Save unavailable until one is chosen.');
      const row = await tf.addRow();
      const serviceType = (await tf.readRow(row))['Service Type'] ?? '';
      test.skip(serviceType !== '' && !/select/i.test(serviceType), `Add Row pre-fills the Service Type ("${serviceType}")`);
      await tf.typeInto(row, 'Lower Tier Boundary', '10');
      await verify('Save unavailable', async () => {
        expect(await tf.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-COM-TF-021: The row Service Type list is clean', { tag: '@C107930' }, async () => {
      await about('The Service Type editor of a row lists each service type once, with no blank or "Select" entry (NM-1635).');
      const options = await tf.serviceTypeOptions(await tf.addRow());
      await attachNote('Service types', options.join(', '));
      await verify('Non-empty, unique, no blank', async () => {
        expect(options.length).toBeGreaterThan(0);
        expect(options.filter((o) => o === '' || /^select/i.test(o))).toEqual([]);
        expect(new Set(options).size).toBe(options.length);
      });
    });

    test('TC-COM-TF-022: Currency, Modified By and Modified On cannot be edited', { tag: '@C107931' }, async () => {
      await about('Neither a saved row nor a new row offers an editor in Currency, Modified By or Modified On.');
      const rows: Locator[] = (await tf.getCount()) > 0 ? [tf.rows().first()] : [];
      rows.push(await tf.addRow());
      for (const row of rows) {
        await verify(`No editor in ${READ_ONLY_FIELDS.join(', ')}`, async () => {
          expect((await tf.editableColumns(row)).filter((c) => (READ_ONLY_FIELDS as readonly string[]).includes(c))).toEqual([]);
        });
      }
    });

    test('TC-COM-TF-023: Currency cannot silently wipe an edit in progress', { tag: '@C107932' }, async () => {
      await about('While a row has an unsaved edit, Currency is disabled or asks first, so the edit is never lost silently (NM-3648).');
      test.skip(!(await tf.hasCriteria('Currency')), 'Single-currency office — no Currency dropdown');
      const row = await tf.savedBand(WRITES_ALLOWED);
      const { column, edited } = await tf.changeRate(row);
      if (!(await tf.criteria('Currency').isEnabled())) {
        await verify('Currency is disabled while editing', async () => expect(tf.criteria('Currency')).toBeDisabled());
        return;
      }
      const current = await tf.getCriteriaValue('Currency');
      const other = (await tf.getCriteriaOptions('Currency')).find((o) => o !== current);
      test.skip(!other, 'Only one currency to choose');
      await tf.chooseCriteria('Currency', other!);
      await verify('The Unsaved changes dialog steps in', async () => {
        expect(await tf.isUnsavedDialogVisible()).toBe(true);
      });
      await tf.stay();
      await verify('After Stay the edit and the Currency are as they were', async () => {
        expect(toNumber((await tf.readRow(row))[column] ?? '')).toBe(Number(edited));
        expect(await tf.getCriteriaValue('Currency')).toBe(current);
      });
    });

    test('TC-COM-TF-024: Is SC Comm Calculated On Net? flips with the Space key', { tag: '@C107933' }, async () => {
      await about('The checkbox can be changed from the keyboard: Space on it flips it.');
      const { row } = await tf.addRowOnFreeServiceType();
      const before = (await tf.readRow(row))['Is SC Comm Calculated On Net?'];
      const after = await phase('Press Space on the checkbox', () => tf.toggle(row, 'Is SC Comm Calculated On Net?', 'space'));
      await verify('The flag changed', async () => {
        expect(after).not.toBe(before);
      });
    });

    test('TC-COM-TF-025: Two added rows are independent', { tag: '@C107934' }, async () => {
      await about('Each Add Row click adds its own row; typing into one does not change the other.');
      const { row, serviceType } = await tf.addRowOnFreeServiceType();
      await tf.typeInto(row, 'Lower Tier Boundary', '100');
      const second = await tf.addRow();
      await tf.setServiceType(second, serviceType);
      await tf.typeInto((await tf.rowWhere(serviceType, 0, DEFAULT_UPPER)) ?? second, 'Lower Tier Boundary', '200');
      await verify('Two rows of the service type, Lower 100 and 200', async () => {
        const lowers = await Promise.all((await tf.rowsOf(serviceType)).map((r) => tf.numberIn(r, 'Lower Tier Boundary')));
        expect(lowers.sort((a, b) => a - b)).toEqual([100, 200]);
      });
    });

    test('TC-COM-TF-026: Changing the Service Type of a new row keeps its values', { tag: '@C107935' }, async () => {
      await about('Typed boundaries survive a change of the row Service Type.');
      const { row, free } = await tf.addRowOnFreeServiceType();
      test.skip(free.length < 2, 'Needs two service types with no tiers');
      await tf.setBand(row, 500, 900);
      await tf.setServiceType(row, free[1]!);
      await verify('Lower 500 and Upper 900 kept', async () => {
        expect(await tf.rowWhere(free[1]!, 500, 900)).not.toBeNull();
      });
    });

    test('TC-COM-TF-027: Deleting a new row leaves nothing to save', { tag: '@C107936' }, async () => {
      await about('Delete on a row just added removes it, and the page is unchanged again (TC-TF-15).');
      const before = await tf.rows().count();
      const row = await tf.addRow();
      await verify('The row offers a Delete button', async () => {
        expect(await tf.hasDeleteButton(row)).toBe(true);
      });
      await tf.deleteRow(row);
      await verify('Row gone; Save off; actions on', async () => {
        await expect(tf.rows()).toHaveCount(before);
        await expect.poll(() => tf.isPristine()).toBe(true);
      });
    });

    test('TC-COM-TF-028: Deleting a saved row hides it, marks the page changed and stores nothing', { tag: '@C107937' }, async () => {
      await about('Delete on a saved row takes it off the grid and turns Save on; reopening without saving brings it back (TC-TF-15, NM-3678).');
      const row = await tf.savedBand(WRITES_ALLOWED);
      const values = await tf.readRow(row);
      const before = await tf.rows().count();
      await tf.deleteRow(row);
      await verify('One row fewer; Save on; Export, Import, Copy and Reset Dates off', async () => {
        await expect(tf.rows()).toHaveCount(before - 1);
        expect(await tf.toolbarState()).toMatchObject({ save: true, export: false, import: false, copy: false, resetDates: false });
      });
      await phase('Reopen without saving', async () => {
        await tf.open(OFFICE);
        await tf.search();
      });
      await verify('The row is back', async () => {
        expect(await tf.rowWhere(values['Service Type'] ?? '', toNumber(values['Lower Tier Boundary'] ?? ''), toNumber(values['Upper Tier Boundary'] ?? ''))).not.toBeNull();
      });
    });
  });

  // Field validation of the number cells, on a row added on a service type with no tiers, so no saved band
  // takes part. A refused value is checked while the cursor is still in the cell (NM-3673) and again after
  // leaving it. Nothing here saves.
  test.describe('D. Field validation', () => {
    let row: Locator;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
      ({ row } = await tf.addRowOnFreeServiceType());
    });

    test('TC-COM-TF-029: Lower Tier Boundary accepts 0 up to the Upper Tier Boundary', { tag: '@C107938' }, async () => {
      await about('Each valid Lower Tier Boundary is kept as that number with no marker, and Save stays available.');
      for (const { typed, kept, why } of LOWER_INPUT.valid) {
        const cell = await tf.typeInto(row, 'Lower Tier Boundary', typed);
        await verify(`"${typed}" → ${kept} (${why})`, async () => {
          expect.soft(toNumber(cell.value)).toBe(kept);
          expect.soft(cell.invalid).toBe(false);
          expect.soft(await tf.isSaveEnabled()).toBe(true);
        });
      }
    });

    test('TC-COM-TF-030: Lower Tier Boundary refuses negatives and values above Upper', { tag: '@C107939' }, async () => {
      await about('Each invalid Lower Tier Boundary is flagged — refused by the input, or marked red with a warning by the time the cell is left — keeps Save off, and is never kept (NM-3673, TC-TF-07/10).');
      for (const { typed, why } of LOWER_INPUT.invalid) {
        const result = await tf.typeRejected(row, 'Lower Tier Boundary', typed, '0');
        await attachNote(`"${shown(typed)}"`, JSON.stringify(result));
        await verify(`"${shown(typed)}" refused (${why})`, async () => {
          expect.soft(result.flagged, 'flagged').toBe(true);
          expect.soft(result.saveEnabledAfterLeaving, 'Save').toBe(false);
          expect.soft(result.keptAfterLeaving, 'kept after leaving').toBe(false);
        });
      }
    });

    test('TC-COM-TF-031: Lower Tier Boundary never keeps non-numeric input or markup', { tag: '@C107940' }, async () => {
      await about('Empty, letters, symbols, decimals, 1e3, 1,000 and markup each end up flagged or as a plain number — never raw text, never run.');
      for (const typed of LOWER_INPUT.guarded) {
        const cell = await tf.typeFreeForm(row, 'Lower Tier Boundary', typed);
        await verify(`"${shown(typed)}" → "${cell.value}"`, async () => {
          expect.soft(cell.flagged || cell.plainNumber, 'flagged or a plain number').toBe(true);
          if (cell.flagged) expect.soft(cell.saveEnabled, 'Save while flagged').toBe(false);
          expect(cell.scriptRan, 'no script ran').toBe(false);
        });
      }
    });

    test('TC-COM-TF-032: Upper Tier Boundary accepts the Lower Tier Boundary and above', { tag: '@C107941' }, async () => {
      await about(`With Lower ${UPPER_LOWER_SEED}, each valid Upper Tier Boundary is kept with no marker, and Save stays available.`);
      await tf.typeInto(row, 'Lower Tier Boundary', String(UPPER_LOWER_SEED));
      for (const { typed, kept, why } of UPPER_INPUT.valid) {
        const cell = await tf.typeInto(row, 'Upper Tier Boundary', typed);
        await verify(`"${typed}" → ${kept} (${why})`, async () => {
          expect.soft(toNumber(cell.value)).toBe(kept);
          expect.soft(cell.invalid).toBe(false);
          expect.soft(await tf.isSaveEnabled()).toBe(true);
        });
      }
    });

    test('TC-COM-TF-033: Upper Tier Boundary refuses negatives and values below Lower', { tag: '@C107942' }, async () => {
      await about(`With Lower ${UPPER_LOWER_SEED}, each invalid Upper Tier Boundary is flagged by the time the cell is left, keeps Save off and is never kept (NM-3673, TC-TF-08/10).`);
      await tf.typeInto(row, 'Lower Tier Boundary', String(UPPER_LOWER_SEED));
      for (const { typed, why } of UPPER_INPUT.invalid) {
        const result = await tf.typeRejected(row, 'Upper Tier Boundary', typed, String(DEFAULT_UPPER));
        await attachNote(`"${shown(typed)}"`, JSON.stringify(result));
        await verify(`"${shown(typed)}" refused (${why})`, async () => {
          expect.soft(result.flagged, 'flagged').toBe(true);
          expect.soft(result.saveEnabledAfterLeaving, 'Save').toBe(false);
          expect.soft(result.keptAfterLeaving, 'kept after leaving').toBe(false);
        });
      }
    });

    test('TC-COM-TF-034: Upper Tier Boundary never keeps non-numeric input', { tag: '@C107943' }, async () => {
      await about('Empty, letters, padded numbers and a fifty-digit number each end up flagged or as a plain number — never raw text.');
      for (const typed of UPPER_INPUT.guarded) {
        const cell = await tf.typeFreeForm(row, 'Upper Tier Boundary', typed);
        await verify(`"${shown(typed)}" → "${cell.value}"`, async () => {
          expect.soft(cell.flagged || cell.plainNumber, 'flagged or a plain number').toBe(true);
          if (cell.flagged) expect.soft(cell.saveEnabled, 'Save while flagged').toBe(false);
        });
      }
    });

    test('TC-COM-TF-035: Comm % accepts 0 to 100', { tag: '@C107944' }, async () => {
      await about('Each Comm % from 0 to 100 is kept as typed with no marker, and Save stays available (NM-3241, TC-TF-09).');
      for (const { typed, kept, why } of COMM_INPUT.valid) {
        const cell = await tf.typeInto(row, 'Comm %', typed);
        await verify(`"${typed}" → ${kept} (${why})`, async () => {
          expect.soft(toNumber(cell.value)).toBe(kept);
          expect.soft(cell.invalid).toBe(false);
          expect.soft(await tf.isSaveEnabled()).toBe(true);
        });
      }
    });

    test('TC-COM-TF-036: Comm % refuses values outside 0 to 100 while typing', { tag: '@C107945' }, async () => {
      await about('Each Comm % below 0 or above 100 is flagged before the cell is left and never kept (NM-3241, TC-TF-09).');
      for (const { typed, why } of COMM_INPUT.invalid) {
        const result = await tf.typeRejected(row, 'Comm %', typed, '0');
        await verify(`"${typed}" refused (${why})`, async () => {
          expect.soft(result.flaggedWhileTyping, 'flagged while typing').toBe(true);
          expect.soft(result.saveEnabled, 'Save').toBe(false);
          expect.soft(result.keptAfterLeaving, 'kept after leaving').toBe(false);
        });
      }
    });

    test('TC-COM-TF-037: Comm % never keeps non-numeric or malformed input', { tag: '@C107946' }, async () => {
      await about('Empty, letters, 1.2.3, three decimals and a typed % each end up flagged or as a plain number — never raw text.');
      for (const typed of COMM_INPUT.guarded) {
        const cell = await tf.typeFreeForm(row, 'Comm %', typed);
        await verify(`"${shown(typed)}" → "${cell.value}"`, async () => {
          expect.soft(cell.flagged || cell.plainNumber, 'flagged or a plain number').toBe(true);
          if (cell.flagged) expect.soft(cell.saveEnabled, 'Save while flagged').toBe(false);
        });
      }
    });

    for (const [field, id, tag] of [['SC Comm %', 'TC-COM-TF-038', '@C107947'], ['ETS Comm %', 'TC-COM-TF-039', '@C107948']] as const) {
      test(`${id}: ${field} accepts 100 and refuses values outside 0 to 100`, { tag }, async () => {
        await about(`${field} shares the Comm % editor: 100 is kept, and 100.01 and -0.01 are flagged while typing (NM-3241).`);
        for (const { typed, kept, why } of RATE_EDGES.valid) {
          const cell = await tf.typeInto(row, field, typed);
          await verify(`"${typed}" → ${kept} (${why})`, async () => {
            expect.soft(toNumber(cell.value)).toBe(kept);
            expect.soft(cell.invalid).toBe(false);
          });
        }
        for (const { typed, why } of RATE_EDGES.invalid) {
          const result = await tf.typeRejected(row, field, typed, '0');
          await verify(`"${typed}" refused (${why})`, async () => {
            expect.soft(result.flaggedWhileTyping, 'flagged while typing').toBe(true);
            expect.soft(result.keptAfterLeaving, 'kept after leaving').toBe(false);
          });
        }
      });
    }

    test('TC-COM-TF-040: A boundary pair out of order shows its message and clears once corrected', { tag: '@C107949' }, async () => {
      await about(`With Lower 5,000 and Upper 4,000 the row is marked with "${TEXT.lowerAboveUpper}" and Save is off; Upper 6,000 clears the mark and turns Save on (NM-3673).`);
      await tf.typeInto(row, 'Lower Tier Boundary', '5000');
      await tf.typeInto(row, 'Upper Tier Boundary', '4000');
      const message = (await tf.cellWarning(row, 'Lower Tier Boundary')) ?? (await tf.cellWarning(row, 'Upper Tier Boundary'));
      await verify(`Marked: "${message}"; Save off`, async () => {
        expect(await tf.isRowFlagged(row)).toBe(true);
        expect(message).toBe(TEXT.lowerAboveUpper);
        expect(await tf.isSaveEnabled()).toBe(false);
      });
      await tf.typeInto(row, 'Upper Tier Boundary', '6000');
      await verify('Mark gone; Save on', async () => {
        await expect.poll(() => tf.isRowFlagged(row), { timeout: 5_000 }).toBe(false);
        expect(await tf.isSaveEnabled()).toBe(true);
      });
    });
  });

  // The overlap rule: bands of one service type may not overlap (max(L1, L2) ≤ min(U1, U2)); gaps are allowed.
  // Nothing here saves.
  test.describe('E. Overlap and gaps', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    test('TC-COM-TF-041: Overlapping bands of one service type are both flagged', { tag: '@C107950' }, async () => {
      await about('Partly overlapping, nested, identical and boundary-sharing bands of one service type flag both rows and keep Save off (TC-TF-11).');
      for (const { a, b, why } of OVERLAPPING) {
        const { rows } = await phase(`Bands ${a.lower}–${a.upper} and ${b.lower}–${b.upper}`, () => tf.addTwoBands(a, b));
        const flags = await Promise.all(rows.map((r) => tf.isRowFlagged(r)));
        await verify(`Both flagged, Save off (${why})`, async () => {
          expect.soft(flags, why).toEqual([true, true]);
          expect.soft(await tf.isSaveEnabled(), why).toBe(false);
        });
        await tf.open(OFFICE);
        await tf.search();
      }
    });

    test('TC-COM-TF-042: Adjacent bands and bands with a gap are accepted', { tag: '@C107951' }, async () => {
      await about('Bands that do not share a value — adjacent, or with a gap between them — are accepted (TC-TF-13).');
      for (const { a, b, why } of SEPARATE) {
        const { rows } = await phase(`Bands ${a.lower}–${a.upper} and ${b.lower}–${b.upper}`, () => tf.addTwoBands(a, b));
        const flags = await Promise.all(rows.map((r) => tf.isRowFlagged(r)));
        await verify(`Neither flagged, Save on (${why})`, async () => {
          expect.soft(flags, why).toEqual([false, false]);
          expect.soft(await tf.isSaveEnabled(), why).toBe(true);
        });
        await tf.open(OFFICE);
        await tf.search();
      }
    });

    test('TC-COM-TF-043: The same band on two service types is accepted', { tag: '@C107952' }, async () => {
      await about('Overlap is per service type: 0–1,000 on two different service types is not an overlap.');
      const { row, serviceType, free } = await tf.addRowOnFreeServiceType();
      test.skip(free.length < 2, 'Needs two service types with no tiers');
      const other = free.find((s) => s !== serviceType)!;
      await tf.setBand(row, 0, 1_000);
      const second = await tf.addRow();
      await tf.setServiceType(second, other);
      await tf.setBand((await tf.rowsOf(other))[0]!, 0, 1_000);
      await verify('Neither row flagged; Save on', async () => {
        expect(await tf.isRowFlagged((await tf.rowsOf(serviceType))[0]!)).toBe(false);
        expect(await tf.isRowFlagged((await tf.rowsOf(other))[0]!)).toBe(false);
        expect(await tf.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-COM-TF-044: Fixing an overlap clears the marker on both rows', { tag: '@C107953' }, async () => {
      await about('With 0–5,000 and 4,000–9,000 flagged, moving the second lower boundary to 5,001 clears both rows (TC-TF-12).');
      const { serviceType } = await tf.addTwoBands({ lower: 0, upper: 5_000 }, { lower: 4_000, upper: 9_000 });
      await tf.typeInto((await tf.rowWhere(serviceType, 4_000, 9_000))!, 'Lower Tier Boundary', '5001');
      await verify('Neither row flagged; Save on', async () => {
        const rows = await tf.rowsOf(serviceType);
        await expect.poll(async () => Promise.all(rows.map((r) => tf.isRowFlagged(r)))).toEqual([false, false]);
        expect(await tf.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-COM-TF-045: Deleting one of two overlapping rows clears the other', { tag: '@C107954' }, async () => {
      await about('Delete on one of two overlapping rows recalculates the overlap: the remaining row is no longer flagged (TC-TF-15).');
      const { serviceType } = await tf.addTwoBands({ lower: 0, upper: 5_000 }, { lower: 1_000, upper: 2_000 });
      await tf.deleteRow((await tf.rowWhere(serviceType, 1_000, 2_000))!);
      await verify('The remaining row is not flagged', async () => {
        await expect.poll(async () => tf.isRowFlagged((await tf.rowsOf(serviceType))[0]!)).toBe(false);
      });
    });

    test('TC-COM-TF-046: Moving an overlapping row to another service type clears the overlap', { tag: '@C107955' }, async () => {
      await about('Changing the Service Type of one of two overlapping rows leaves neither flagged.');
      const { serviceType, free } = await tf.addTwoBands({ lower: 0, upper: 5_000 }, { lower: 1_000, upper: 2_000 });
      const other = free.find((s) => s !== serviceType);
      test.skip(!other, 'Needs two service types with no tiers');
      await tf.setServiceType((await tf.rowWhere(serviceType, 1_000, 2_000))!, other!);
      await verify('Neither row flagged', async () => {
        const rows = [...(await tf.rowsOf(serviceType)), ...(await tf.rowsOf(other!))];
        await expect.poll(async () => Promise.all(rows.map((r) => tf.isRowFlagged(r)))).toEqual([false, false]);
      });
    });

    test('TC-COM-TF-047: A new band overlapping a saved band is flagged', { tag: '@C107956' }, async () => {
      await about('A new row with the same band as a saved row of its service type is flagged and cannot be saved (TC-TF-11).');
      const saved = await tf.readRow(await tf.savedBand(WRITES_ALLOWED));
      const serviceType = saved['Service Type'] ?? '';
      const row = await tf.addRow();
      await tf.setServiceType(row, serviceType);
      await tf.setBand((await tf.rowWhere(serviceType, 0, DEFAULT_UPPER)) ?? row, toNumber(saved['Lower Tier Boundary'] ?? ''), toNumber(saved['Upper Tier Boundary'] ?? ''));
      await verify('The overlap is shown; Save off', async () => {
        expect((await Promise.all((await tf.rowsOf(serviceType)).map((r) => tf.isRowFlagged(r)))).some(Boolean)).toBe(true);
        expect(await tf.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-COM-TF-048: Save stays off while a row is invalid, and clicking it sends nothing', { tag: '@C107957' }, async () => {
      await about('A row with Lower above Upper keeps Save off and a click sends no request; fixing it turns Save on.');
      const { row } = await tf.addRowOnFreeServiceType();
      await tf.typeInto(row, 'Upper Tier Boundary', '10');
      await tf.typeInto(row, 'Lower Tier Boundary', '20');
      const posts = tf.countPosts();
      try {
        await tf.toolbarButton('save').click({ force: true }).catch(() => {});
        await verify('Save off; nothing sent', async () => {
          expect(await tf.isSaveEnabled()).toBe(false);
          expect(posts.count()).toBe(0);
        });
      } finally {
        posts.stop();
      }
      await tf.typeInto(row, 'Lower Tier Boundary', '5');
      await verify('Save on once fixed', async () => {
        await expect.poll(() => tf.isSaveEnabled()).toBe(true);
      });
    });
  });

  // The unsaved-changes guard. Each case starts with an unsaved new row; nothing here saves.
  test.describe('F. Unsaved changes', () => {
    let serviceType: string;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
      ({ serviceType } = await tf.addRowOnFreeServiceType());
    });

    test('TC-COM-TF-049: An unsaved edit turns Save on and Export, Import, Copy and Reset Dates off', { tag: '@C107958' }, async () => {
      await about('With a pending edit, Save is on and Export, Import, Copy and Reset Dates are off (NM-3678, TC-TF-16).');
      await verify('Save on; the four actions off', async () => {
        expect(await tf.toolbarState()).toMatchObject({ save: true, export: false, import: false, copy: false, resetDates: false });
      });
    });

    test('TC-COM-TF-050: Switching tab with an unsaved edit asks first, and Stay keeps the edit', { tag: '@C107959' }, async () => {
      await about('Opening History with a pending edit shows the Unsaved changes dialog with Stay and Discard; Stay keeps the user and the edit (NM-3679, NM-3606, TC-TF-18/19).');
      await tf.clickTab(HISTORY);
      const dialog = await tf.getUnsavedDialog();
      await verify('Unsaved changes dialog with Stay and Discard', async () => {
        expect(dialog.text).toContain(TEXT.unsavedTitle);
        expect(dialog.buttons).toEqual(expect.arrayContaining(['Stay', 'Discard']));
      });
      await tf.stay();
      await verify('Still on Basic Information with the edit pending', async () => {
        expect(await tf.selectedTab()).toBe('Basic Information');
        expect(await tf.rowsOf(serviceType)).toHaveLength(1);
        expect(await tf.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-COM-TF-051: Discard drops the unsaved edit and opens the other tab', { tag: '@C107960' }, async () => {
      await about('Discard leaves for History, and the new row is gone back on Basic Information (TC-TF-20).');
      await tf.clickTab(HISTORY);
      await tf.getUnsavedDialog();
      await tf.discard();
      await verify('History is open', async () => {
        await expect.poll(() => tf.selectedTab()).toBe(HISTORY);
      });
      await tf.openTab('Basic Information');
      if (await tf.isMessageVisible(TEXT.emptyBasic)) await tf.search();
      await verify('The new row is gone; Save off', async () => {
        expect(await tf.rowsOf(serviceType)).toHaveLength(0);
        expect(await tf.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-COM-TF-052: Escape on the dialog keeps the edit', { tag: '@C107961' }, async () => {
      await about('Escape closes the Unsaved changes dialog like Stay.');
      await tf.clickTab(HISTORY);
      await tf.getUnsavedDialog();
      await tf.escapeDialog();
      await verify('Still on Basic Information with the new row', async () => {
        expect(await tf.selectedTab()).toBe('Basic Information');
        expect(await tf.rowsOf(serviceType)).toHaveLength(1);
      });
    });

    for (const [label, id, tag] of [['Currency', 'TC-COM-TF-053', '@C107962'], ['Business Type', 'TC-COM-TF-054', '@C107963']] as const) {
      test(`${id}: Changing ${label} with an unsaved edit asks first, and Discard then searches properly`, { tag }, async () => {
        await about(`Choosing another ${label} with a pending edit shows the dialog; after Discard, Search lists that ${label}'s tiers — never stuck at "0 items" (NM-3689, TC-TF-21).`);
        test.skip(!(await tf.hasCriteria(label)), `No ${label} dropdown on this office`);
        const current = await tf.getCriteriaValue(label);
        const other = (await tf.getCriteriaOptions(label)).find((o) => o !== current);
        test.skip(!other, `Only one ${label}`);
        await tf.chooseCriteria(label, other!);
        await verify('Unsaved changes dialog shown', async () => {
          expect(await tf.isUnsavedDialogVisible()).toBe(true);
        });
        await tf.discard();
        const count = await phase('Search', () => tf.search());
        await phase(`Reopen and choose ${other} without edits`, async () => {
          await tf.open(OFFICE);
          await tf.chooseCriteria(label, other!);
        });
        await verify(`The same ${label} tiers as a clean search`, async () => {
          expect(count).toBe(await tf.search());
        });
      });
    }

    test('TC-COM-TF-055: Searching again with an unsaved edit asks first', { tag: '@C107964' }, async () => {
      await about('Search with a pending edit shows the Unsaved changes dialog; Stay keeps the edit.');
      await tf.clickSearch();
      await verify('Unsaved changes dialog shown', async () => {
        await expect.poll(() => tf.isUnsavedDialogVisible()).toBe(true);
      });
      await tf.stay();
      await verify('The edit is still pending', async () => {
        expect(await tf.rowsOf(serviceType)).toHaveLength(1);
      });
    });

    test('TC-COM-TF-056: Reset with an unsaved edit asks first, with the same dialog as a tab switch', { tag: '@C107965' }, async () => {
      await about('Reset with a pending edit shows the Unsaved changes dialog, worded exactly as for a tab switch (NM-3679).');
      await tf.clickTab(HISTORY);
      const onTab = await tf.getUnsavedDialog();
      await tf.stay();
      await tf.reset();
      const onReset = await tf.getUnsavedDialog();
      await tf.stay();
      await verify('Same text and buttons', async () => {
        expect(onReset).toEqual(onTab);
      });
    });

    test('TC-COM-TF-057: Reloading with an unsaved edit raises the browser prompt', { tag: '@C107966' }, async () => {
      await about('A browser reload with a pending edit raises the browser\'s own leave-page prompt.');
      const prompt = await phase('Reload', () => tf.reloadAndWatchPrompt());
      await verify('A beforeunload prompt was raised', async () => {
        expect(prompt).toBe('beforeunload');
      });
    });

    test('TC-COM-TF-058: Changing the Location with an unsaved edit asks first', { tag: '@C107967' }, async () => {
      await about('On the corporate office, choosing another location with a pending edit shows the dialog (NM-3689).');
      await phase(`Open ${TF_OFFICES.corporate}, search and add a row`, async () => {
        await tf.open(TF_OFFICES.corporate);
        await tf.search();
        await tf.addRowOnFreeServiceType();
      });
      await tf.chooseLocation(LOCAL);
      await verify('Unsaved changes dialog shown', async () => {
        await expect.poll(() => tf.isUnsavedDialogVisible()).toBe(true);
      });
    });
  });

  // Typing a value back: the page must count only real changes (NM-3429). Edits are never saved.
  test.describe('G. Reverting edits', () => {
    let row: Locator;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
      row = await tf.savedBand(WRITES_ALLOWED);
    });

    test('TC-COM-TF-059: Typing a rate back leaves nothing to save', { tag: '@C107968' }, async () => {
      await about('Changing a rate and typing the original back turns Save off and the actions on again (NM-3429, TC-TF-17).');
      const { column, original } = await tf.changeRate(row);
      await verify('Save on after the change', async () => {
        expect(await tf.isSaveEnabled()).toBe(true);
      });
      await tf.typeInto(row, column, String(toNumber(original)));
      await verify('Save off once the row is back as it was', async () => {
        await expect.poll(() => tf.isPristine()).toBe(true);
      });
    });

    test('TC-COM-TF-060: Typing a boundary back leaves nothing to save', { tag: '@C107969' }, async () => {
      await about('Changing Upper Tier Boundary and typing the original back turns Save off (NM-3429).');
      const original = await tf.numberIn(row, 'Upper Tier Boundary');
      await tf.typeInto(row, 'Upper Tier Boundary', String(original - 1));
      await verify('Save on after the change', async () => {
        expect(await tf.isSaveEnabled()).toBe(true);
      });
      await tf.typeInto(row, 'Upper Tier Boundary', String(original));
      await verify('Save off once the row is back as it was', async () => {
        await expect.poll(() => tf.isPristine()).toBe(true);
      });
    });

    test('TC-COM-TF-061: Ticking Profit Only and unticking it leaves nothing to save', { tag: '@C107970' }, async () => {
      await about('Profit Only flipped and flipped back returns the page to unchanged (NM-3429).');
      await tf.toggle(row, 'Profit Only');
      await verify('Save on after the change', async () => {
        expect(await tf.isSaveEnabled()).toBe(true);
      });
      await tf.toggle(row, 'Profit Only');
      await verify('Save off once the row is back as it was', async () => {
        await expect.poll(() => tf.isPristine()).toBe(true);
      });
    });

    test('TC-COM-TF-062: Retyping the stored value is not a change', { tag: '@C107971' }, async () => {
      await about('Typing exactly the stored Lower Tier Boundary leaves Save off.');
      await tf.typeInto(row, 'Lower Tier Boundary', String(await tf.numberIn(row, 'Lower Tier Boundary')));
      await verify('Save off; actions on', async () => {
        expect(await tf.isPristine()).toBe(true);
      });
    });
  });

  // Saving. The first three cases stop the request in the browser, so nothing is stored. The others write
  // marker bands (Upper AUTO_UPPER) and remove them afterwards.
  test.describe('H. Save', () => {
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    /** Removes the marker bands a case saved. */
    async function cleanUp(): Promise<void> {
      try {
        await tf.open(OFFICE);
        await tf.search();
        await tf.purgeLeftovers();
      } catch (error) {
        // Never let clean-up hide the test's own failure; the next run's beforeAll purges what is left.
        await attachNote('Clean-up failed', String(error));
      }
    }

    test('TC-COM-TF-063: Save sends only the edited and the new rows', { tag: '@C107972' }, async () => {
      await about('With one saved row edited and one row added, the save request carries exactly those two rows (TC-TF-22). The request never reaches the server.');
      const { edited } = await tf.changeRate(await tf.savedBand(WRITES_ALLOWED));
      const { row } = await tf.addRowOnFreeServiceType();
      await tf.setBand(row, 10, 20);
      const held = await tf.holdRequests('abort');
      try {
        await tf.clickSave();
        await expect.poll(() => held.bodies.length, { timeout: 15_000 }).toBeGreaterThan(0);
      } finally {
        await held.undo();
      }
      const records = tierRecords(held.bodies[0]!);
      await attachNote('Save request', held.bodies[0]!.slice(0, 4_000));
      await verify('Two records; the edited rate is among them', async () => {
        expect(records).toHaveLength(2);
        expect(JSON.stringify(records)).toMatch(new RegExp(`\\b(${Number(edited)}(\\.0+)?|${Number(edited) / 100})\\b`));
      });
    });

    test('TC-COM-TF-064: A failed save keeps the changes and says so', { tag: '@C107973' }, async () => {
      await about('When the server rejects a save, an error is shown and the new row stays on screen with Save on.');
      const { row, serviceType } = await tf.addRowOnFreeServiceType();
      await tf.setBand(row, 10, 20);
      const held = await tf.holdRequests('fail');
      let message = '';
      try {
        message = await phase('Save while the server fails', () => tf.save());
      } finally {
        await held.undo();
      }
      await verify('Error message; the row kept; Save on', async () => {
        expect(message).toMatch(/fail|error|unable|could not/i);
        expect(await tf.rowWhere(serviceType, 10, 20)).not.toBeNull();
        await expect.poll(() => tf.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-COM-TF-065: Double-clicking Save sends one request', { tag: '@C107974' }, async () => {
      await about('Two quick clicks on Save send a single save request. Nothing reaches the server.');
      const { row } = await tf.addRowOnFreeServiceType();
      await tf.setBand(row, 10, 20);
      const held = await tf.holdRequests('abort');
      try {
        await tf.toolbarButton('save').dblclick();
        await tf.readFeedback().catch(() => '');
      } finally {
        await held.undo();
      }
      await verify('One request', async () => {
        expect(held.bodies).toHaveLength(1);
      });
    });

    test('TC-COM-TF-066: A new band is saved, the page resets, and Copy opens without a warning', { tag: '@C107975' }, async () => {
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('Saving a new band succeeds, turns Save off and the actions on, lets Copy open straight away (NM-3428, TC-TF-23), and a new search lists it.');
      const { row, serviceType } = await tf.addRowOnFreeServiceType();
      try {
        await tf.setBand(row, 0, AUTO_UPPER);
        await tf.typeInto(row, 'Comm %', '7.5');
        const message = await phase('Save', () => tf.save());
        await verify('Success; the page is unchanged again', async () => {
          expect(message).not.toMatch(/fail|error/i);
          await expect.poll(() => tf.isPristine()).toBe(true);
        });
        const panel = await tf.openCopy('within');
        await verify('Copy opens with no "save or discard" warning', async () => {
          await expect(panel).toBeVisible();
          await expect(tf.page.getByText(/save or discard/i)).toHaveCount(0);
        });
        await tf.closeCopy(panel, 'cancel');
        await tf.search();
        await verify('The band is listed with Comm % 7.5', async () => {
          expect(await tf.numberIn((await tf.rowWhere(serviceType, 0, AUTO_UPPER))!, 'Comm %')).toBe(7.5);
        });
      } finally {
        await cleanUp();
      }
    });

    test('TC-COM-TF-067: An edit to a saved band is stored', { tag: '@C107976' }, async () => {
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('Changing Comm % of a saved band and saving stores the new rate.');
      const { row, serviceType } = await tf.addRowOnFreeServiceType();
      try {
        await tf.setBand(row, 0, AUTO_UPPER);
        await tf.save();
        await tf.search();
        await tf.typeInto((await tf.rowWhere(serviceType, 0, AUTO_UPPER))!, 'Comm %', '12.5');
        await phase('Save the edit', () => tf.save());
        await tf.search();
        await verify('Comm % 12.5 is listed', async () => {
          expect(await tf.numberIn((await tf.rowWhere(serviceType, 0, AUTO_UPPER))!, 'Comm %')).toBe(12.5);
        });
      } finally {
        await cleanUp();
      }
    });

    test('TC-COM-TF-068: Deleting a saved band and saving removes it', { tag: '@C107977' }, async () => {
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('Delete on a saved band, then Save, removes it from the next search.');
      const { row, serviceType } = await tf.addRowOnFreeServiceType();
      try {
        await tf.setBand(row, 0, AUTO_UPPER);
        await tf.save();
        await tf.search();
        await tf.deleteRow((await tf.rowWhere(serviceType, 0, AUTO_UPPER))!);
        await phase('Save the deletion', () => tf.save());
        await tf.search();
        await verify('The band is gone', async () => {
          expect(await tf.rowWhere(serviceType, 0, AUTO_UPPER)).toBeNull();
        });
      } finally {
        await cleanUp();
      }
    });

    test('TC-COM-TF-069: Save cannot be pressed again while a save is in progress', { tag: '@C107978' }, async () => {
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('With the save reply held back, Save is off (or a progress indicator shows) until the reply arrives.');
      const { row } = await tf.addRowOnFreeServiceType();
      await tf.setBand(row, 0, AUTO_UPPER);
      const held = await tf.holdRequests('delay', 6_000);
      try {
        await tf.clickSave();
        await verify('Save off or busy while waiting', async () => {
          await expect.poll(async () => !(await tf.isSaveEnabled())
            || (await tf.page.locator('main [role="progressbar"], main [aria-busy="true"], main .animate-spin').count()) > 0, { timeout: 4_000 }).toBe(true);
        });
        await tf.readFeedback(60_000).catch(() => '');
      } finally {
        await held.undo();
        await cleanUp();
      }
    });
  });

  test.describe('I. Export and import', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    test('TC-COM-TF-070: Export downloads TierFlatCommissions-<office>.xlsx with its column headers', { tag: '@C107979' }, async () => {
      // The export names differ from the grid ("Commission %", an extra "Local Office Id") — accepted on review 2026-11-12.
      await about(`Export downloads ${EXPORT_FILE(OFFICE)} (NM-3677, TC-TF-24) with the export header row: ${EXPORT_HEADERS.join(', ')}.`);
      const file = await phase('Export', () => tf.exportGrid());
      await attachNote('Export headers', (file.rows[0] ?? []).join(' | '));
      await verify(`File name ${EXPORT_FILE(OFFICE)}`, async () => {
        expect(file.name).toBe(EXPORT_FILE(OFFICE));
      });
      await verify('The export header row, in order', async () => {
        expect(file.rows[0]?.filter(Boolean)).toEqual([...EXPORT_HEADERS]);
      });
    });

    test('TC-COM-TF-071: The export lists every row with Modified On in UTC', { tag: '@C107980' }, async () => {
      // The export carries UTC while the grid shows local time — intended (BUG-COM-TF-006 dropped on review 2026-11-13).
      await about('The export has one line per grid row, and a band\'s Modified On is the grid time in UTC (NM-4195, TC-TF-25).');
      const count = await tf.getCount();
      test.skip(count === 0, 'No tiers to export');
      const first = await tf.readRow(tf.rows().first());
      const [head = [], ...data] = (await tf.exportGrid()).rows;
      const col = (name: string) => head.indexOf(name);
      const match = data.find((r) => r[col('Service Type')] === first['Service Type']
        && toNumber(r[col('Lower Tier Boundary')] ?? '') === toNumber(first['Lower Tier Boundary'] ?? '')
        && toNumber(r[col('Upper Tier Boundary')] ?? '') === toNumber(first['Upper Tier Boundary'] ?? ''));
      // To the minute: the grid shows no seconds. The browser reads the grid time in its own (the grid's) time zone.
      const gridUtc = await tf.page.evaluate((t) => new Date(t.replace(',', '')).toISOString().slice(0, 16), first['Modified On'] ?? '');
      const exported = match?.[col('Modified On')] ?? '';
      const exportUtc = new Date(`${exported} UTC`).toISOString().slice(0, 16);
      await attachNote('Modified On', `grid "${first['Modified On']}" (= ${gridUtc} UTC); export "${exported}"`);
      await verify(`${count} lines; the first band's Modified On is the grid time in UTC`, async () => {
        expect(data.filter((r) => r.some(Boolean))).toHaveLength(count);
        expect(exportUtc).toBe(gridUtc);
      });
    });

    test('TC-COM-TF-072: Import refuses every file that is not Excel', { tag: '@C107981' }, async () => {
      await about(`${BAD_UPLOADS.map((b) => b.name).join(', ')} are each refused with the "Excel files only" message (VALID_MSG_4), and nothing is uploaded (TC-TF-26).`);
      for (const bad of BAD_UPLOADS) {
        const result = await tf.importFile({ name: bad.name, mimeType: bad.mimeType, buffer: Buffer.from(bad.body) });
        await verify(`${bad.name} refused; no upload`, async () => {
          expect.soft(result.message, bad.name).toMatch(TEXT.invalidFileType);
          expect.soft(result.uploads, bad.name).toBe(0);
        });
        await tf.page.keyboard.press('Escape');
      }
    });

    test('TC-COM-TF-073: Importing the file just exported succeeds without a duplicate error', { tag: '@C107982' }, async () => {
      test.fail(true, 'BUG-COM-TF-014: re-importing an unchanged export fails with "An item with the same key has already been added. Key: 1101" (NM-3425)');
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('Re-importing an unchanged export — every band already stored — succeeds, never an HTTP 400 for duplicates (NM-3425).');
      const count = await tf.getCount();
      test.skip(count === 0, 'No tiers to round-trip');
      const file = await tf.exportGrid();
      const result = await phase('Import the exported file', () => tf.importFile({
        name: file.name,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: CommissionTierFlatPage.workbook(file.rows),
      }));
      await verify('No error; the same number of tiers', async () => {
        expect(result.message).not.toMatch(/\b400\b|duplicate|bad request|fail|unexpected|same key|error/i);
        expect(await tf.search()).toBe(count);
      });
    });

    test('TC-COM-TF-074: An Excel file with invalid values is refused and stores nothing', { tag: '@C107983' }, async () => {
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('A file with a negative lower boundary and a 150 % rate is reported with errors, and its band is not stored.');
      const headers = (await tf.exportGrid()).rows[0] ?? [];
      const { serviceType } = await tf.addRowOnFreeServiceType();
      const values: Record<string, string | number> = {
        'Service Type': serviceType, 'Lower Tier Boundary': -5, 'Upper Tier Boundary': AUTO_UPPER, 'Comm %': 150,
        'SC Comm %': 0, 'ETS Comm %': 0, 'Profit Only': 'No', 'Is SC Comm Calculated On Net?': 'No',
      };
      await tf.open(OFFICE);
      await tf.search();
      try {
        const result = await phase('Import the invalid file', () => tf.importFile({
          name: EXPORT_FILE(OFFICE),
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: CommissionTierFlatPage.workbook([headers, headers.map((h) => values[h] ?? '')]),
        }));
        await tf.search();
        await verify('Errors reported; the band is not stored', async () => {
          expect(result.message).toMatch(/error|invalid|fail|0 (record|row)s? (imported|saved)/i);
          expect(await tf.rowsOf(serviceType)).toHaveLength(0);
        });
      } finally {
        await tf.purgeLeftovers();
      }
    });
  });

  test.describe('J. Copy', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    test('TC-COM-TF-075: Copy Within Location offers only service types of the same Business Type', { tag: '@C107984' }, async () => {
      await about('The destinations of Copy Within Location are service types of the chosen Business Type, never the source itself (NM-3728, TC-TF-27).');
      const source = (await tf.readRow(await tf.savedBand(WRITES_ALLOWED)))['Service Type'] ?? '';
      const allowed = await tf.serviceTypeOptions(await tf.addRow());
      await tf.open(OFFICE);
      await tf.search();
      const panel = await tf.openCopy('within');
      await tf.chooseCopySource(panel, source);
      const targets = (await tf.copyTargets(panel)).map((t) => t.label).filter(Boolean);
      await verify('Every destination belongs to the Business Type; the source is not offered', async () => {
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.filter((t) => !allowed.some((a) => t.includes(a)))).toEqual([]);
        expect(targets).not.toContain(source);
      });
    });

    for (const [kind, close, id, tag] of [['within', 'cancel', 'TC-COM-TF-076', '@C107985'], ['locations', 'escape', 'TC-COM-TF-077', '@C107986']] as const) {
      test(`${id}: Copy ${kind === 'within' ? 'Within Location' : 'to Locations'} ticks are cleared after closing`, { tag }, async () => {
        await about(`A destination ticked and then closed with ${close === 'cancel' ? 'Cancel' : 'Escape'} is unticked when the panel opens again (NM-3687, TC-TF-30).`);
        let panel = await tf.openCopy(kind);
        await tf.tickTarget(panel, 0);
        await tf.closeCopy(panel, close);
        panel = await tf.openCopy(kind);
        await verify('Nothing ticked on reopening', async () => {
          expect((await tf.copyTargets(panel)).filter((t) => t.checked)).toEqual([]);
        });
      });
    }

    test('TC-COM-TF-078: After Copy Within Location the source stays, Search works and the ticks are cleared', { tag: '@C107987' }, async () => {
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('Copying a band to a service type with no tiers keeps the source listed and Search usable (NM-3686, TC-TF-29), and the panel opens clear again (NM-3687).');
      const { row, serviceType: source, free } = await tf.addRowOnFreeServiceType();
      test.skip(free.length < 2, 'Needs two service types with no tiers');
      const target = free.find((s) => s !== source)!;
      try {
        await tf.setBand(row, 0, AUTO_UPPER);
        await tf.save();
        const before = await tf.search();
        let panel = await tf.openCopy('within');
        await tf.chooseCopySource(panel, source);
        await tf.tickTargetNamed(panel, target);
        await attachNote('Copy', JSON.stringify(await phase('Apply', () => tf.applyCopy(panel))));
        await verify('The source band is listed; Search enabled', async () => {
          expect(await tf.rowWhere(source, 0, AUTO_UPPER)).not.toBeNull();
          expect(await tf.isSearchEnabled()).toBe(true);
        });
        await verify('A new search lists the copy too', async () => {
          expect(await tf.search()).toBe(before + 1);
          expect(await tf.rowWhere(target, 0, AUTO_UPPER)).not.toBeNull();
        });
        panel = await tf.openCopy('within');
        await verify('Nothing ticked on reopening', async () => {
          expect((await tf.copyTargets(panel)).filter((t) => t.checked)).toEqual([]);
        });
        await tf.closeCopy(panel, 'cancel');
      } finally {
        await tf.open(OFFICE);
        await tf.search();
        await tf.purgeLeftovers();
      }
    });

  });

  test.describe('K. Reset Dates', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    test('TC-COM-TF-079: Reset Dates opens with January–June and July–December columns', { tag: '@C107988' }, async () => {
      await about('Reset Dates opens "Commission Tier Reset" with twelve month selectors: January–June in the first column, July–December in the second (NM-2168).');
      const dialog = await phase('Open Reset Dates', () => tf.openResetDates());
      const at = await tf.monthPositions();
      await verify('Title and twelve selectors', async () => {
        await expect(dialog).toContainText(TEXT.resetModalTitle);
        expect(at.every((p) => p.x >= 0)).toBe(true);
      });
      await verify('Two columns, each top to bottom', async () => {
        const [col1, col2] = [at.slice(0, 6), at.slice(6)];
        // Each column lines up within a few pixels, and the whole first column sits left of the second.
        const xs = (col: { x: number }[]) => col.map((p) => p.x);
        expect(Math.max(...xs(col1)) - Math.min(...xs(col1))).toBeLessThanOrEqual(10);
        expect(Math.max(...xs(col2)) - Math.min(...xs(col2))).toBeLessThanOrEqual(10);
        expect(Math.max(...xs(col1))).toBeLessThan(Math.min(...xs(col2)));
        for (const col of [col1, col2]) expect(col.map((p) => p.y)).toEqual([...col.map((p) => p.y)].sort((a, b) => a - b));
      });
    });

    test('TC-COM-TF-080: Every month offers blank and each day of that month', { tag: '@C107989' }, async () => {
      test.fail(true, 'BUG-COM-TF-007: every Reset Dates month offers only a blank and "1" (NM-3510)');
      const year = new Date().getFullYear();
      await about(`Each selector offers a blank (0) choice and the days 1 to the month's last day — not just "1" (NM-3510, TC-TF-35); February follows ${year}.`);
      await tf.openResetDates();
      for (const [m, short] of MONTHS.entries()) {
        const days = daysInMonth(year, m + 1);
        const options = await tf.monthOptions(m);
        await verify(`${MONTH_NAMES[m]}: blank or 0, then 1 – ${days}`, async () => {
          expect.soft(['', '0', '-'], short).toContain(options[0]);
          expect.soft(options.slice(1), short).toEqual(Array.from({ length: days }, (_, i) => String(i + 1)));
        });
      }
    });

    test('TC-COM-TF-081: Cancel closes Reset Dates at once and keeps nothing', { tag: '@C107990' }, async () => {
      await about('After changing January, Cancel closes the modal with no warning; reopening shows the stored January value.');
      await tf.openResetDates();
      const stored = await tf.monthValue(0);
      const other = (await tf.monthOptions(0)).find((o) => o !== stored);
      test.skip(other === undefined, 'January offers no other choice');
      await tf.setMonth(0, other!);
      await tf.cancelResetDates();
      await verify('No warning dialog', async () => {
        expect(await tf.isUnsavedDialogVisible()).toBe(false);
      });
      await tf.openResetDates();
      await verify(`January shows "${stored}" again`, async () => {
        expect(await tf.monthValue(0)).toBe(stored);
      });
    });

    test('TC-COM-TF-082: Saving a reset day succeeds and keeps the modal open', { tag: '@C107991' }, async () => {
      test.fail(true, 'BUG-COM-TF-011: a saved reset day is not stored — reopening shows it blank and Reset Date History stays empty (NM-3633)');
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      await about('Saving a January reset day shows no "Failed to save tier commission reset" error, keeps the modal open with the CPT, and keeps the day (NM-3633). The stored day is put back.');
      await tf.openResetDates();
      const stored = await tf.monthValue(0);
      const next = (await tf.monthOptions(0)).find((o) => o !== stored);
      test.skip(next === undefined, 'January offers no other choice');
      try {
        await tf.setMonth(0, next!);
        const result = await phase('Save', () => tf.saveResetDates());
        // The CPT value itself is TC 084 (BUG-COM-TF-008, "CPT : TODO"); this case checks the save.
        await verify('No error; the modal stays open', async () => {
          expect(result.message).not.toMatch(/fail|error/i);
          expect(result.stillOpen).toBe(true);
        });
        await tf.cancelResetDates();
        await tf.openResetDates();
        await verify(`January shows ${next} after reopening`, async () => {
          expect(await tf.monthValue(0)).toBe(next);
        });
      } finally {
        await tf.setMonth(0, stored).catch(() => {});
        await tf.saveResetDates().catch(() => {});
      }
    });

    test('TC-COM-TF-083: Reset Dates shows the Current Period Total line', { tag: '@C107992' }, async () => {
      // The value still reads "TODO" on e2e — accepted on review 2026-11-12 (not built yet); only the line is checked.
      await about('The Reset Dates modal ends with a "CPT :" line that carries a value (NM-2168).');
      await tf.openResetDates();
      const cpt = await tf.readCpt();
      await verify(`CPT line present ("${cpt}")`, async () => {
        expect(cpt.length).toBeGreaterThan(0);
      });
    });
  });

  test.describe('L. Accessibility and security', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
    });

    test('TC-COM-TF-084: Automated WCAG 2.1 AA scan finds no serious or critical violations', { tag: '@C107993' }, async () => {
      await about('An axe-core scan of Basic Information with results, the Reset Dates modal and History finds no serious or critical violations outside the select triggers and the tab strip.');
      type Violation = { id: string; impact: string | null; nodes: { target: unknown }[] };
      type Axe = { withTags(t: string[]): Axe; exclude(s: string): Axe; analyze(): Promise<{ violations: Violation[] }> };
      const AxeBuilder = createRequire(__filename)('@axe-core/playwright').default as new (o: { page: unknown }) => Axe;
      const scan = async (): Promise<Violation[]> =>
        (await new AxeBuilder({ page: tf.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('button[data-slot="select-trigger"]').exclude('[role="tablist"]')
          // The grid checkboxes carry no accessible name — accepted on review 2026-11-12, like the select triggers.
          .exclude('main tbody [role="checkbox"]').analyze())
          .violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      await tf.open(OFFICE);
      await tf.search();
      const grid = await phase('Scan Basic Information', scan);
      await tf.openResetDates();
      const modal = await phase('Scan Reset Dates', scan);
      await tf.cancelResetDates();
      await tf.openTab(HISTORY);
      const history = await phase('Scan History', scan);
      const summary = [...grid, ...modal, ...history].map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 5).map((n) => n.target) }));
      await attachNote('axe violations', JSON.stringify(summary, null, 2));
      await verify('No serious or critical violations', async () => {
        expect(summary.map((v) => v.id)).toEqual([]);
      });
    });

    test('TC-COM-TF-085: The page stays usable at 1024×768', { tag: '@C107994' }, async () => {
      await about('At 1024×768 Search, Save and the grid stay reachable and the page does not scroll sideways.');
      const original = tf.page.viewportSize();
      try {
        await tf.page.setViewportSize({ width: 1024, height: 768 });
        await tf.open(OFFICE);
        await tf.search();
        const overflows = await tf.pageOverflows();
        await verify('Search, Save and the grid reachable; no sideways scroll', async () => {
          for (const loc of [tf.searchButton(), tf.toolbarButton('save'), tf.grid()]) {
            await loc.scrollIntoViewIfNeeded();
            await expect(loc).toBeInViewport();
          }
          expect(overflows).toBe(false);
        });
      } finally {
        if (original) await tf.page.setViewportSize(original);
      }
    });

    test('TC-COM-TF-086: No untranslated text key is visible', { tag: '@C107995' }, async () => {
      await about('Every label, header and message is real text, never a raw key like "commission.tier.title" or "VALID_MSG_4".');
      await tf.open(OFFICE);
      await tf.search();
      const basic = await tf.findRawI18nKeys();
      await tf.openResetDates();
      const modal = await tf.findRawI18nKeys();
      await verify('No raw keys', async () => {
        expect([...basic, ...modal]).toEqual([]);
      });
    });

  });

  // The Commission Tier/Flat History tab: a read-only audit grid, paged, loaded when the tab is opened. Nothing
  // here saves.
  test.describe('M. History', () => {
    test.describe.configure({ timeout: 240_000 });
    let total: number;

    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(TF_HISTORY_OFFICE);
      total = await tf.openTab(HISTORY);
    });

    /** Every History row on screen. */
    async function readAll(): Promise<GridRow[]> {
      const rows: GridRow[] = [];
      for (let i = 0; i < (await tf.rows().count()); i++) rows.push(await tf.readRow(tf.rows().nth(i)));
      return rows;
    }

    test('TC-COM-TF-087: History opens with its columns, read-only and with no editing actions', { tag: '@C107996' }, async () => {
      await about(`History loads when its tab is opened and lists ${HISTORY_COLUMNS.join(', ')}; nothing in it can be edited (NM-3573, NM-3574).`);
      await verify('History selected, no Search button', async () => {
        expect(await tf.selectedTab()).toBe(HISTORY);
        await expect(tf.searchButton()).toBeHidden();
      });
      await verify('Column headers in order', async () => {
        expect(await tf.getHeaders()).toEqual([...HISTORY_COLUMNS]);
      });
      await verify('No editable cell; no Save, Add Row, Import, Copy or Reset Dates', async () => {
        if (total > 0) expect(await tf.editableColumns(tf.rows().first())).toEqual([]);
        expect(await tf.toolbarState()).toMatchObject({ save: null, addRow: null, import: null, copy: null, resetDates: null });
      });
    });

    test('TC-COM-TF-088: An office with no history shows "No results" on a single page', { tag: '@C107997' }, async () => {
      await about('With no entries the grid reads "0 items found" and "No results", the pager shows 1 / 1 and every paging button is off.');
      let empty = false;
      for (const office of [LOCAL, OFFICE]) {
        await tf.open(office);
        if ((await tf.openTab(HISTORY)) === 0) { empty = true; break; }
      }
      test.skip(!empty, 'Every candidate office has history entries');
      await verify('No results; page 1 of 1; paging off', async () => {
        expect(await tf.isMessageVisible(TEXT.noResults)).toBe(true);
        expect(await tf.getPagePosition()).toEqual({ page: 1, of: 1 });
        expect(await tf.pagingEnabled()).toEqual({ first: false, previous: false, next: false, last: false });
      });
    });

    test('TC-COM-TF-089: Every entry is complete and valid', { tag: '@C107998' }, async () => {
      await about('Each entry belongs to the office, names its Service Type and Currency, says who changed it and when, has a known Action and valid values (NM-3573, NM-3574, NM-4692, NM-4216, TC-TF-31).');
      test.skip(total === 0, 'No history entries');
      const rows = await readAll();
      await verify('Local Office is the opened office', async () => {
        expect.soft(new Set(rows.map((r) => (r['Local Office'] ?? '').split(/\s+/)[0]))).toEqual(new Set([TF_HISTORY_OFFICE]));
      });
      await verify('Service Type, Currency, Modified By and Modified Date filled', async () => {
        expect.soft(rows.filter((r) => !(r['Service Type'] ?? '').replace(/^-$/, '')), 'Service Type').toEqual([]);
        expect.soft(rows.filter((r) => !/^[A-Z]{3}$/.test(r.Currency ?? '')), 'Currency').toEqual([]);
        expect.soft(rows.filter((r) => !(r['Modified By'] ?? '').trim()), 'Modified By').toEqual([]);
        expect.soft(rows.filter((r) => Number.isNaN(Date.parse((r['Modified Date'] ?? '').replace(/(\d)(AM|PM)/i, '$1 $2')))), 'Modified Date').toEqual([]);
      });
      await verify(`Action is one of ${HISTORY_ACTIONS.join(', ')}`, async () => {
        expect.soft(rows.map((r) => r.Action ?? '').filter((a) => !(HISTORY_ACTIONS as readonly string[]).includes(a))).toEqual([]);
      });
      await verify('Lower ≤ Upper, rates 0 – 100, flags Yes / No', async () => {
        for (const r of rows) {
          const lower = toNumber(r['Lower Tier Boundary'] ?? '');
          expect.soft(lower >= 0 && toNumber(r['Upper Tier Boundary'] ?? '') >= lower, `boundaries ${JSON.stringify(r)}`).toBe(true);
          for (const c of ['Comm %', 'SC Comm %', 'ETS Comm %']) {
            const rate = toNumber(r[c] ?? '');
            expect.soft(rate >= 0 && rate <= 100, `${c} ${r[c]}`).toBe(true);
          }
          for (const c of ['Profit Only', 'Is SC Comm Calculated On Net?']) expect.soft(['Yes', 'No', ''], c).toContain(r[c]); // an unticked flag shows blank
        }
      });
    });

    test('TC-COM-TF-090: Rows per page starts on 10 and the paging buttons stop at the ends', { tag: '@C107999' }, async () => {
      await about('Rows per page starts on 10; First and Previous are off on page 1, Next and Last move forward and are off on the last page (NM-3628).');
      const pages = pagesFor(total, 10);
      test.skip(pages < 3, `Needs at least three pages of history (${total} entries)`);
      await verify('Rows per page: 10 first, sizes ascending', async () => {
        const sizes = await tf.getPageSizes();
        expect(sizes.current).toBe('10');
        expect(sizes.options.map(Number)).toEqual([...sizes.options.map(Number)].sort((a, b) => a - b));
      });
      await verify('Page 1: First and Previous off', async () => {
        expect(await tf.getPagePosition()).toEqual({ page: 1, of: pages });
        expect(await tf.pagingEnabled()).toEqual({ first: false, previous: false, next: true, last: true });
      });
      await verify('Next → 2; Last → last page with Next and Last off; First → 1', async () => {
        expect((await tf.goToPage('next')).page).toBe(2);
        expect((await tf.goToPage('last')).page).toBe(pages);
        expect(await tf.pagingEnabled()).toEqual({ first: true, previous: true, next: false, last: false });
        expect((await tf.goToPage('first')).page).toBe(1);
      });
    });

    test('TC-COM-TF-091: Changing rows per page on page 2 keeps the page number true to the rows shown', { tag: '@C108000' }, async () => {
      await about('On page 2, switching to 20 rows per page shows a page number and page count that match the rows on screen (NM-3619, TC-TF-33).');
      test.skip(total <= 20, `Needs more than 20 history entries (${total})`);
      await tf.goToPage('next');
      await tf.setPageSize('20');
      const pos = await tf.getPagePosition();
      await verify('Page count and rows shown agree with the page number', async () => {
        expect(pos.of).toBe(pagesFor(total, 20));
        expect(pos.page).toBeGreaterThanOrEqual(1);
        expect(await tf.rows().count()).toBe(Math.min(20, total - (pos.page - 1) * 20));
      });
    });

    test('TC-COM-TF-092: The page-number box goes to a typed page and refuses pages that do not exist', { tag: '@C108001' }, async () => {
      await about('Typing 2 shows page 2; 0, -1, 9999, letters and a decimal each leave the pager on a real page with rows.');
      const pages = pagesFor(total, 10);
      test.skip(pages < 2, 'Needs two pages of history');
      await verify('2 → page 2', async () => {
        expect((await tf.typePage('2')).page).toBe(2);
      });
      for (const { typed, why } of PAGE_BOX_INPUT) {
        const pos = await tf.typePage(typed);
        await verify(`"${typed}" → page ${pos.page} of ${pages} (${why})`, async () => {
          expect.soft(pos.page >= 1 && pos.page <= pages, 'a real page').toBe(true);
          expect.soft(Number(pos.box), 'the box shows that page').toBe(pos.page);
          expect.soft(await tf.rows().count(), 'rows shown').toBeGreaterThan(0);
        });
      }
    });

    test('TC-COM-TF-093: Going back to Basic Information starts on page 1', { tag: '@C108002' }, async () => {
      await about('After paging History to its last page, Basic Information opens on page 1, and History reopens on page 1 (NM-3660, TC-TF-34).');
      test.skip(pagesFor(total, 10) < 2, 'Needs two pages of history');
      await tf.goToPage('last');
      await tf.openTab('Basic Information');
      if (await tf.isMessageVisible(TEXT.emptyBasic)) await tf.search();
      await verify('Basic Information on page 1, first row in view', async () => {
        if (await tf.pager().isVisible().catch(() => false)) expect((await tf.getPagePosition()).page).toBe(1);
        if ((await tf.getCount()) > 0) await expect(tf.rows().first()).toBeInViewport();
      });
      await tf.openTab(HISTORY);
      await verify('History reopens on page 1', async () => {
        expect((await tf.getPagePosition()).page).toBe(1);
      });
    });

    test('TC-COM-TF-094: Action sorts both ways, and Grid Options lists every column', { tag: '@C108003' }, async () => {
      await about('The header menu sorts Action A→Z and Z→A; Grid Options lists each History column, ticked.');
      test.skip(total < 2, 'Needs two history entries');
      await tf.sortBy('Action', 'ascending');
      const asc = await tf.readColumn('Action');
      await tf.sortBy('Action', 'descending');
      const desc = await tf.readColumn('Action');
      await verify('A→Z, then Z→A', async () => {
        expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));
        expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a)));
      });
      await verify('Grid Options lists every column, ticked', async () => {
        expect(await tf.getGridOptionColumns()).toEqual(HISTORY_COLUMNS.map((label) => ({ label, checked: true })));
      });
    });

    test('TC-COM-TF-095: History export downloads TierFlatCommAudit-<office>.xlsx with every entry', { tag: '@C108004' }, async () => {
      // The export names differ from the grid — accepted on review 2026-11-12.
      await about(`Export downloads ${AUDIT_FILE(TF_HISTORY_OFFICE)} (NM-3677, TC-TF-33) with the audit header row and one line per entry of every page.`);
      const file = await phase('Export', () => tf.exportGrid());
      const [head, ...data] = file.rows;
      await verify(`File name ${AUDIT_FILE(TF_HISTORY_OFFICE)}`, async () => {
        expect(file.name).toBe(AUDIT_FILE(TF_HISTORY_OFFICE));
      });
      await verify('The audit header row; one line per entry', async () => {
        expect(head?.filter(Boolean)).toEqual([...AUDIT_HEADERS]);
        expect(data.filter((r) => r.some(Boolean))).toHaveLength(total);
      });
    });
  });

  // Each change on Basic Information as History records it. These cases write marker bands (Upper AUTO_UPPER)
  // and remove them. They take free service types from the end of the list, so they never share one with the
  // cases above when both run at once.
  test.describe('N. History of changes', () => {
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ authenticatedSession, config }) => {
      test.skip(!WRITES_ALLOWED, 'TF_WRITES=off');
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    /** History entries of a marker band, newest first, at the largest page size. */
    async function entriesOf(serviceType: string): Promise<GridRow[]> {
      await tf.open(OFFICE);
      await tf.openTab(HISTORY);
      const largest = [...(await tf.getPageSizes()).options].sort((a, b) => Number(b) - Number(a))[0];
      if (largest) await tf.setPageSize(largest);
      await tf.sortBy('Modified Date', 'descending').catch(() => {});
      const rows: GridRow[] = [];
      for (let i = 0; i < (await tf.rows().count()); i++) rows.push(await tf.readRow(tf.rows().nth(i)));
      return rows.filter((r) => r['Service Type'] === serviceType && toNumber(r['Upper Tier Boundary'] ?? '') === AUTO_UPPER);
    }

    async function cleanUp(): Promise<void> {
      try {
        await tf.open(OFFICE);
        await tf.search();
        await tf.purgeLeftovers();
      } catch (error) {
        // Never let clean-up hide the test's own failure; the next run's beforeAll purges what is left.
        await attachNote('Clean-up failed', String(error));
      }
    }

    test('TC-COM-TF-096: Adding, changing and deleting a band records Add, Modify and Remove', { tag: '@C108005' }, async () => {
      await about('A saved new band appears as Add with its Service Type and Currency (NM-3573); a change as Modify; a deletion as Remove, still with its Currency (NM-4692).');
      const { row, serviceType } = await tf.addRowOnFreeServiceType({ pick: 'last' });
      try {
        await phase('Add, change and delete the band, saving each time', async () => {
          await tf.setBand(row, 0, AUTO_UPPER);
          await tf.save();
          await tf.search();
          await tf.typeInto((await tf.rowWhere(serviceType, 0, AUTO_UPPER))!, 'Lower Tier Boundary', '10');
          await tf.save();
          await tf.search();
          await tf.deleteRow((await tf.rowWhere(serviceType, 10, AUTO_UPPER))!);
          await tf.save();
        });
        const entries = await entriesOf(serviceType);
        await attachNote('Entries', JSON.stringify(entries, null, 2));
        await verify('Add, Modify and Remove, each with Service Type and Currency', async () => {
          expect(entries.map((e) => e.Action)).toEqual(expect.arrayContaining(['Add', 'Modify', 'Remove']));
          for (const e of entries) {
            expect.soft(e['Service Type'], e.Action).toBe(serviceType);
            expect.soft(e.Currency, e.Action).toMatch(/^[A-Z]{3}$/);
          }
        });
      } finally {
        await cleanUp();
      }
    });

    test('TC-COM-TF-097: Copying over a band records Remove for the old one, with its Currency', { tag: '@C108006' }, async () => {
      test.fail(true, 'BUG-COM-TF-012: after a copy, History shows the overwritten band as Remove with a blank Currency (NM-4692)');
      // No Copy entry is written for the copied band — accepted (BUG-COM-TF-013 dropped on review 2026-11-13).
      await about('Copying a band onto a service type that has one records the replaced band as Remove, with its Currency (NM-4692, TC-TF-32).');
      const { row, serviceType: source, free } = await tf.addRowOnFreeServiceType({ pick: 'last' });
      test.skip(free.length < 2, 'Needs two service types with no tiers');
      const target = [...free].reverse().find((s) => s !== source)!;
      try {
        await phase(`Save a band on ${source} and one on ${target}`, async () => {
          await tf.setBand(row, 0, AUTO_UPPER);
          const second = await tf.addRow();
          await tf.setServiceType(second, target);
          await tf.setBand((await tf.rowsOf(target))[0]!, 5, AUTO_UPPER);
          await tf.save();
          await tf.search();
        });
        await phase(`Copy ${source} onto ${target}`, async () => {
          const panel = await tf.openCopy('within');
          await tf.chooseCopySource(panel, source);
          await tf.tickTargetNamed(panel, target);
          await tf.applyCopy(panel);
        });
        const entries = await entriesOf(target);
        await attachNote('Entries', JSON.stringify(entries, null, 2));
        await verify('The old band as Remove with its Currency', async () => {
          const removed = entries.find((e) => e.Action === 'Remove' && toNumber(e['Lower Tier Boundary'] ?? '') === 5);
          expect(removed?.Currency, 'Remove entry with its Currency').toMatch(/^[A-Z]{3}$/);
        });
      } finally {
        await cleanUp();
      }
    });
  });

  // Offices outside the US: Canada failed with "Unexpected error occurred" (NM-3599).
  test.describe('O. Other countries', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
    });

    for (const office of TF_FOREIGN_OFFICES) {
      test.describe(officeLabel(office), () => {
        test('TC-COM-TF-098: Basic Information and History load without an error', { tag: '@C108007' }, async () => {
          await about('The office searches its tiers and opens History cleanly — rows or the empty state, never "Unexpected error occurred" (NM-3599).');
          await tf.open(office.code);
          const tiers = await phase('Search', () => tf.search());
          const entries = await phase('Open History', () => tf.openTab(HISTORY));
          await verify('Counts shown; no unexpected error', async () => {
            expect(tiers).toBeGreaterThanOrEqual(0);
            expect(entries).toBeGreaterThanOrEqual(0);
            await expect(tf.page.getByText(TEXT.unexpectedError)).toHaveCount(0);
          });
        });
      });
    }
  });

  // Sorting, column visibility and the Product Code link on Basic Information. Nothing here saves.
  test.describe('P. Grid view and links', () => {
    test.beforeEach(async ({ authenticatedSession, config }) => {
      tf = new CommissionTierFlatPage(authenticatedSession.page, config);
      await tf.open(OFFICE);
      await tf.search();
    });

    test('TC-COM-TF-099: Basic Information sorts by Service Type both ways and by Lower Tier Boundary as a number', { tag: '@C108008' }, async () => {
      await about('The header menu sorts Service Type A→Z and Z→A, and Lower Tier Boundary from the largest number down.');
      test.skip((await tf.getCount()) < 2, 'Needs two tiers');
      await tf.sortBy('Service Type', 'ascending');
      const asc = await tf.readColumn('Service Type');
      await tf.sortBy('Service Type', 'descending');
      const desc = await tf.readColumn('Service Type');
      await verify('Service Type A→Z, then Z→A', async () => {
        expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));
        expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a)));
      });
      await tf.sortBy('Lower Tier Boundary', 'descending');
      const lower = (await tf.readColumn('Lower Tier Boundary')).map(toNumber);
      await verify('Lower Tier Boundary largest first, by value', async () => {
        expect(lower).toEqual([...lower].sort((a, b) => b - a));
      });
    });

    test('TC-COM-TF-100: A hidden column stays hidden until Reset to Default View brings every column back', { tag: '@C108009' }, async () => {
      await about('Hide column (header menu) and unticking in Grid Options each remove a column; the choice survives a reload; Reset to Default View restores every column.');
      try {
        await tf.resetGridView();
        await tf.hideColumn('Profit Only');
        await verify('Profit Only gone from the grid and unticked in Grid Options', async () => {
          expect(await tf.getHeaders()).not.toContain('Profit Only');
          expect(await tf.getGridOptionColumns()).toContainEqual({ label: 'Profit Only', checked: false });
        });
        await tf.toggleGridOptionColumn('ETS Comm %');
        // A browser reload, not tf.open(): open() clears the stored view on purpose so every case starts clean.
        await phase('Reload the page and search', async () => {
          await tf.page.reload();
          await tf.waitForReady();
          await tf.search();
        });
        await verify('Both columns still hidden after the reload', async () => {
          const headers = await tf.getHeaders();
          expect(headers).not.toContain('Profit Only');
          expect(headers).not.toContain('ETS Comm %');
        });
        await tf.resetGridView();
        await verify('Every column back, in order', async () => {
          expect(await tf.getHeaders()).toEqual([...BASIC_COLUMNS_REQUIRED]);
        });
      } finally {
        await tf.resetGridView().catch(() => {});
      }
    });

    test('TC-COM-TF-101: The Product Code Commissions link opens the office\'s Product Code Commission page', { tag: '@C108010' }, async () => {
      await about(`The "${TEXT.productCodeLink}" link in the banner opens ${PRODUCT_CODE_PATH(OFFICE)} in the same tab (NM-3384).`);
      await tf.productCodeBanner().getByRole('link', { name: TEXT.productCodeLink }).click();
      await verify(`${PRODUCT_CODE_PATH(OFFICE)} with the "${TEXT.productCodeHeading}" heading`, async () => {
        await expect(tf.page).toHaveURL(new RegExp(`${PRODUCT_CODE_PATH(OFFICE)}$`));
        await expect(tf.page.locator('h1')).toHaveText(TEXT.productCodeHeading, { timeout: 30_000 });
      });
    });
  });
});
