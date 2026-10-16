import { test, expect } from '../../src/fixtures/pages.fixture';
import { about, attachNote, phase, verify } from '../../src/fixtures/report-steps';
import {
  MultidayPricingRulesPage,
  MultidayRule,
  GridRow,
  rscDate,
} from '../../src/pages/multiday-pricing/multiday-pricing-rules.page';
import {
  MDP_EDIT_OFFICE,
  MDP_READONLY_OFFICE,
  MDP_PAGE_TITLE,
  MDP_BROWSER_TITLE,
  MDP_SERVICE_TYPE_HEADER,
  MDP_DAY_HEADERS,
  MDP_DAY_COLUMN_IDS,
  MDP_NEW_ROW_DEFAULTS,
  MDP_MESSAGES,
  MDP_VALIDATION,
  MDP_RESTRICTED_FLAGS,
  MDP_ROUND_TRIP_SERVICE_TYPE,
  MDP_REJECTED_INPUTS,
  MDP_OVERSIZED_DIGITS,
  MDP_LOAD_BUDGET_MS,
  MDP_VIEWPORTS,
} from '../../src/data/multiday-pricing/multiday-pricing-rules';
import { STATE_PATH } from '../../src/utils/auth-storage';

// Setup → Multiday Pricing Rules (NM-4129 / NM-2413). The rule set is GLOBAL: one table shared by
// every office, so the read-only office (2359) and the corporate office (1101) show the same rows.
//
// Write policy:
//   * Every case outside the "persistence" block is non-mutating. Save-payload cases hold the save
//     request at the network (interceptSave) — the payload is asserted, nothing reaches the DB.
//   * The "persistence" block (@mutating) really writes and restores in `finally`. Exclude it with
//     --grep-invert @mutating when the shared environment must stay untouched.
// TC-016 asserts the documented behaviour against a known defect (BUG-MDP-RUL-004) and fails by
// design until it is fixed; see specs/multiday-pricing-rules-test-plan.md.

// TestRail case tags for tests whose titles are built in a loop. The auto-tagger only rewrites
// literal titles, so these come from config/testrail/case-map.json by hand.
const LOOP_CASE_TAGS: Record<string, string> = {
  'TC-MDP-RUL-059': '@C107340', 'TC-MDP-RUL-060': '@C107341', 'TC-MDP-RUL-061': '@C107342',
  'TC-MDP-RUL-086': '@C107367', 'TC-MDP-RUL-087': '@C107368',
};

// ---------------------------------------------------------------- spec-local helpers

/** Groups the server's rules into service type → 14 billable days (index 0 = 1 Day). */
function groupRules(rules: MultidayRule[]): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const r of rules) {
    const days = out.get(r.serviceTypeName) ?? Array<number | null>(14).fill(null);
    days[r.jobDays - 1] = r.billableDays;
    out.set(r.serviceTypeName, days);
  }
  return out;
}

function ruleFor(rules: MultidayRule[], serviceType: string, jobDays: number): MultidayRule {
  const r = rules.find((x) => x.serviceTypeName === serviceType && x.jobDays === jobDays);
  if (!r) throw new Error(`No rule for ${serviceType} / ${jobDays} days`);
  return r;
}

/** 1-based day d of a row's values, as a number (throws on a blank cell). */
function v(row: GridRow, day: number): number {
  const value = row.values[day - 1];
  if (value === null || value === undefined) throw new Error(`Row ${row.name} has no value for day ${day}`);
  return value;
}

/** A value for `day` that passes every rule and differs from the current one, or null. */
function validAlternative(row: GridRow, day: number): number | null {
  const lo = day > 1 ? v(row, day - 1) : 0;
  const hi = Math.min(day, day < 14 ? v(row, day + 1) : day);
  for (let x = hi; x >= lo; x--) if (x !== v(row, day)) return x;
  return null;
}

/** First (row, day) satisfying `pick`, scanning configured rows in grid order. */
function findCell(rows: GridRow[], pick: (row: GridRow, day: number) => boolean): { row: GridRow; day: number } {
  for (const row of rows) for (let day = 1; day <= 14; day++) if (pick(row, day)) return { row, day };
  throw new Error('No grid cell satisfies the scenario precondition — the seeded rules changed shape');
}

test.describe('Multiday Pricing Rules @multiday-pricing', () => {
  let mdp: MultidayPricingRulesPage;

  test.beforeEach(async ({ authenticatedSession, config }) => {
    // Two grid loads at up to 90 s each plus the actions; cases that reload more raise it again.
    test.setTimeout(240_000);
    mdp = new MultidayPricingRulesPage(authenticatedSession.page, config);
  });

  test.afterEach(async () => {
    // Interceptions and dirty edits must never leak into the next case on the shared page.
    await mdp.clearInterceptions();
    (mdp.page as unknown as Record<string, unknown>).__skipBeforeunloadAutoAccept = false;
    await mdp.leaveDiscardingChanges();
  });

  // ================================================================ A. Navigation & page load

  test.describe('A. Navigation and page load', () => {
    test('TC-MDP-RUL-001: Setup menu entry opens the Multiday Pricing Rules page', { tag: '@C107282' }, async () => {
      await about('A user opens Setup in the sidebar and picks Multiday Pricing Rules; the rules page opens.');
      await mdp.openFromSetupMenu(MDP_READONLY_OFFICE);
      await verify('The page is the Multiday Pricing Rules route with its heading', async () => {
        expect(mdp.page.url()).toMatch(new RegExp(`/locations/${MDP_READONLY_OFFICE}/settings/multiday-pricing-rules$`));
        expect(await mdp.getHeading()).toBe(MDP_PAGE_TITLE);
      });
    });

    test('TC-MDP-RUL-002: Direct URL loads the page with browser title, heading and grid', { tag: '@C107283' }, async () => {
      await about('Opening the page link directly shows the "Multiday Pricing" title and a filled grid.');
      await mdp.open(MDP_READONLY_OFFICE);
      const rows = await mdp.readConfiguredRows();
      await verify('Browser title, heading and at least one rule row are present', async () => {
        await expect(mdp.page).toHaveTitle(MDP_BROWSER_TITLE);
        expect(await mdp.getHeading()).toBe(MDP_PAGE_TITLE);
        expect(rows.length).toBeGreaterThan(0);
      });
    });

    test('TC-MDP-RUL-003: More information icon shows a tooltip', { tag: '@C107284' }, async () => {
      await about('Hovering the (i) icon beside the title explains the page in a tooltip.');
      await mdp.open(MDP_READONLY_OFFICE);
      const tip = await mdp.readInfoTooltip();
      await attachNote('Tooltip text', tip);
      await verify('The tooltip carries text', async () => {
        expect(tip.length).toBeGreaterThan(0);
      });
    });

    test('TC-MDP-RUL-004: Loading skeleton shows while rules are pending and clears when they arrive', { tag: '@C107285' }, async () => {
      await about('While the rules request is slow the grid shows a loading skeleton, then real rows replace it.');
      await mdp.mockRules({ kind: 'delay', ms: 6_000 });
      await phase('Open the page with the rules response held for 6 seconds', () => mdp.openPath(`locations/${MDP_READONLY_OFFICE}/settings/multiday-pricing-rules`));
      await verify('The skeleton is visible while the request is pending', async () => {
        await expect.poll(() => mdp.isSkeletonVisible(), { timeout: 30_000 }).toBe(true);
      });
      await mdp.waitForGrid();
      await verify('The skeleton is gone and rows are shown once the response lands', async () => {
        expect(await mdp.isSkeletonVisible()).toBe(false);
        expect((await mdp.readConfiguredRows()).length).toBeGreaterThan(0);
      });
    });

    test('TC-MDP-RUL-005: Grid is usable within the load budget', { tag: '@C107286' }, async () => {
      await about(`The grid shows rules within ${MDP_LOAD_BUDGET_MS / 1000} seconds of opening the page.`);
      const started = Date.now();
      await mdp.open(MDP_READONLY_OFFICE, { resetGridPreferences: false });
      const elapsed = Date.now() - started;
      await attachNote('Load time (ms)', String(elapsed));
      await verify('Load time is inside the budget', async () => {
        expect(elapsed).toBeLessThan(MDP_LOAD_BUDGET_MS);
      });
    });
  });

  // ================================================================ B. Grid structure & data

  test.describe('B. Grid structure and data mapping', () => {
    test('TC-MDP-RUL-006: Headers read Service Type Name then 1 Day to 14 Days in order', { tag: '@C107287' }, async () => {
      await about('The grid has a Service Type Name column followed by fourteen day columns, 1 Day through 14 Days.');
      await mdp.open(MDP_READONLY_OFFICE);
      const headers = await mdp.getHeaderLabels();
      await verify('Header labels match exactly, singular "1 Day" first', async () => {
        expect(headers).toEqual([MDP_SERVICE_TYPE_HEADER, ...MDP_DAY_HEADERS]);
      });
    });

    test('TC-MDP-RUL-007: Every service type row carries fourteen day values', { tag: '@C107288' }, async () => {
      await about('Each configured service type shows a value under every one of the fourteen day columns.');
      await mdp.open(MDP_READONLY_OFFICE);
      const rows = await mdp.readConfiguredRows();
      await verify('No row has a blank day cell', async () => {
        for (const row of rows) {
          expect(row.values, `${row.name} values`).toHaveLength(14);
          expect(row.values.every((x) => x !== null && Number.isInteger(x)), `${row.name}: ${row.raw.join(',')}`).toBe(true);
        }
      });
    });

    test('TC-MDP-RUL-008: Grid values match the rules returned by the server, cell by cell', { tag: '@C107289' }, async () => {
      await about('Every number in the grid is the billable-days value the server returned for that service type and job-day column.');
      const rules = await mdp.openCapturingRules(MDP_READONLY_OFFICE);
      const expected = groupRules(rules);
      const rows = await mdp.readConfiguredRows();
      await verify('Same service types, and each JobDays value sits under its own column', async () => {
        expect(rows.map((r) => r.name).sort()).toEqual([...expected.keys()].sort());
        for (const row of rows) expect(row.values, row.name).toEqual(expected.get(row.name));
      });
    });

    test('TC-MDP-RUL-009: Each service type appears in exactly one row', { tag: '@C107290' }, async () => {
      await about('Rules are grouped by service type, so no service type is listed twice.');
      await mdp.open(MDP_READONLY_OFFICE);
      const names = await mdp.getServiceTypeNames();
      await verify('No duplicate service type names', async () => {
        expect(new Set(names).size).toBe(names.length);
      });
    });

    test('TC-MDP-RUL-010: Server orders rules by service type then job days, and the grid keeps that order', { tag: '@C107291' }, async () => {
      await about('The rules arrive grouped by service type with job days 1 to 14 in order, and the grid lists service types in that same order.');
      const rules = await mdp.openCapturingRules(MDP_READONLY_OFFICE);
      const serverOrder = [...new Set(rules.map((r) => r.serviceTypeName))];
      const gridOrder = await mdp.getServiceTypeNames();
      await verify('Within each service type the job days are 1..14 ascending', async () => {
        for (const name of serverOrder) {
          expect(rules.filter((r) => r.serviceTypeName === name).map((r) => r.jobDays), name).toEqual(MDP_NEW_ROW_DEFAULTS);
        }
      });
      await verify('Each service type is contiguous in the response and the grid order matches it', async () => {
        const blocks = rules.map((r) => r.serviceTypeName).filter((n, i, a) => i === 0 || a[i - 1] !== n);
        expect(blocks).toEqual(serverOrder);
        expect(gridOrder).toEqual(serverOrder);
      });
    });

    test('TC-MDP-RUL-011: Loaded rules respect 0 ≤ billable ≤ job days and never decrease left to right', { tag: '@C107292' }, async () => {
      await about('The stored rules themselves obey the same rules the editor enforces — a data-integrity check on the seeded set.');
      await mdp.open(MDP_READONLY_OFFICE);
      const rows = await mdp.readConfiguredRows();
      await verify('Bounds and monotonicity hold for every row', async () => {
        for (const row of rows) {
          for (let d = 1; d <= 14; d++) {
            expect(v(row, d), `${row.name} day ${d} ≥ 0`).toBeGreaterThanOrEqual(0);
            expect(v(row, d), `${row.name} day ${d} ≤ ${d}`).toBeLessThanOrEqual(d);
            if (d > 1) expect(v(row, d), `${row.name} day ${d} ≥ day ${d - 1}`).toBeGreaterThanOrEqual(v(row, d - 1));
          }
        }
      });
    });

    test('TC-MDP-RUL-012: Rules are global — the read-only and corporate offices show the same grid', { tag: '@C107293' }, async () => {
      await about('The rule set is not filtered by office: the corporate office and a regular office list identical rules.');
      await mdp.open(MDP_READONLY_OFFICE);
      const readOnly = (await mdp.readConfiguredRows()).map((r) => [r.name, r.values]);
      await mdp.open(MDP_EDIT_OFFICE);
      const corporate = (await mdp.readConfiguredRows()).map((r) => [r.name, r.values]);
      await verify('Both offices list the same service types with the same values', async () => {
        expect(corporate).toEqual(readOnly);
      });
    });

    test('TC-MDP-RUL-013: Items-found count equals the number of service types (read-only office)', { tag: '@C107294' }, async () => {
      await about('The "items found" counter above the grid matches the number of service type rows.');
      await mdp.open(MDP_READONLY_OFFICE);
      const count = await mdp.getItemsFoundCount();
      const rows = await mdp.readConfiguredRows();
      await verify('Counter equals the row count', async () => {
        expect(count).toBe(rows.length);
      });
    });

    test('TC-MDP-RUL-014: Empty rule set shows the empty state and zero items', { tag: '@C107295' }, async () => {
      await about('When the server has no rules at all, the page says "No multiday pricing rules found" instead of an error.');
      await mdp.mockRules({ kind: 'empty' });
      await mdp.open(MDP_READONLY_OFFICE, { resetGridPreferences: false });
      await verify('Empty-state text, zero items, no error toast', async () => {
        expect(await mdp.isEmptyStateVisible()).toBe(true);
        expect(await mdp.getItemsFoundCount()).toBe(0);
        await expect(mdp.page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
      });
    });

    test('TC-MDP-RUL-015: Rules request failure leaves the page usable', { tag: '@C107296' }, async () => {
      await about('If the rules request dies on the network, the page still renders its title, toolbar and grid frame — it does not crash.');
      await mdp.mockRules({ kind: 'abort' });
      await mdp.open(MDP_READONLY_OFFICE, { resetGridPreferences: false });
      await verify('Heading, Grid Options and the grid frame are still rendered', async () => {
        expect(await mdp.isHeadingVisible()).toBe(true);
        await expect(mdp.page.locator('main').getByRole('button', { name: 'Grid Options' })).toBeVisible();
        await expect(mdp.page.locator('main table')).toBeVisible();
      });
    });

    test('TC-MDP-RUL-016: Rules request failure is reported, not shown as "no rules" [BUG-MDP-RUL-004]', { tag: '@C107297' }, async () => {
      await about('A failed rules load must tell the user something went wrong; showing "No multiday pricing rules found" would invite them to re-create rules that still exist.');
      await mdp.mockRules({ kind: 'failure', message: 'Simulated rules failure' });
      await mdp.open(MDP_READONLY_OFFICE, { resetGridPreferences: false });
      await verify('An error is surfaced and the empty-state copy is not used', async () => {
        // Live: the app swallows the error and renders the empty state — fails until fixed.
        expect(await mdp.isEmptyStateVisible()).toBe(false);
        await expect(mdp.page.locator('[data-sonner-toast][data-type="error"], main [role="alert"]').first()).toBeVisible({ timeout: 10_000 });
      });
    });
  });

  // ================================================================ C. Sorting, resizing, column preferences

  test.describe('C. Sorting, resizing and column preferences', () => {
    test('TC-MDP-RUL-017: Sorting Service Type Name descending then ascending reorders the rows', { tag: '@C107298' }, async () => {
      await about('The Service Type Name header menu sorts the rows Z→A and back A→Z.');
      await mdp.open(MDP_READONLY_OFFICE);
      const original = await mdp.getServiceTypeNames();
      await mdp.sortBy(MDP_SERVICE_TYPE_HEADER, 'descending');
      const desc = await mdp.getServiceTypeNames();
      await mdp.sortBy(MDP_SERVICE_TYPE_HEADER, 'ascending');
      const asc = await mdp.getServiceTypeNames();
      await verify('Descending is the reverse of ascending, and both match a locale sort', async () => {
        const sorted = [...original].sort((a, b) => a.localeCompare(b));
        expect(asc).toEqual(sorted);
        expect(desc).toEqual([...sorted].reverse());
      });
    });

    test('TC-MDP-RUL-018: Sorting a day column orders rows numerically', { tag: '@C107299' }, async () => {
      await about('Sorting by "14 Days" orders the rows by that column\'s number, lowest first, then highest first.');
      await mdp.open(MDP_READONLY_OFFICE);
      await mdp.sortBy('14 Days', 'ascending');
      const asc = (await mdp.readConfiguredRows()).map((r) => v(r, 14));
      await mdp.sortBy('14 Days', 'descending');
      const desc = (await mdp.readConfiguredRows()).map((r) => v(r, 14));
      await verify('Ascending never decreases, descending never increases', async () => {
        expect(asc).toEqual([...asc].sort((a, b) => a - b));
        expect(desc).toEqual([...desc].sort((a, b) => b - a));
      });
    });

    test('TC-MDP-RUL-019: Sorting moves whole rows — no value changes service type', { tag: '@C107300' }, async () => {
      await about('After sorting, each service type still shows exactly the values it had before.');
      await mdp.open(MDP_READONLY_OFFICE);
      const before = new Map((await mdp.readConfiguredRows()).map((r) => [r.name, r.values]));
      await mdp.sortBy('7 Days', 'descending');
      const after = await mdp.readConfiguredRows();
      await verify('Every row keeps its own fourteen values', async () => {
        expect(after).toHaveLength(before.size);
        for (const row of after) expect(row.values, row.name).toEqual(before.get(row.name));
      });
    });

    test('TC-MDP-RUL-020: Dragging a resize handle widens the column and keeps it readable', { tag: '@C107301' }, async () => {
      await about('A column can be widened by dragging its edge, and its header and values stay readable.');
      await mdp.open(MDP_READONLY_OFFICE);
      const { before, after } = await mdp.resizeColumn('day1', 120);
      await attachNote('1 Day width', `${before} → ${after}`);
      await verify('The column is wider and its header still reads "1 Day"', async () => {
        expect(after).toBeGreaterThan(before + 40);
        expect((await mdp.getHeaderLabels())).toContain('1 Day');
        expect((await mdp.readConfiguredRows())[0]?.values[0]).not.toBeNull();
      });
    });

    test('TC-MDP-RUL-021: Hiding a column removes it and the choice survives a reload', { tag: '@C107302' }, async () => {
      await about('Hide column on "3 Days" removes that column; the grid remembers it after the page is reloaded.');
      await mdp.open(MDP_READONLY_OFFICE);
      try {
        await mdp.chooseHeaderMenuItem('3 Days', 'Hide column');
        await verify('The column is gone and the preference is stored', async () => {
          expect(await mdp.getHeaderLabels()).not.toContain('3 Days');
          expect((await mdp.readGridPreferences())?.columnVisibility).toEqual({ day3: false });
        });
        await mdp.reload();
        const rows = await mdp.readConfiguredRows();
        await verify('After reload the column is still hidden and the other days still map correctly', async () => {
          expect(await mdp.getHeaderLabels()).not.toContain('3 Days');
          expect(rows[0]?.values[2]).toBeNull();
          expect(rows[0]?.values[3]).not.toBeNull();
        });
      } finally {
        await mdp.clearGridPreferences();
      }
    });

    test('TC-MDP-RUL-022: Grid Options lists every column and Reset to Default View restores hidden ones', { tag: '@C107303' }, async () => {
      await about('Grid Options offers a checkbox per column and a reset; reset brings a hidden column back.');
      await mdp.open(MDP_READONLY_OFFICE);
      try {
        await mdp.chooseHeaderMenuItem('5 Days', 'Hide column');
        const options = await mdp.readGridOptions();
        await verify('All 15 columns are listed, 5 Days unchecked, Reset offered', async () => {
          expect(options.actions).toContain('Reset to Default View');
          expect(options.columns.map((c) => c.label)).toEqual([MDP_SERVICE_TYPE_HEADER, ...MDP_DAY_HEADERS]);
          expect(options.columns.find((c) => c.label === '5 Days')?.checked).toBe(false);
        });
        await mdp.resetToDefaultView();
        await verify('Reset shows all 15 columns again', async () => {
          await expect.poll(() => mdp.getHeaderLabels()).toEqual([MDP_SERVICE_TYPE_HEADER, ...MDP_DAY_HEADERS]);
        });
      } finally {
        await mdp.clearGridPreferences();
      }
    });

    test('TC-MDP-RUL-023: A saved custom column order is honoured and values still map by job day', { tag: '@C107304' }, async () => {
      await about('A user who dragged the day columns into another order (as in the NM-4129 screenshot) sees that order after reload, and every value still sits under its own day.');
      const rules = await mdp.openCapturingRules(MDP_READONLY_OFFICE);
      const custom = ['delete', 'serviceTypeName', 'day6', 'day7', 'day5', 'day1', 'day4', 'day8', 'day9', 'day10', 'day11', 'day12', 'day13', 'day14', 'day2', 'day3'];
      try {
        await mdp.writeGridPreferences({ columnVisibility: {}, columnOrder: custom, columnSizing: {}, sorting: [] });
        await mdp.reload();
        const headers = await mdp.getHeaderLabels();
        const rows = await mdp.readConfiguredRows();
        const expected = groupRules(rules);
        await verify('Headers follow the stored order', async () => {
          expect(headers).toEqual([MDP_SERVICE_TYPE_HEADER, ...custom.slice(2).map((id) => MDP_DAY_HEADERS[Number(id.slice(3)) - 1])]);
        });
        await verify('Values still map to the right job day despite the reorder', async () => {
          for (const row of rows) expect(row.values, row.name).toEqual(expected.get(row.name));
        });
      } finally {
        await mdp.clearGridPreferences();
      }
    });
  });

  // ================================================================ D. Permissions

  test.describe('D. Permissions', () => {
    test('TC-MDP-RUL-024: Read-only office shows no Save, Delete, add-row or editable cells', { tag: '@C107305' }, async () => {
      await about('Outside the corporate office the grid is view-only: no Save, no Delete, no add-row, no inputs.');
      await mdp.open(MDP_READONLY_OFFICE);
      const editors = await mdp.countBodyEditors();
      await verify('Every edit affordance is absent', async () => {
        expect(await mdp.hasSaveButton()).toBe(false);
        expect(editors).toEqual({ inputs: 0, comboboxes: 0, deletes: 0 });
      });
    });

    test('TC-MDP-RUL-025: Read-only cells cannot be changed by clicking and typing', { tag: '@C107306' }, async () => {
      await about('Clicking a value on the read-only grid and typing over it changes nothing.');
      await mdp.open(MDP_READONLY_OFFICE);
      const row = (await mdp.readConfiguredRows())[0]!;
      const cell = await mdp.dayCell(row.name, 5);
      await phase('Double-click a day cell and type digits and Delete', async () => {
        await cell.dblclick();
        await mdp.page.keyboard.type('9');
        await mdp.page.keyboard.press('Delete');
      });
      await verify('The value and the row are unchanged', async () => {
        expect(await mdp.getDayValue(row.name, 5)).toBe(String(v(row, 5)));
        expect(await mdp.hasRow(row.name)).toBe(true);
      });
    });

    test('TC-MDP-RUL-026: Corporate office shows Save (disabled), Delete per row and editable cells', { tag: '@C107307' }, async () => {
      await about('In the corporate office an authorised user gets Save, a Delete button on every configured row and an input in every day cell; Save starts disabled.');
      await mdp.open(MDP_EDIT_OFFICE);
      const rows = await mdp.readConfiguredRows();
      const editors = await mdp.countBodyEditors();
      await verify('Save is present and disabled', async () => {
        expect(await mdp.hasSaveButton()).toBe(true);
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
      await verify('Each configured row has Delete and 14 editable inputs', async () => {
        expect(rows.every((r) => r.hasDelete)).toBe(true);
        expect(editors.deletes).toBe(rows.length);
        expect(editors.inputs).toBe(rows.length * 14);
      });
    });

    test('TC-MDP-RUL-027: Corporate office offers a trailing add-row whose cells wait for a service type', { tag: '@C107308' }, async () => {
      await about('Below the rules is an empty row with a "Select Service Type" dropdown; its day cells are locked until a service type is chosen.');
      await mdp.open(MDP_EDIT_OFFICE);
      const grid = await mdp.readGrid();
      const last = grid[grid.length - 1]!;
      const firstInput = mdp.addRowLocator().locator('input').first();
      await verify('Last row is the add-row with an empty dropdown and locked cells', async () => {
        expect(last.pendingName).toBe('');
        expect(last.values.every((x) => x === null)).toBe(true);
        expect(await firstInput.getAttribute('readonly')).not.toBeNull();
        expect(await firstInput.getAttribute('title')).toBe(MDP_MESSAGES.selectServiceTypeFirst);
        expect(last.hasDelete).toBe(false);
      });
    });

    test('TC-MDP-RUL-028: Items-found count on the corporate office includes the add-row', { tag: '@C107309' }, async () => {
      await about('For an editor, the "items found" counter counts every configured service type plus the empty add-row at the bottom.');
      await mdp.open(MDP_EDIT_OFFICE);
      const count = await mdp.getItemsFoundCount();
      const rows = await mdp.readConfiguredRows();
      await verify('Counter equals configured rows plus the add-row', async () => {
        expect(count).toBe(rows.length + 1);
      });
    });
  });

  // ================================================================ E. Add a service type

  test.describe('E. Adding a service type', () => {
    test('TC-MDP-RUL-029: Dropdown excludes Labor, Freight, Consumable, Service Charge and Damage Waiver types', { tag: '@C107310' }, async () => {
      await about('Service types flagged Labor, Freight, Consumable, Cable & Consumable, Service Charge or Damage Waiver can never be offered for multiday pricing.');
      const catalogue = await mdp.openCapturingServiceTypes(MDP_EDIT_OFFICE);
      const restricted = catalogue.filter((t) => MDP_RESTRICTED_FLAGS.some((f) => t[f] === true)).map((t) => t.name);
      const options = await mdp.readServiceTypeOptions();
      await attachNote('Restricted service types in the catalogue', restricted.join('\n'));
      await verify('The catalogue has restricted types and none of them is offered', async () => {
        expect(restricted.length).toBeGreaterThan(0);
        expect(options.filter((o) => restricted.includes(o))).toEqual([]);
      });
    });

    test('TC-MDP-RUL-030: Dropdown excludes service types already in the grid', { tag: '@C107311' }, async () => {
      await about('A service type that already has rules is not offered again, so it cannot be duplicated.');
      await mdp.open(MDP_EDIT_OFFICE);
      const configured = await mdp.getServiceTypeNames();
      const options = await mdp.readServiceTypeOptions();
      await verify('No option is an already configured service type', async () => {
        expect(options.filter((o) => configured.includes(o))).toEqual([]);
      });
    });

    test('TC-MDP-RUL-031: Dropdown offers exactly the eligible, unconfigured service types in alphabetical order', { tag: '@C107312' }, async () => {
      await about('The dropdown is the catalogue minus restricted types minus configured types, sorted A→Z.');
      const catalogue = await mdp.openCapturingServiceTypes(MDP_EDIT_OFFICE);
      const configured = new Set(await mdp.getServiceTypeNames());
      const expected = catalogue
        .filter((t) => !MDP_RESTRICTED_FLAGS.some((f) => t[f] === true) && !configured.has(t.name))
        .map((t) => t.name)
        .sort((a, b) => a.localeCompare(b, 'en-US', { sensitivity: 'base' }));
      const options = await mdp.readServiceTypeOptions();
      await verify('Options equal the computed eligible list, in order', async () => {
        expect(options).toEqual(expected);
      });
    });

    test('TC-MDP-RUL-032: Picking a service type alone leaves the cells blank and Save disabled', { tag: '@C107313' }, async () => {
      await about('Choosing a service type in the add-row is not enough to save: the day cells stay empty until the user enters the row.');
      await mdp.open(MDP_EDIT_OFFICE);
      const type = (await mdp.readServiceTypeOptions())[0]!;
      await mdp.selectNewServiceType(type);
      await mdp.commitActiveCell();
      const values = await mdp.getRowValues(type);
      await verify('Cells are blank and Save stays disabled', async () => {
        expect(values.every((x) => x === null)).toBe(true);
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-033: Entering the new row fills defaults 1–14, adds a fresh add-row and enables Save', { tag: '@C107314' }, async () => {
      await about('Once the user steps into the new row its fourteen cells default to 1, 2, 3 … 14, a new empty add-row appears, and Save becomes available.');
      await mdp.open(MDP_EDIT_OFFICE);
      const before = await mdp.getItemsFoundCount();
      const type = (await mdp.readServiceTypeOptions())[0]!;
      await mdp.addServiceType(type);
      const grid = await mdp.readGrid();
      await verify('Defaults equal job days, a new add-row is last, Save enabled', async () => {
        expect(await mdp.getRowValues(type)).toEqual(MDP_NEW_ROW_DEFAULTS);
        expect(grid[grid.length - 1]?.pendingName).toBe('');
        expect(await mdp.getItemsFoundCount()).toBe(before + 1);
        expect(await mdp.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-MDP-RUL-034: A committed new row locks its service type and offers Delete', { tag: '@C107315' }, async () => {
      await about('After the new row is committed its service type can no longer be changed, and it can be removed with Delete.');
      await mdp.open(MDP_EDIT_OFFICE);
      const type = (await mdp.readServiceTypeOptions())[0]!;
      await mdp.addServiceType(type);
      await verify('No dropdown on the row; Delete is present', async () => {
        expect(await mdp.rowHasServiceTypeDropdown(type)).toBe(false);
        await expect(mdp.rowLocator(type).getByRole('button', { name: 'Delete' })).toBeVisible();
      });
    });

    test('TC-MDP-RUL-035: The next add-row no longer offers the type just added (duplicate prevention before Save)', { tag: '@C107316' }, async () => {
      await about('Even before saving, a service type that has just been added cannot be picked a second time.');
      await mdp.open(MDP_EDIT_OFFICE);
      const optionsBefore = await mdp.readServiceTypeOptions();
      const type = optionsBefore[0]!;
      await mdp.addServiceType(type);
      const optionsAfter = await mdp.readServiceTypeOptions();
      await verify('The added type is gone from the dropdown and nothing else changed', async () => {
        expect(optionsAfter).not.toContain(type);
        expect(optionsAfter).toEqual(optionsBefore.filter((o) => o !== type));
      });
    });

    test('TC-MDP-RUL-036: An existing service type name cannot be edited', { tag: '@C107317' }, async () => {
      await about('A configured row shows its service type as plain text; clicking it does not open a dropdown.');
      await mdp.open(MDP_EDIT_OFFICE);
      const name = (await mdp.getServiceTypeNames())[0]!;
      await mdp.rowLocator(name).getByText(name, { exact: true }).click();
      await verify('No dropdown and no listbox; the name is unchanged', async () => {
        expect(await mdp.rowHasServiceTypeDropdown(name)).toBe(false);
        await expect(mdp.page.getByRole('listbox')).toHaveCount(0);
        expect(await mdp.hasRow(name)).toBe(true);
      });
    });

    test('TC-MDP-RUL-037: Deleting an unsaved new row removes it and clears the dirty state', { tag: '@C107318' }, async () => {
      await about('If the user adds a row and then deletes it before saving, the grid returns to its loaded state and Save goes back to disabled.');
      await mdp.open(MDP_EDIT_OFFICE);
      const type = (await mdp.readServiceTypeOptions())[0]!;
      await mdp.addServiceType(type);
      await mdp.deleteServiceType(type);
      await verify('Row gone, Save disabled, type offered again', async () => {
        expect(await mdp.hasRow(type)).toBe(false);
        expect(await mdp.isSaveEnabled()).toBe(false);
        expect(await mdp.readServiceTypeOptions()).toContain(type);
      });
    });

    test('TC-MDP-RUL-038: Default values on a new row are validated like any other row', { tag: '@C107319' }, async () => {
      await about('The defaults are editable and the same limits apply — raising 3 Days to 5 on a new row is rejected.');
      await mdp.open(MDP_EDIT_OFFICE);
      const type = (await mdp.readServiceTypeOptions())[0]!;
      await mdp.addServiceType(type);
      await mdp.typeIntoDay(type, 3, '5');
      const state = await mdp.getDayValidation(type, 3);
      await verify('The exceed message shows and Save is disabled', async () => {
        expect(state.invalid).toBe(true);
        expect(state.message).toBe(MDP_VALIDATION.exceeds(3));
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-039: New service type save payload holds 14 inserts with billable = job days', { tag: '@C107320' }, async () => {
      await about('Saving a new service type sends fourteen new rules (id 0), job days 1–14, each billable value equal to its job days. The write is held at the network.');
      const catalogue = await mdp.openCapturingServiceTypes(MDP_EDIT_OFFICE);
      const type = (await mdp.readServiceTypeOptions())[0]!;
      const typeId = catalogue.find((t) => t.name === type)?.id;
      const captured = await mdp.interceptSave('abort');
      await mdp.addServiceType(type);
      await mdp.clickSave();
      await mdp.waitForToast('error');
      await verify('One request, 14 inserts for the right service type', async () => {
        expect(captured).toHaveLength(1);
        expect(captured[0]).toEqual(
          MDP_NEW_ROW_DEFAULTS.map((d) => ({ id: 0, serviceTypeNameId: typeId, jobDays: d, billableDays: d, isDeleted: false })),
        );
      });
    });
  });

  // ================================================================ F. Edit & validation

  test.describe('F. Editing billable days and validation', () => {
    let rows: GridRow[];

    test.beforeEach(async () => {
      await mdp.open(MDP_EDIT_OFFICE);
      rows = await mdp.readConfiguredRows();
    });

    test('TC-MDP-RUL-040: A valid edit enables Save; restoring the original value disables it again', { tag: '@C107321' }, async () => {
      await about('Save lights up as soon as a value really changes, and goes dark again if the user types the original value back.');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const alt = validAlternative(row, day)!;
      await mdp.setDayValue(row.name, day, alt);
      const enabledAfterEdit = await mdp.isSaveEnabled();
      await mdp.setDayValue(row.name, day, v(row, day));
      await verify('Enabled after the edit, disabled after the revert', async () => {
        expect(enabledAfterEdit).toBe(true);
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-041: A value above the column\'s job days is rejected', { tag: '@C107322' }, async () => {
      await about('Billable days can never exceed the job days of the column — 6 under "5 Days" is refused with a message and Save is blocked.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 5, '6');
      const state = await mdp.getDayValidation(row.name, 5);
      await verify('Exceed message, cell flagged, Save disabled', async () => {
        expect(state).toEqual({ invalid: true, message: MDP_VALIDATION.exceeds(5) });
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-042: Boundary — billable equal to job days is accepted, one more is rejected', { tag: '@C107323' }, async () => {
      await about('Under "14 Days" the value 14 is allowed (maximum) while 15 is refused.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 14, '15');
      const over = await mdp.getDayValidation(row.name, 14);
      await mdp.typeIntoDay(row.name, 14, '14');
      const atMax = await mdp.getDayValidation(row.name, 14);
      await mdp.commitActiveCell();
      await verify('15 invalid, 14 valid and Save enabled', async () => {
        expect(over).toEqual({ invalid: true, message: MDP_VALIDATION.exceeds(14) });
        expect(atMax.invalid).toBe(false);
        expect(await mdp.isSaveEnabled()).toBe(v(row, 14) !== 14);
      });
    });

    test('TC-MDP-RUL-043: A value above 1 under "1 Day" is rejected with the exceed message', { tag: '@C107324' }, async () => {
      await about('Typing 2 under "1 Day" is refused with "Billable days cannot exceed 1 days" and Save stays blocked.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 1, '2');
      const state = await mdp.getDayValidation(row.name, 1);
      await verify('Exceed message for column 1; Save disabled', async () => {
        expect(state).toEqual({ invalid: true, message: MDP_VALIDATION.exceeds(1) });
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-044: A value lower than the previous day is rejected, citing the previous value', { tag: '@C107325' }, async () => {
      await about('Billable days may never drop from one day column to the next; the message names the previous day\'s value.');
      const { row, day } = findCell(rows, (r, d) => d > 1 && v(r, d - 1) > 0);
      const prev = v(row, day - 1);
      await mdp.typeIntoDay(row.name, day, String(prev - 1));
      const state = await mdp.getDayValidation(row.name, day);
      await verify('Less-than-previous message with the previous value; Save disabled', async () => {
        expect(state).toEqual({ invalid: true, message: MDP_VALIDATION.lessThanPrevious(prev) });
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-045: A value higher than the next day is rejected', { tag: '@C107326' }, async () => {
      await about('A cell may not exceed the value to its right; the "next day" message appears and Save is blocked.');
      const { row, day } = findCell(rows, (r, d) => d < 14 && v(r, d + 1) + 1 <= d && v(r, d + 1) + 1 >= (d > 1 ? v(r, d - 1) : 0));
      await mdp.typeIntoDay(row.name, day, String(v(row, day + 1) + 1));
      const state = await mdp.getDayValidation(row.name, day);
      await verify('Greater-than-next message; Save disabled', async () => {
        expect(state).toEqual({ invalid: true, message: MDP_VALIDATION.greaterThanNext });
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-046: When a value breaks both the maximum and the next-day rule, the maximum message wins', { tag: '@C107327' }, async () => {
      await about('Rules are checked in a fixed order — negative, maximum, previous, next — so a value too high for the column reports the maximum first.');
      // Column 1 has its own case (TC-043); this one needs a next-day neighbour on both sides.
      const { row, day } = findCell(rows, (_r, d) => d >= 2 && d < 14);
      const value = Math.max(day, v(row, day + 1)) + 1;
      await mdp.typeIntoDay(row.name, day, String(value));
      const state = await mdp.getDayValidation(row.name, day);
      await verify('The exceed message is shown', async () => {
        expect(state).toEqual({ invalid: true, message: MDP_VALIDATION.exceeds(day) });
      });
    });

    test('TC-MDP-RUL-047: Minus sign, decimal point, letters and symbols never enter a cell', { tag: '@C107328' }, async () => {
      await about('A billable-day cell only accepts digits: "-", ".", letters, "+", "e", spaces, commas and markup are swallowed as they are typed, so negative and fractional values cannot be entered.');
      const row = rows[0]!;
      for (const input of MDP_REJECTED_INPUTS) {
        await mdp.typeIntoDay(row.name, 3, input.typed);
        const value = await mdp.getDayValue(row.name, 3);
        await verify(`Typing the ${input.label} leaves the cell empty`, async () => {
          expect(value, input.label).toBe('');
        });
      }
    });

    test('TC-MDP-RUL-048: Typing "2.5" cannot produce a fractional value', { tag: '@C107329' }, async () => {
      await about('A decimal entry collapses to digits only ("25"), which the maximum rule then rejects — a fraction is never stored.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 4, '2.5');
      const value = await mdp.getDayValue(row.name, 4);
      const state = await mdp.getDayValidation(row.name, 4);
      await verify('Digits only, and rejected as above the maximum', async () => {
        expect(value).toBe('25');
        expect(state).toEqual({ invalid: true, message: MDP_VALIDATION.exceeds(4) });
      });
    });

    test('TC-MDP-RUL-049: Leading zeros are stripped', { tag: '@C107330' }, async () => {
      await about('Typing "0010" shows 10 — zero padding never reaches the value — while a lone "0" stays 0.');
      // Pads the cell's own current value, so the stripped result is valid and never traps focus.
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 14, `00${v(row, 14)}`);
      const padded = await mdp.getDayValue(row.name, 14);
      await mdp.commitActiveCell();
      await mdp.typeIntoDay(row.name, 1, '0');
      const zero = await mdp.getDayValue(row.name, 1);
      await verify('Zero padding is dropped; a lone "0" stays "0"', async () => {
        expect(padded).toBe(String(v(row, 14)));
        expect(zero).toBe('0');
      });
    });

    test('TC-MDP-RUL-050: A huge number is reported as above the maximum, without breaking the page', { tag: '@C107331' }, async () => {
      await about('Pasting an absurdly long number is caught by the maximum rule; the page keeps working.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 14, MDP_OVERSIZED_DIGITS);
      const state = await mdp.getDayValidation(row.name, 14);
      await verify('Exceed message, Save disabled, heading still rendered', async () => {
        expect(state).toEqual({ invalid: true, message: MDP_VALIDATION.exceeds(14) });
        expect(await mdp.isSaveEnabled()).toBe(false);
        expect(await mdp.isHeadingVisible()).toBe(true);
      });
    });

    test('TC-MDP-RUL-051: Clearing a cell commits zero rather than a blank', { tag: '@C107332' }, async () => {
      await about('Emptying "1 Day" and leaving the cell stores 0 — a blank billable value is never kept.');
      const row = rows[0]!;
      await mdp.setDayValue(row.name, 1, '');
      const value = await mdp.getDayValue(row.name, 1);
      const state = await mdp.getDayValidation(row.name, 1);
      await verify('Cell shows 0, valid, and the page is dirty', async () => {
        expect(value).toBe('0');
        expect(state.invalid).toBe(false);
        expect(await mdp.isSaveEnabled()).toBe(v(row, 1) !== 0);
      });
    });

    test('TC-MDP-RUL-052: An invalid cell keeps focus, and Delete is unavailable while a cell is being edited', { tag: '@C107333' }, async () => {
      await about('The user cannot leave a cell holding an invalid value, and no row can be deleted while any cell editor is open.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 5, '9');
      await mdp.page.keyboard.press('Tab');
      await mdp.commitActiveCell();
      await verify('Focus is back on the invalid cell and every Delete is disabled', async () => {
        expect(await mdp.isDayFocused(row.name, 5)).toBe(true);
        expect(await mdp.isRowDeleteEnabled(rows[1]!.name)).toBe(false);
      });
    });

    test('TC-MDP-RUL-053: Correcting an invalid value clears the error', { tag: '@C107334' }, async () => {
      await about('Fixing a refused value removes the red marker and message, and Save reflects only whether anything really changed.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 5, '9');
      const bad = await mdp.getDayValidation(row.name, 5);
      await mdp.typeIntoDay(row.name, 5, String(v(row, 5)));
      const fixed = await mdp.getDayValidation(row.name, 5);
      await mdp.commitActiveCell();
      await verify('Error gone; Save disabled because the value is back to the original', async () => {
        expect(bad.invalid).toBe(true);
        expect(fixed).toEqual({ invalid: false, message: null });
        expect(await mdp.isSaveEnabled()).toBe(false);
      });
    });

    test('TC-MDP-RUL-054: Raising a flat run of equal values works right-to-left only', { tag: '@C107335' }, async () => {
      await about('Where two neighbouring days hold the same value, raising the left one first is refused; raising the right one first and then the left one succeeds.');
      const { row, day } = findCell(
        rows,
        (r, d) => d < 14 && v(r, d) === v(r, d + 1) && v(r, d) + 1 <= d && (d + 1 === 14 || v(r, d) + 1 <= v(r, d + 2)),
      );
      const target = v(row, day) + 1;
      await mdp.typeIntoDay(row.name, day, String(target));
      const leftFirst = await mdp.getDayValidation(row.name, day);
      await mdp.typeIntoDay(row.name, day, String(v(row, day)));
      await mdp.commitActiveCell();
      await mdp.setDayValue(row.name, day + 1, target);
      await mdp.setDayValue(row.name, day, target);
      await verify('Left-first is refused; right-then-left is accepted and saveable', async () => {
        expect(leftFirst).toEqual({ invalid: true, message: MDP_VALIDATION.greaterThanNext });
        expect((await mdp.getDayValidation(row.name, day)).invalid).toBe(false);
        expect((await mdp.getDayValidation(row.name, day + 1)).invalid).toBe(false);
        expect(await mdp.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-MDP-RUL-055: The validation message is exposed to assistive technology', { tag: '@C107336' }, async () => {
      await about('An invalid cell is marked aria-invalid and points, through aria-describedby, at the text of its message.');
      const row = rows[0]!;
      await mdp.typeIntoDay(row.name, 2, '3');
      const attrs = await mdp.getDayInputAttributes(row.name, 2);
      const state = await mdp.getDayValidation(row.name, 2);
      await verify('aria-invalid=true and a described-by message', async () => {
        expect(attrs.ariaInvalid).toBe('true');
        expect(attrs.inputmode).toBe('numeric');
        expect(state.message).toBe(MDP_VALIDATION.exceeds(2));
      });
    });

    test('TC-MDP-RUL-056: Pasting non-numeric text is refused', { tag: '@C107337' }, async () => {
      await about('Pasting "abc" or "1,5" into a cell (a single input event, not keystrokes) is refused as a whole.');
      const row = rows[0]!;
      const input = await mdp.dayInput(row.name, 6);
      await phase('Paste "abc" then "1,5" into 6 Days', async () => {
        await input.fill('abc');
      });
      const afterAbc = await input.inputValue();
      await input.fill('1,5');
      const afterComma = await input.inputValue();
      await verify('Neither paste changes the cell', async () => {
        expect(afterAbc).toBe(String(v(row, 6)));
        expect(afterComma).toBe(String(v(row, 6)));
      });
    });

    test('TC-MDP-RUL-057: Tab moves from one day cell to the next', { tag: '@C107338' }, async () => {
      await about('Keyboard users move along a row with Tab, from 1 Day to 2 Days.');
      const row = rows[0]!;
      const day1 = await mdp.dayInput(row.name, 1);
      await day1.click();
      await mdp.page.keyboard.press('Tab');
      await verify('Focus is in the 2 Days cell of the same row', async () => {
        expect(await mdp.isDayFocused(row.name, 2)).toBe(true);
      });
    });
  });

  // ================================================================ G. Delete

  test.describe('G. Deleting a service type', () => {
    test.beforeEach(async () => {
      await mdp.open(MDP_EDIT_OFFICE);
    });

    test('TC-MDP-RUL-058: Delete asks for confirmation naming the service type', { tag: '@C107339' }, async () => {
      await about('Clicking Delete on a row asks "Are you sure you want to delete <service type> ?" with No and Yes.');
      const name = (await mdp.getServiceTypeNames())[0]!;
      const dialog = await mdp.clickRowDelete(name);
      await verify('Title and text name the service type; No and Yes offered', async () => {
        expect(dialog.title).toBe(MDP_MESSAGES.deleteDialogTitle);
        expect(dialog.text).toContain(MDP_MESSAGES.deleteDialogDescription(name));
        await expect(mdp.page.getByRole('alertdialog').getByRole('button', { name: 'No', exact: true })).toBeVisible();
        await expect(mdp.page.getByRole('alertdialog').getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
      });
    });

    for (const answer of ['No', 'Close', 'Escape'] as const) {
      const id = { No: '059', Close: '060', Escape: '061' }[answer];
      test(`TC-MDP-RUL-${id}: Dismissing the delete confirmation with ${answer} keeps the row`, { tag: LOOP_CASE_TAGS[`TC-MDP-RUL-${id}`] }, async () => {
        await about(`Backing out of the delete confirmation (${answer}) leaves the row in place and the page clean.`);
        const name = (await mdp.getServiceTypeNames())[0]!;
        const countBefore = await mdp.getItemsFoundCount();
        await mdp.clickRowDelete(name);
        await mdp.answerDeleteDialog(answer);
        await verify('Row present, count unchanged, Save disabled', async () => {
          expect(await mdp.hasRow(name)).toBe(true);
          expect(await mdp.getItemsFoundCount()).toBe(countBefore);
          expect(await mdp.isSaveEnabled()).toBe(false);
        });
      });
    }

    test('TC-MDP-RUL-062: Confirming Yes hides the row, says it will go on Save, and enables Save', { tag: '@C107343' }, async () => {
      await about('After Yes the row disappears straight away, a notice says it will be removed on Save, and Save becomes available.');
      const name = (await mdp.getServiceTypeNames())[0]!;
      await mdp.clickRowDelete(name);
      await mdp.answerDeleteDialog('Yes');
      const toast = await mdp.waitForToast('success');
      await verify('Row hidden, staged-delete notice, Save enabled', async () => {
        expect(await mdp.hasRow(name)).toBe(false);
        expect(toast).toBe(MDP_MESSAGES.rowDeleted);
        expect(await mdp.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-MDP-RUL-063: A staged deletion hides the row but the count only changes on Save', { tag: '@C107344' }, async () => {
      await about('After Delete → Yes the row leaves the grid at once, while the "items found" counter keeps its number until the deletion is saved.');
      const name = (await mdp.getServiceTypeNames())[0]!;
      const before = await mdp.getItemsFoundCount();
      await mdp.deleteServiceType(name);
      await verify('Row hidden, counter unchanged, Save enabled', async () => {
        expect(await mdp.hasRow(name)).toBe(false);
        expect(await mdp.getItemsFoundCount()).toBe(before);
        expect(await mdp.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-MDP-RUL-064: A staged delete is not persisted — leaving without Save keeps the rules', { tag: '@C107345' }, async () => {
      await about('Deleting a row and then reloading without Save brings the row back, and no write was ever sent.');
      const captured = await mdp.interceptSave('abort');
      const name = (await mdp.getServiceTypeNames())[0]!;
      await mdp.deleteServiceType(name);
      await mdp.reload();
      await verify('The row is back and no save request was made', async () => {
        expect(await mdp.hasRow(name)).toBe(true);
        expect(captured).toHaveLength(0);
      });
    });

    test('TC-MDP-RUL-065: Delete payload marks all 14 rules of the service type with their ids', { tag: '@C107346' }, async () => {
      await about('Saving a staged delete sends one IsDeleted entry per job day, each carrying that rule\'s id and service type. The write is held at the network.');
      const rules = await mdp.openCapturingRules(MDP_EDIT_OFFICE);
      const name = (await mdp.getServiceTypeNames())[0]!;
      const expected = rules
        .filter((r) => r.serviceTypeName === name)
        .map((r) => ({ id: r.id, serviceTypeNameId: r.serviceTypeNameId, jobDays: r.jobDays, billableDays: r.billableDays, isDeleted: true }));
      const captured = await mdp.interceptSave('abort');
      await mdp.deleteServiceType(name);
      await mdp.clickSave();
      await mdp.waitForToast('error');
      await verify('Exactly the 14 rules of that service type, all flagged deleted', async () => {
        expect(captured).toHaveLength(1);
        expect(captured[0]).toEqual(expected);
      });
    });

    test('TC-MDP-RUL-066: Pressing the Delete key in a cell edits the cell, it does not delete the row', { tag: '@C107347' }, async () => {
      await about('The keyboard Delete key only removes characters from the focused cell; rows are deleted through the row\'s Delete button.');
      const name = (await mdp.getServiceTypeNames())[0]!;
      const input = await mdp.dayInput(name, 14);
      await input.click();
      await input.press('Home');
      await input.press('Delete');
      await verify('Row still present, no confirmation dialog', async () => {
        expect(await mdp.hasRow(name)).toBe(true);
        await expect(mdp.page.getByRole('alertdialog')).toHaveCount(0);
      });
    });
  });

  // ================================================================ H. Save lifecycle (writes held at the network)

  test.describe('H. Save lifecycle and payloads', () => {
    let rows: GridRow[];

    test.beforeEach(async () => {
      await mdp.open(MDP_EDIT_OFFICE);
      rows = await mdp.readConfiguredRows();
    });

    test('TC-MDP-RUL-067: With nothing changed Save is disabled and no write is sent', { tag: '@C107348' }, async () => {
      await about('Straight after loading — or after an edit is undone — there is nothing to save: Save is disabled and clicking it sends nothing.');
      const captured = await mdp.interceptSave('abort');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      await mdp.setDayValue(row.name, day, validAlternative(row, day)!);
      await mdp.setDayValue(row.name, day, v(row, day));
      await mdp.page.locator('main button:text-is("Save")').click({ force: true });
      await mdp.page.waitForTimeout(1_500);
      await verify('Save disabled, no request, no toast', async () => {
        expect(await mdp.isSaveEnabled()).toBe(false);
        expect(captured).toHaveLength(0);
        await expect(mdp.page.locator('[data-sonner-toast]')).toHaveCount(0);
      });
    });

    test('TC-MDP-RUL-068: Saving one changed cell sends only that rule with its id and job day', { tag: '@C107349' }, async () => {
      await about('Changing one cell sends exactly one rule: its id, service type, job day and new billable value — nothing untouched rides along.');
      const rules = await mdp.openCapturingRules(MDP_EDIT_OFFICE);
      rows = await mdp.readConfiguredRows();
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const alt = validAlternative(row, day)!;
      const rule = ruleFor(rules, row.name, day);
      const captured = await mdp.interceptSave('abort');
      await mdp.setDayValue(row.name, day, alt);
      await mdp.clickSave();
      await mdp.waitForToast('error');
      await verify('One request with one update', async () => {
        expect(captured).toEqual([[{ id: rule.id, serviceTypeNameId: rule.serviceTypeNameId, jobDays: day, billableDays: alt, isDeleted: false }]]);
      });
    });

    test('TC-MDP-RUL-069: Changes in two rows are sent together, untouched rows are excluded', { tag: '@C107350' }, async () => {
      await about('Edits in two different service types go in one save with exactly two rules; the other rows are not sent.');
      const picks = rows
        .map((r) => ({ row: r, day: [...Array(14).keys()].map((i) => i + 1).find((d) => validAlternative(r, d) !== null) }))
        .filter((p): p is { row: GridRow; day: number } => p.day !== undefined)
        .slice(0, 2);
      const captured = await mdp.interceptSave('abort');
      for (const p of picks) await mdp.setDayValue(p.row.name, p.day, validAlternative(p.row, p.day)!);
      await mdp.clickSave();
      await mdp.waitForToast('error');
      await verify('Two updates, one per edited cell', async () => {
        expect(captured).toHaveLength(1);
        expect(captured[0]!.map((u) => [u.jobDays, u.billableDays]).sort()).toEqual(
          picks.map((p) => [p.day, validAlternative(p.row, p.day)!]).sort(),
        );
      });
    });

    test('TC-MDP-RUL-070: A value still being typed is included when Save is clicked', { tag: '@C107351' }, async () => {
      await about('A user who types a new value and clicks Save without leaving the cell gets that value saved too. The click is made at human speed.');
      const editable = rows.map((r) => ({ row: r, day: [...Array(14).keys()].map((i) => i + 1).find((d) => validAlternative(r, d) !== null) }))
        .filter((p): p is { row: GridRow; day: number } => p.day !== undefined);
      const [first, second] = [editable[0]!, editable[1]!];
      const captured = await mdp.interceptSave('abort');
      await mdp.setDayValue(first.row.name, first.day, validAlternative(first.row, first.day)!);
      await mdp.typeIntoDay(second.row.name, second.day, String(validAlternative(second.row, second.day)!));
      // 120 ms between press and release, like a person; an instant click outruns the cell's commit.
      await mdp.clickSave(120);
      await mdp.waitForToast('error');
      await verify('Both the committed and the in-progress value are in the request', async () => {
        expect(captured[0]?.map((u) => u.billableDays)).toEqual([
          validAlternative(first.row, first.day),
          validAlternative(second.row, second.day),
        ]);
      });
    });

    test('TC-MDP-RUL-071: A network failure on Save shows an error and keeps the edit', { tag: '@C107352' }, async () => {
      await about('If the save cannot reach the server the user sees "Failed to save multiday pricing rules", the edit stays on screen and Save stays available to retry.');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const alt = validAlternative(row, day)!;
      await mdp.interceptSave('abort');
      await mdp.setDayValue(row.name, day, alt);
      await mdp.clickSave();
      const toast = await mdp.waitForToast('error');
      await verify('Error toast, edited value kept, Save still enabled', async () => {
        expect(toast).toBe(MDP_MESSAGES.saveFailed);
        expect(await mdp.getDayValue(row.name, day)).toBe(String(alt));
        expect(await mdp.isSaveEnabled()).toBe(true);
      });
    });

    test('TC-MDP-RUL-072: A server error on Save shows an error and nothing is marked saved', { tag: '@C107353' }, async () => {
      await about('If the server answers 500 the save is reported as failed and the page is not falsely shown as saved; reloading shows the original value.');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      await mdp.interceptSave('server-error');
      await mdp.setDayValue(row.name, day, validAlternative(row, day)!);
      await mdp.clickSave();
      const toast = await mdp.waitForToast('error');
      const enabled = await mdp.isSaveEnabled();
      await mdp.clearInterceptions();
      await mdp.reload();
      await verify('Error toast, still dirty, and the server still holds the original', async () => {
        expect(toast).toBe(MDP_MESSAGES.saveFailed);
        expect(enabled).toBe(true);
        expect(await mdp.getDayValue(row.name, day)).toBe(String(v(row, day)));
      });
    });

    test('TC-MDP-RUL-073: While a save is in flight Save is disabled and a second click sends nothing', { tag: '@C107354' }, async () => {
      await about('Clicking Save twice quickly sends a single request; the button is disabled while the first is running.');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const captured = await mdp.interceptSave('delay-then-abort', 4_000);
      await mdp.setDayValue(row.name, day, validAlternative(row, day)!);
      await mdp.clickSave();
      const disabledInFlight = !(await mdp.isSaveEnabled());
      await mdp.page.locator('main button:text-is("Save")').click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await mdp.waitForToast('error');
      await verify('Disabled during flight; exactly one request', async () => {
        expect(disabledInFlight).toBe(true);
        expect(captured).toHaveLength(1);
      });
    });

    test('TC-MDP-RUL-074: Leaving through the sidebar with unsaved changes asks Stay or Discard', { tag: '@C107355' }, async () => {
      await about('Clicking another page in the sidebar with unsaved edits asks first; Stay keeps the edit, Discard leaves.');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const alt = validAlternative(row, day)!;
      await mdp.setDayValue(row.name, day, alt);
      await mdp.clickSidebarHome();
      const text = await mdp.readUnsavedDialog();
      await mdp.answerUnsavedDialog('Stay');
      await verify('Dialog copy is right; Stay keeps the page and the edit', async () => {
        expect(text).toContain(MDP_MESSAGES.unsavedTitle);
        expect(text).toContain(MDP_MESSAGES.unsavedDescription);
        expect(mdp.page.url()).toContain('/settings/multiday-pricing-rules');
        expect(await mdp.getDayValue(row.name, day)).toBe(String(alt));
      });
      await mdp.clickSidebarHome();
      await mdp.readUnsavedDialog();
      await mdp.answerUnsavedDialog('Discard');
      await verify('Discard navigates to Home', async () => {
        await expect(mdp.page).toHaveURL(/\/home$/, { timeout: 30_000 });
      });
    });

    test('TC-MDP-RUL-075: Sorting with unsaved changes asks first; Discard reverts the edit and sorts', { tag: '@C107356' }, async () => {
      await about('Sorting would throw away edits, so it asks; Stay keeps order and edit, Discard reverts the edit and applies the sort.');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const firstName = rows[0]!.name;
      await mdp.setDayValue(row.name, day, validAlternative(row, day)!);
      await mdp.sortBy(MDP_SERVICE_TYPE_HEADER, 'descending');
      await mdp.readUnsavedDialog();
      await mdp.answerUnsavedDialog('Stay');
      const afterStay = { first: (await mdp.getServiceTypeNames())[0], value: await mdp.getDayValue(row.name, day) };
      await mdp.sortBy(MDP_SERVICE_TYPE_HEADER, 'descending');
      await mdp.readUnsavedDialog();
      await mdp.answerUnsavedDialog('Discard');
      await verify('Stay: unchanged order and kept edit; Discard: original value and sorted Z→A', async () => {
        expect(afterStay.first).toBe(firstName);
        expect(afterStay.value).toBe(String(validAlternative(row, day)));
        expect(await mdp.getDayValue(row.name, day)).toBe(String(v(row, day)));
        expect(await mdp.isSaveEnabled()).toBe(false);
        const names = await mdp.getServiceTypeNames();
        expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
      });
    });

    test('TC-MDP-RUL-076: Reloading the browser with unsaved changes raises the leave-page prompt', { tag: '@C107357' }, async () => {
      await about('A browser reload or tab close with unsaved edits triggers the browser\'s own "leave site?" prompt.');
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const alt = validAlternative(row, day)!;
      await mdp.setDayValue(row.name, day, alt);
      (mdp.page as unknown as Record<string, unknown>).__skipBeforeunloadAutoAccept = true;
      let dialogType: string | null = null;
      mdp.page.once('dialog', async (d) => {
        dialogType = d.type();
        await d.dismiss();
      });
      await phase('Reload the browser and stay on the page', () => mdp.page.reload({ timeout: 5_000 }).then(() => undefined).catch(() => undefined));
      await verify('A beforeunload prompt fired and the edit is still there', async () => {
        expect(dialogType).toBe('beforeunload');
        expect(await mdp.getDayValue(row.name, day)).toBe(String(alt));
      });
    });

    test('TC-MDP-RUL-077: With no changes the page can be left without any prompt', { tag: '@C107358' }, async () => {
      await about('A clean page never nags: clicking Home goes straight there.');
      await mdp.clickSidebarHome();
      await verify('Navigated to Home and no Unsaved changes dialog appeared', async () => {
        await expect(mdp.page).toHaveURL(/\/home$/, { timeout: 30_000 });
        expect(await mdp.isUnsavedDialogVisible()).toBe(false);
      });
    });
  });

  // ================================================================ I. Persistence (REAL WRITES — restored in finally)

  test.describe.serial('I. Persistence and audit @mutating', () => {
    test('TC-MDP-RUL-078: A saved cell persists, only that rule\'s audit fields move, and nothing else changes', { tag: '@C107359' }, async () => {
      await about('Saving one changed cell shows "saved successfully", clears the dirty state, survives a reload, updates ModUser/ModDate of that rule only, and leaves every other rule untouched.');
      const before = await mdp.openCapturingRules(MDP_EDIT_OFFICE);
      const rows = await mdp.readConfiguredRows();
      const row = rows[rows.length - 1]!;
      const day = 14;
      const original = v(row, day);
      const next = original < 14 ? original + 1 : original - 1;
      const target = ruleFor(before, row.name, day);
      try {
        await mdp.setDayValue(row.name, day, next);
        const { updates } = await mdp.saveAndWait();
        const toast = await mdp.waitForToast('success');
        await verify('Success toast, single-rule payload, Save disabled again', async () => {
          expect(toast).toBe(MDP_MESSAGES.saveSuccess);
          expect(updates).toEqual([{ id: target.id, serviceTypeNameId: target.serviceTypeNameId, jobDays: day, billableDays: next, isDeleted: false }]);
          expect(await mdp.isSaveEnabled()).toBe(false);
        });
        const after = await mdp.reloadCapturingRules();
        const saved = ruleFor(after, row.name, day);
        await verify('The new value persisted under the same rule id', async () => {
          expect(saved.id).toBe(target.id);
          expect(saved.billableDays).toBe(next);
          expect(await mdp.getDayValue(row.name, day)).toBe(String(next));
        });
        await verify('Audit: ModDate moved, CreateUser/CreateDate untouched, ModUser server-set', async () => {
          expect(new Date(rscDate(saved.updatedAt)).getTime()).toBeGreaterThan(new Date(rscDate(target.updatedAt)).getTime());
          expect(saved.createdBy).toBe(target.createdBy);
          expect(rscDate(saved.createdAt)).toBe(rscDate(target.createdAt));
          expect(saved.updatedBy).toBeTruthy();
        });
        await verify('Every other rule is byte-for-byte unchanged', async () => {
          const strip = (rs: MultidayRule[]) => rs.filter((r) => r.id !== target.id).map((r) => JSON.stringify(r)).sort();
          expect(strip(after)).toEqual(strip(before));
        });
      } finally {
        await phase('Restore the original value', async () => {
          await mdp.open(MDP_EDIT_OFFICE);
          if ((await mdp.getDayValue(row.name, day)) !== String(original)) {
            await mdp.setDayValue(row.name, day, original);
            await mdp.saveAndWait();
          }
        });
      }
    });

    test('TC-MDP-RUL-079: A new service type persists with defaults and server audit, then its deletion persists', { tag: '@C107360' }, async () => {
      await about('Full lifecycle: add a service type and save (14 rules created with server-set audit fields), then delete it and save (all 14 rules removed and the type returns to the dropdown).');
      test.setTimeout(420_000);
      await mdp.open(MDP_EDIT_OFFICE);
      const options = await mdp.readServiceTypeOptions();
      const type = options.includes(MDP_ROUND_TRIP_SERVICE_TYPE) ? MDP_ROUND_TRIP_SERVICE_TYPE : options[0]!;
      const startedAt = Date.now();
      try {
        await mdp.addServiceType(type);
        await mdp.saveAndWait();
        const created = (await mdp.reloadCapturingRules()).filter((r) => r.serviceTypeName === type);
        await verify('14 rules exist with defaults and server-populated audit fields', async () => {
          expect(created.map((r) => [r.jobDays, r.billableDays])).toEqual(MDP_NEW_ROW_DEFAULTS.map((d) => [d, d]));
          for (const r of created) {
            expect(r.id).toBeGreaterThan(0);
            expect(r.createdBy).toBeTruthy();
            expect(new Date(rscDate(r.createdAt)).getTime()).toBeGreaterThan(startedAt - 5 * 60_000);
          }
          expect(await mdp.getRowValues(type)).toEqual(MDP_NEW_ROW_DEFAULTS);
        });
        await mdp.deleteServiceType(type);
        const { updates } = await mdp.saveAndWait();
        await verify('Delete payload carries the 14 new rule ids', async () => {
          expect(updates.map((u) => u.id).sort((a, b) => a - b)).toEqual(created.map((r) => r.id).sort((a, b) => a - b));
          expect(updates.every((u) => u.isDeleted)).toBe(true);
        });
        const after = await mdp.reloadCapturingRules();
        await verify('No rule remains for the type and it is offered again', async () => {
          expect(after.filter((r) => r.serviceTypeName === type)).toHaveLength(0);
          expect(await mdp.hasRow(type)).toBe(false);
          expect(await mdp.readServiceTypeOptions()).toContain(type);
        });
      } finally {
        await phase('Remove the service type if it is still configured', async () => {
          await mdp.open(MDP_EDIT_OFFICE);
          if (await mdp.hasRow(type)) {
            await mdp.deleteServiceType(type);
            await mdp.saveAndWait();
          }
        });
      }
    });

    test('TC-MDP-RUL-080: Client-supplied audit values are ignored by the server', { tag: '@C107361' }, async () => {
      await about('A save that smuggles CreatedBy/UpdatedBy values cannot overwrite the server-controlled audit fields. The payload re-saves a rule\'s current value, so no billable data changes.');
      const before = await mdp.openCapturingRules(MDP_EDIT_OFFICE);
      const target = before[before.length - 1]!;
      const spoof = 'spoofed-by-automation';
      const { result } = await mdp.callServerAction('updateMultidayPricingRulesAction', [{
        updates: [{ id: target.id, serviceTypeNameId: target.serviceTypeNameId, jobDays: target.jobDays, billableDays: target.billableDays, isDeleted: false, createdBy: spoof, updatedBy: spoof, createdAt: '2000-01-01T00:00:00Z' }],
        culture: 'en-US',
      }]);
      await attachNote('Server answer', JSON.stringify(result));
      const after = ruleFor(await mdp.reloadCapturingRules(), target.serviceTypeName, target.jobDays);
      await verify('Audit fields are not the spoofed ones and the value is unchanged', async () => {
        expect(after.createdBy).not.toBe(spoof);
        expect(after.updatedBy).not.toBe(spoof);
        expect(rscDate(after.createdAt)).toBe(rscDate(target.createdAt));
        expect(after.billableDays).toBe(target.billableDays);
      });
    });

  });

  // ================================================================ J. Resilience, i18n, accessibility, layout

  test.describe('J. Session, localisation, accessibility and layout', () => {
    test('TC-MDP-RUL-081: The save action refuses a request that has no session', { tag: '@C107362' }, async () => {
      await about('A save sent without being signed in is refused and changes nothing. The probe re-sends a rule\'s current value, so even an accepted call could not change billable data.');
      const before = await mdp.openCapturingRules(MDP_READONLY_OFFICE);
      const target = before[0]!;
      const { status, result } = await mdp.callServerActionWithoutSession('updateMultidayPricingRulesAction', [{
        updates: [{ id: target.id, serviceTypeNameId: target.serviceTypeNameId, jobDays: target.jobDays, billableDays: target.billableDays, isDeleted: false }],
        culture: 'en-US',
      }]);
      await attachNote('Server answer', `HTTP ${status}\n${JSON.stringify(result)}`);
      const after = ruleFor(await mdp.reloadCapturingRules(), target.serviceTypeName, target.jobDays);
      await verify('The save is refused and the rule is untouched', async () => {
        const accepted = status < 400 && (result as { data?: { success?: boolean } } | null)?.data?.success === true;
        expect(accepted, 'save action accepted a request without a session').toBe(false);
        expect(rscDate(after.updatedAt)).toBe(rscDate(target.updatedAt));
      });
    });

    test('TC-MDP-RUL-082: Without a session the page sends the user to sign in', { tag: '@C107363' }, async ({ browser, config }) => {
      await about('An expired or missing session never shows the rules; the user is sent to sign in.');
      // Explicitly empty: inside a test, newContext() inherits the project's storageState (signed in).
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await ctx.newPage();
        await page.goto(`${config.base_url}locations/${MDP_READONLY_OFFICE}/settings/multiday-pricing-rules`, { waitUntil: 'domcontentloaded' });
        await verify('The browser is sent to sign-in (returning here afterwards) and no grid is shown', async () => {
          // Path, not href: the sign-in URL carries this page as its callbackUrl.
          await page.waitForURL((u) => /\/auth\/sign-in$/.test(u.pathname), { timeout: 60_000 });
          expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(`/locations/${MDP_READONLY_OFFICE}/settings/multiday-pricing-rules`);
          await expect(page.locator('main table')).toHaveCount(0);
        });
      } finally {
        await ctx.close();
      }
    });

    test('TC-MDP-RUL-083: A save attempted after the session expires does not change data', { tag: '@C107364' }, async ({ browser, config }) => {
      await about('If the session runs out while the user is editing, Save fails safely: the user is told or sent to sign in, and the stored rule is unchanged.');
      const before = await mdp.openCapturingRules(MDP_EDIT_OFFICE);
      const rows = await mdp.readConfiguredRows();
      const { row, day } = findCell(rows, (r, d) => validAlternative(r, d) !== null);
      const target = ruleFor(before, row.name, day);
      const ctx = await browser.newContext({ storageState: STATE_PATH });
      try {
        const other = new MultidayPricingRulesPage(await ctx.newPage(), config);
        await other.open(MDP_EDIT_OFFICE);
        await other.setDayValue(row.name, day, validAlternative(row, day)!);
        await phase('Expire the session by clearing its cookies', () => ctx.clearCookies());
        await other.clickSave();
        await phase('Give the failed save time to answer', () => other.page.waitForTimeout(5_000));
        await attachNote('Page after the expired save', other.page.url());
      } finally {
        await ctx.close();
      }
      const after = ruleFor(await mdp.reloadCapturingRules(), row.name, day);
      await verify('The stored rule is unchanged', async () => {
        expect(after.billableDays).toBe(target.billableDays);
        expect(rscDate(after.updatedAt)).toBe(rscDate(target.updatedAt));
      });
    });

    test('TC-MDP-RUL-084: No untranslated i18n key is visible on the page', { tag: '@C107365' }, async () => {
      await about('Every label, header, placeholder and message on the page is real text, never a raw key like "pricing.multidayPricingRules.…".');
      await mdp.open(MDP_EDIT_OFFICE);
      const name = (await mdp.getServiceTypeNames())[0]!;
      await mdp.typeIntoDay(name, 5, '9');
      const keys = await mdp.findRawI18nKeys();
      await verify('No dotted i18n keys in the page text', async () => {
        expect(keys).toEqual([]);
      });
    });

    test('TC-MDP-RUL-085: Every page control has an accessible name', { tag: '@C107366' }, async () => {
      await about('Screen-reader users can tell every button apart: Save, Grid Options, each sort header, each resize handle and each row Delete have a name.');
      await mdp.open(MDP_EDIT_OFFICE);
      const names = await mdp.readControlNames();
      await verify('No unnamed buttons; the key controls are named', async () => {
        expect(names.filter((n) => n.length === 0)).toEqual([]);
        expect(names).toEqual(expect.arrayContaining(['Save', 'Grid Options', 'Delete', ...MDP_DAY_HEADERS, ...MDP_DAY_COLUMN_IDS.map((id) => `Resize column ${id}`)]));
      });
    });

    for (const [i, vp] of MDP_VIEWPORTS.entries()) {
      const id = `TC-MDP-RUL-${String(86 + i).padStart(3, '0')}`;
      test(`${id}: Page stays usable at ${vp.label}`, { tag: LOOP_CASE_TAGS[id] }, async () => {
        await about(`At ${vp.label} the title, Save and the grid stay reachable; the wide grid scrolls inside itself instead of stretching the page.`);
        const original = mdp.page.viewportSize();
        try {
          await mdp.page.setViewportSize({ width: vp.width, height: vp.height });
          await mdp.open(MDP_EDIT_OFFICE);
          const overflow = await mdp.measureOverflow();
          await verify('Heading and Save visible; grid scrolls, page does not', async () => {
            expect(await mdp.isHeadingVisible()).toBe(true);
            await expect(mdp.page.locator('main button:text-is("Save")')).toBeInViewport();
            expect(overflow.gridScrolls).toBe(true);
            expect(overflow.pageOverflows).toBe(false);
          });
        } finally {
          if (original) await mdp.page.setViewportSize(original);
        }
      });
    }
  });
});
