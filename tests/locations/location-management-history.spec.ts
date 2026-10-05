import { test, expect } from '../../src/fixtures/pages.fixture';
import { about, phase, verify, attachNote } from '../../src/fixtures/report-steps';
import type { Browser } from '@playwright/test';
import { Log } from '../../src/utils/logger';
import { STATE_PATH } from '../../src/utils/auth-storage';
import type { IConfig } from '../../src/types';
import { LocationManagementHistoryPage } from '../../src/pages/locations/location-management-history.page';
import type { LocationLeftPanelBasicInformationPage } from '../../src/pages/locations/location-left-panel-basic-information.page';
import {
  COLUMN_COUNT,
  DEFAULT_ROWS_PER_PAGE,
  ROWS_PER_PAGE_OPTIONS,
  HISTORY_CHECK_GLYPH,
  HISTORY_EMPTY_STATE_TEXT,
  HISTORY_OFFICE,
  HISTORY_CONTRAST_OFFICE,
  AUTOMATION_USER,
  LOCATION_SETTINGS_TAB_ORDER,
  BASIC_INFO_SUBTABS,
  HISTORY_ALL_COLUMNS_IN_ORDER,
  SORTABLE_COLUMNS,
  HISTORY_SORT_COLUMN,
  HISTORY_AUDIT_USER_COLUMN,
  HISTORY_DATE_SORT_COLUMN,
  HISTORY_BOOLEAN_SORT_COLUMNS,
  HISTORY_DEFAULT_SORT,
  HISTORY_SORT_KEYS,
  COMPOSITE_CURRENCY_COLUMNS,
  COMPOSITE_CURRENCIES,
  HISTORY_PLAIN_DATE_COLUMNS,
  HISTORY_BOOLEAN_COLUMNS,
  REPRESENTATIVE_FIELDS,
  HISTORY_FORBIDDEN_CELL_TEXT,
  HISTORY_FORBIDDEN_BOOLEAN_TEXT,
  HISTORY_MODIFIED_ON_PATTERN,
  HISTORY_PLAIN_DATE_PATTERN,
  UUID_PATTERN,
  RAW_FIELD_KEY_PATTERN,
  I18N_PLACEHOLDER_PATTERNS,
  HISTORY_API_URL_PATTERN,
  HISTORY_TYPES,
  HISTORY_LEGACY,
  HISTORY_MOCK,
  HISTORY_PAGE_INPUT_REJECTED,
  HISTORY_PAGE_INPUT_ACCEPTED,
  HISTORY_PAGE_INPUT_DECIMAL_DEFECT,
  LANGUAGE_OPTIONS,
  DEFAULT_LANGUAGE,
  HISTORY_TRANSLATIONS,
  LIVE_DATE_COLUMN_INDEX,
  LOCALE_KNOWN_DUPLICATE_HEADERS,
  SAVE_CYCLE_PROBE,
  RECENT_ROW_WINDOW_MS,
  SETTINGS_TABS,
  SETTING_TO_HISTORY_COLUMN,
  UNTRACKED_SETTINGS,
  IGNORED_CONTROLS,
  SAVE_CHECK_LEFT_PANEL,
  SAVE_CHECK_LOCAL_INFORMATION,
  SAVE_CHECK_OTHER_TABS,
  SAVE_CHECK_UNTRACKED,
  PRICING_STRATEGY_COLUMNS,
  PRICING_STRATEGY_PROBE_SELECTOR,
  SAVE_CHECK_TIMEZONE,
  type SaveCheckField,
  type AppLanguage,
} from '../../src/data/locations/location-management-history';

// Location Settings -> Location Management History (NM-3937; columns and read-only contract from
// NM-820, server-side sorting from NM-1346). The tab is strictly read-only, so every scenario except
// the save cycle (TC-058..060) mutates nothing and the beforeEach re-navigation is the whole reset.
// Mocked states (empty, error, loading, partial payloads) rewrite the real history response rather
// than inventing one — the envelope is { success, data: { history, totalCount } }, confirmed live.

// route.fetch() re-issues the POST from the test process; the e2e gateway resets that socket often
// enough to make a single attempt unreliable. Playwright retries ECONNRESET only, never a 4xx/5xx.
const HISTORY_FETCH_MAX_RETRIES = 3;

const parseTs = LocationManagementHistoryPage.parseModifiedOnMs;
const parseDate = LocationManagementHistoryPage.parseDateOnlyMs;

/** Non-blank, non-check-glyph values — the input to every ordering assertion. */
const meaningful = (values: string[]): string[] => values.filter(v => v !== '' && v !== HISTORY_CHECK_GLYPH);

const isNonDescending = (values: number[]): boolean => values.every((v, i) => i === 0 || v >= values[i - 1]!);
const isNonAscending = (values: number[]): boolean => values.every((v, i) => i === 0 || v <= values[i - 1]!);

/** A sorted boolean column GROUPS its two states: at most one flip down the page. */
const isGrouped = (values: string[]): boolean => {
  let flips = 0;
  for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1]) flips++;
  return flips <= 1;
};

/** Labels that occur more than once — the grid has exactly one by design (Currency, twice). */
const duplicatedLabels = (headers: string[]): string[] => {
  const counts = new Map<string, number>();
  headers.forEach(h => counts.set(h, (counts.get(h) ?? 0) + 1));
  return [...counts].filter(([, n]) => n > 1).map(([h, n]) => `${h} x${n}`);
};

/** NM-3937 field -> live header: which requirement fields have no live column. */
const unresolvedFields = (headers: string[], group: Record<string, string>): string[] =>
  Object.entries(group).filter(([, live]) => !headers.includes(live)).map(([field, live]) => `${field} -> "${live}"`);

type HistoryEnvelope = { success?: boolean; data?: { history?: Record<string, unknown>[]; totalCount?: number } };

/**
 * Installs a history-response rewriter over the REAL response. Anything that is not the confirmed
 * envelope passes through untouched, and any socket failure hands the request back to the network —
 * a handler that throws leaves the route unsettled and hangs the reload.
 */
async function mockHistoryResponse(pg: LocationManagementHistoryPage, mutate: (body: HistoryEnvelope) => HistoryEnvelope): Promise<void> {
  await pg.page.route(HISTORY_API_URL_PATTERN, async (route) => {
    try {
      const response = await route.fetch({ maxRetries: HISTORY_FETCH_MAX_RETRIES, timeout: 60_000 });
      let body: HistoryEnvelope;
      try {
        body = await response.json() as HistoryEnvelope;
      } catch {
        await route.fulfill({ response });
        return;
      }
      if (!Array.isArray(body?.data?.history)) {
        await route.fulfill({ response });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mutate(body)) });
    } catch (error) {
      Log.warn(`[history-mock] interception fell through to the live response: ${(error as Error).message}`);
      await route.fallback().catch(() => { /* already settled or page gone */ });
    }
  });
}

/** Rewrites the history array only, keeping the envelope and totalCount consistent. */
const withRecords = (fn: (records: Record<string, unknown>[]) => Record<string, unknown>[]) =>
  (body: HistoryEnvelope): HistoryEnvelope => {
    const records = fn(body.data!.history!);
    return { ...body, data: { ...body.data, history: records, totalCount: records.length === 0 ? 0 : body.data!.totalCount } };
  };

/** The Notes column renders the record's `notes` ARRAY of { id, date, note } — confirmed live. */
const withNotes = (text: string) => withRecords(records => {
  if (!records.length) return records;
  const first = { ...records[0]!, notes: [{ id: 'mock-note', date: new Date().toISOString(), note: text }] };
  return [first, ...records.slice(1)];
});

/** Drops a third of the first record's top-level fields and nulls another third. */
const withPartialFields = withRecords(records => {
  if (!records.length) return records;
  const first: Record<string, unknown> = { ...records[0]! };
  Object.keys(first).forEach((key, i) => {
    if (i % 3 === 0) delete first[key];
    else if (i % 3 === 1) first[key] = null;
  });
  return [first, ...records.slice(1)];
});

/**
 * Tears interception down and puts the grid back on live data. Cheap path: unroute, then leave the
 * tab for Basic Information and back — a tab re-entry remounts the grid and re-fetches, as TC-003
 * proves, without paying for a full page reload. Falls back to the full reload whenever that doesn't
 * actually land on live data (still no rows, or a mocked marker — 'mock-note' or the 2,000-char 'N'
 * Notes value — still showing), or whenever the tab switch itself throws (e.g. the page is left in a
 * broken state by a mocked error). Never throws over a lost page.
 */
async function restoreLiveHistory(pg: LocationManagementHistoryPage): Promise<void> {
  if (pg.page.isClosed()) return;
  await phase('Stop changing the server response', () => pg.page.unroute(HISTORY_API_URL_PATTERN));

  const landedOnLiveData = await phase('Leave and re-enter the History tab to pick up live data', async () => {
    try {
      await pg.returnToBasicInformation();
      await pg.openHistoryTab(HISTORY_OFFICE.no);
      const rowCount = await pg.getHistoryRowCount();
      if (rowCount === 0) return false;
      const cells = (await pg.getCellMatrix(Math.min(rowCount, 5))).flat();
      return !cells.some(c => c.includes('mock-note') || c.includes(HISTORY_MOCK.longNotes));
    } catch {
      return false;
    }
  });
  if (landedOnLiveData) return;

  Log.warn('Tab re-entry did not land on live history data — falling back to a full reload');
  await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);
}

/** Restores English. The language is saved against the account, so a leak would translate every suite. */
async function restoreEnglish(pg: LocationManagementHistoryPage): Promise<void> {
  if (pg.page.isClosed()) return;
  await phase('Switch the app back to English (US)', async () => {
    await pg.switchAppLanguage(DEFAULT_LANGUAGE);
    await pg.waitForHistoryGridLoaded().catch(() => { /* the next beforeEach re-settles */ });
  });
}

/**
 * Local Office Name derived from the live value, so the edit is never net-zero (LR-009).
 * Every save also moves Live Date back a day in a UTC-minus browser (accepted behaviour per owner ruling 2026-09-23, BUG-LOC-LP-001 withdrawn), so these
 * scenarios deliberately assert only the name and the audit stamp, never Live Date.
 */
const probeNameFor = (original: string): string =>
  original.endsWith(SAVE_CYCLE_PROBE.suffix)
    ? original.slice(0, -SAVE_CYCLE_PROBE.suffix.length)
    : `${original}${SAVE_CYCLE_PROBE.suffix}`.slice(0, SAVE_CYCLE_PROBE.maxLength);

/** History columns that differ between two entries, ignoring the audit stamp. */
const changedDataColumns = (top: Record<string, string>, prev: Record<string, string>): string[] =>
  Object.keys(top).filter(k => !/^Modified (On|By)$/.test(k) && top[k] !== prev[k]);

/** A value different from `original`, so the edit is never net-zero (LR-009). */
async function probeFor(pg: LocationManagementHistoryPage, f: Pick<SaveCheckField, 'kind' | 'selector' | 'name'>, original: string): Promise<string | null> {
  switch (f.kind) {
    case 'checkbox': return original === 'true' ? 'false' : 'true';
    case 'radio': return original === 'Master' ? 'Direct' : 'Master';
    case 'percent': return original.startsWith('50.00') ? '0.60' : '0.50'; // a decimal fraction: 0.50 = 50%
    case 'dropdown': return (await pg.getSettingOptions(f.selector)).find(o => o !== original && !/^-+\s*select\s*-+$/i.test(o)) ?? null;
    case 'note': return `AT history check ${new Date().toISOString().slice(11, 19)}`;
    default: return original.slice(0, -1) + (original.endsWith('7') ? '8' : '7'); // change the last character
  }
}

/** How the History cell must read after saving `probe` for this field. */
function historyMatches(f: SaveCheckField, probe: string, cell: string): boolean {
  switch (f.expect) {
    case 'check-glyph': return cell === (probe === 'true' ? HISTORY_CHECK_GLYPH : '');
    case 'percent': return parseFloat(cell) === Math.round(parseFloat(probe) * 10000) / 100;
    case 'legal-prefixed': return cell.endsWith(`: ${probe}`); // rendered "US English: <name>"
    case 'note-prefixed': return cell.includes(probe); // rendered "MM/DD/YYYY - <text>"
    default: return cell === probe;
  }
}

/**
 * Changes one setting, saves, and checks the newest History entry records the new value in the
 * mapped column; then puts the setting back. The restore always runs, whatever failed first.
 */
async function saveAndCheckField(pg: LocationManagementHistoryPage, f: SaveCheckField): Promise<void> {
  await phase(`Save a change to "${f.name}" and check History records it in "${f.column}"`, async () => {
    const [before] = await pg.readNewestHistoryEntries(HISTORY_OFFICE.no);
    await pg.openSettingsTab(f.tab, HISTORY_OFFICE.no);
    const original = await pg.readSetting(f.selector, f.kind);
    const probe = await probeFor(pg, f, original);
    test.skip(probe === null, `"${f.name}" offers no second value to switch to — data precondition`);
    let saved = false;
    try {
      await pg.writeSetting(f.selector, f.kind, probe!);
      const result = await pg.saveSettings();
      saved = result.saved === true;
      await verify(`Check the change to "${f.name}" saves`, async () => {
        expect(result.saved, `"${f.name}" did not enable Save (value typed: ${probe})`).toBe(true);
        expect(result.success, result.networkError ?? '').toBe(true);
      });

      const [top, prev] = await pg.readNewestHistoryEntries(HISTORY_OFFICE.no, before['Modified On']);
      await verify(`Check the newest History entry shows the new "${f.name}" value in "${f.column}"`, async () => {
        const ageMs = Date.now() - parseTs(top['Modified On'] ?? '');
        expect(ageMs, `newest entry is ${Math.round(ageMs / 60000)} min old — no entry for this save`).toBeLessThan(RECENT_ROW_WINDOW_MS);
        expect(historyMatches(f, probe!, top[f.column] ?? ''),
          `saved "${probe}" but History "${f.column}" reads ${JSON.stringify(top[f.column])}`).toBe(true);
      });
      await attachNote(`"${f.name}": History columns that changed`, changedDataColumns(top, prev)
        .map(k => `${k}: ${JSON.stringify(prev[k])} -> ${JSON.stringify(top[k])}`).join('\n') || 'none');
    } finally {
      if (saved) {
        await pg.openSettingsTab(f.tab, HISTORY_OFFICE.no);
        if (f.kind === 'note') await pg.deleteNewestNote();
        else if ((await pg.readSetting(f.selector, f.kind)) !== original) await pg.writeSetting(f.selector, f.kind, original);
        await pg.saveSettings();
      }
    }
  });
}

/**
 * Saves Basic Information and waits for the server's answer. saveAndConfirm() can return before
 * the save request completes, and the next navigation then aborts it: on 2026-09-29 that left
 * office 1604 named "Parker Palm Springs AT" after a restore that never reached the server.
 */
async function saveBasicInfoAndWait(pg: LocationManagementHistoryPage, basic: LocationLeftPanelBasicInformationPage): Promise<boolean> {
  const response = pg.waitForSaveResponse();
  await basic.saveAndConfirm();
  const res = await response;
  return res !== null && res.ok();
}

/** Puts Local Office Name back, deciding and proving it against the server rather than the form. */
async function restoreLocalOfficeName(pg: LocationManagementHistoryPage, basic: LocationLeftPanelBasicInformationPage, original: string): Promise<void> {
  if ((await pg.getStoredLocalOfficeName(HISTORY_OFFICE.no)) === original) return;
  await basic.reloadAndNavigate(HISTORY_OFFICE.no);
  await pg.waitForSettingsLoaded();
  await basic.setLocalOfficeName(original);
  // A restore that never enables Save is already a net-zero restore.
  if (await basic.waitForSaveButtonEnabled(10_000)) await saveBasicInfoAndWait(pg, basic);
}

/**
 * Runs `body` against a History page in its OWN browser context pinned to UTC, signed in with the
 * shared saved session. playwright.config.ts sets timezoneId America/New_York for every context,
 * and in a UTC-minus zone every Location Settings save moves Live Date back a day; a separate
 * context is the only way to change the zone, because Playwright already owns the override.
 */
async function withUtcHistoryPage(browser: Browser, config: IConfig, body: (pg: LocationManagementHistoryPage) => Promise<void>): Promise<void> {
  const ctx = await browser.newContext({ storageState: STATE_PATH, timezoneId: SAVE_CHECK_TIMEZONE, viewport: { width: 1920, height: 1080 } });
  try {
    await body(new LocationManagementHistoryPage(await ctx.newPage(), config));
  } finally {
    await ctx.close();
  }
}

test.describe('Location Management History @locations @management-history', () => {
  // 90s budget: a cold navigation (SSO handoff + Angular hydrate) plus an 87-column grid's first
  // render regularly exceeds the 30s default.
  test.beforeEach(async ({ locationManagementHistoryPage: pg }) => {
    test.setTimeout(90_000);
    if (!pg.page.url().includes(`locations/${HISTORY_OFFICE.no}/settings/location`)) {
      await pg.openLocationSettings(HISTORY_OFFICE.no);
    }
    // A failed localization scenario can leave the account in another locale; restore it first.
    if ((await pg.getCurrentLanguage()) !== DEFAULT_LANGUAGE) {
      Log.warn('App language was not English at test start — restoring it');
      await pg.switchAppLanguage(DEFAULT_LANGUAGE);
    }
    if (!(await pg.isOnHistoryTab()) || (await pg.getActiveHistoryGrid()) !== 'standard') {
      await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);
    }
    await pg.waitForHistoryGridLoaded();
  });

  // ------------------------------------------------------------ 1. Navigation and access

  test('TC-LOC-MGH-001: Location Settings opens with Basic Information selected by default; History requires an explicit click', { tag: '@C105947' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate([]);
    await about('Location Settings opens on Basic Information, and History is a separate top-level tab the user has to click.');
    await phase('Open Location Settings fresh', () => pg.openLocationSettings(HISTORY_OFFICE.no));

    const tabs = await pg.getTabStripLabels();
    await verify('Check the two Location Settings tabs appear along the top, in order', async () => {
      expect(tabs).toEqual([...LOCATION_SETTINGS_TAB_ORDER]);
    });

    await verify('Check Basic Information is open by default and History is not', async () => {
      expect(await pg.isOnBasicInformationTab()).toBe(true);
      expect(await pg.isOnHistoryTab()).toBe(false);
    });

    await pg.openHistoryTab(HISTORY_OFFICE.no);
    await verify('Check clicking History opens it', async () => {
      expect(await pg.isOnHistoryTab()).toBe(true);
    });

    await verify("Check Basic Information's own sub-tabs are hidden, since History replaces the whole panel", async () => {
      expect(await pg.getVisibleBasicInfoSubTabs(BASIC_INFO_SUBTABS)).toEqual([]);
    });
  });

  test('TC-LOC-MGH-002: The History panel renders a settled grid — header row plus rows-or-empty-state, never neither', { tag: '@C105948' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The History list finishes loading into a full set of columns with entries, or a clear empty message — never a half-drawn grid.');
    const headerCount = await pg.getColumnHeaderCount();
    const rowCount = await pg.getHistoryRowCount();
    const isEmpty = await pg.isTableEmpty();

    await verify(`Check all ${COLUMN_COUNT} columns are drawn`, async () => {
      expect(headerCount).toBe(COLUMN_COUNT);
    });

    await verify('Check the list shows entries or the empty message, never neither', async () => {
      expect(rowCount > 0 || isEmpty, 'grid must show data rows or the empty state, never neither').toBe(true);
    });

    const headers = await pg.getColumnHeaders();
    await attachNote('The column headings seen on this run', headers.map((h, i) => `${i}: ${h}`).join('\n'));
    if (rowCount > 0) {
      await attachNote('The first entry in the list, in full', JSON.stringify(await pg.getRowValues(0, [...new Set(headers)]), null, 2));
    }
  });

  test('TC-LOC-MGH-003: Switching away to Basic Information and back to History keeps the grid stable', { tag: '@C105949' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Leaving History for Basic Information and coming back shows the same list again, not a second copy of it.');
    const headersBefore = await pg.getColumnHeaders();
    const rowsBefore = await pg.getStableHistoryRowCount();

    await phase('Switch to Basic Information and then back to History', async () => {
      await pg.returnToBasicInformation();
      await pg.openHistoryTab(HISTORY_OFFICE.no);
    });

    await verify('Check the same columns and the same number of entries come back, in a single list', async () => {
      expect(await pg.getColumnHeaders()).toEqual(headersBefore);
      expect(await pg.getStableHistoryRowCount()).toBe(rowsBefore);
      expect(await pg.getHistoryTableCount(), 'the panel must not render a second grid').toBe(1);
    });
  });

  test('TC-LOC-MGH-004: A hard reload does not preserve the History tab selection, but reopening it reproduces the same 87-column contract', { tag: '@C105950' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Refreshing the browser returns the user to Basic Information, and re-opening History shows the same columns as before.');
    const headerCountBefore = await pg.getColumnHeaderCount();

    await phase('Refresh the browser on the Location Settings page', () => pg.openLocationSettings(HISTORY_OFFICE.no));
    await verify('Check the refresh lands on Basic Information, not History', async () => {
      expect(await pg.isOnBasicInformationTab()).toBe(true);
      expect(await pg.isOnHistoryTab()).toBe(false);
    });

    await pg.openHistoryTab(HISTORY_OFFICE.no);
    await verify(`Check re-opening History shows the same ${COLUMN_COUNT} columns as before`, async () => {
      expect(headerCountBefore).toBe(COLUMN_COUNT);
      expect(await pg.getColumnHeaderCount()).toBe(headerCountBefore);
    });
  });

  test('TC-LOC-MGH-005: Browser back/forward after opening History shows no stale grid content', { tag: '@C105951' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Going to another page and pressing Back shows current history, never an older copy of the list.');
    test.setTimeout(150_000);
    const baselineTop = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);

    await phase('Go to the Home page, then press the browser Back button', async () => {
      await pg.page.getByRole('link', { name: 'Home', exact: true }).click();
      await pg.page.waitForURL(/\/home/, { timeout: 30_000 });
      await pg.page.goBack({ waitUntil: 'domcontentloaded' });
      await pg.page.waitForURL(new RegExp(`locations/${HISTORY_OFFICE.no}/settings/location`), { timeout: 30_000 });
      await pg.openHistoryTab(HISTORY_OFFICE.no);
    });

    const topAfter = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);
    await verify('Check the list after Back is current — the newest entry is the same or newer, never older', async () => {
      expect(parseTs(topAfter), `top entry went from ${baselineTop} to ${topAfter}`).toBeGreaterThanOrEqual(parseTs(baselineTop));
      expect(await pg.getColumnHeaderCount()).toBe(COLUMN_COUNT);
    });
  });

  test('TC-LOC-MGH-006: Switching the active location reloads History scoped to the new location, never a merge of both', { tag: '@C105952' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about("Switching to another location reloads History with only that location's changes, never a mix of the two.");
    test.setTimeout(150_000);
    await verify(`Check the list starts on office ${HISTORY_OFFICE.no}`, async () => {
      expect(await pg.getColumnByHeader(0, 'Local Office')).toBe(HISTORY_OFFICE.no);
    });

    try {
      const requests = await pg.captureHistoryRequests(() => pg.reloadAndNavigateToHistory(HISTORY_CONTRAST_OFFICE.no));
      await verify(`Check the page asked the server for office ${HISTORY_CONTRAST_OFFICE.no}'s history`, async () => {
        expect(requests.map(r => r.locationNo), JSON.stringify(requests)).toContain(HISTORY_CONTRAST_OFFICE.no);
      });

      const offices = await pg.getColumnValues('Local Office', 20);
      await verify(`Check every entry now belongs to office ${HISTORY_CONTRAST_OFFICE.no} and none to ${HISTORY_OFFICE.no}`, async () => {
        expect(offices.length).toBeGreaterThan(0);
        expect(offices.filter(o => o !== HISTORY_CONTRAST_OFFICE.no), 'rows from another office').toEqual([]);
      });
    } finally {
      await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);
    }
  });

  // ------------------------------------------------------------ 2. Read-only enforcement

  test('TC-LOC-MGH-007: The history table contains zero editable controls, scoped correctly to the table and not the panel', { tag: '@C105953' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('History is a record to read: nothing inside the list can be typed into.');
    const census = await pg.getPanelControlCensus();
    await verify('Check there is nothing to type into inside the list', async () => {
      // Scoped to the table on purpose: the paginator's page-number input is a sibling of the table
      // inside the wrapper, and counting it would make a read-only grid look editable.
      expect(census.inputCount).toBe(0);
      expect(census.textareaCount).toBe(0);
      expect(census.selectCount).toBe(0);
      expect(census.contentEditableCount).toBe(0);
    });

    await verify('Check the read-only check agrees that nothing here can be edited', async () => {
      expect(await pg.isReadOnly()).toBe(true);
    });
  });

  test('TC-LOC-MGH-008: No Add/Edit/Delete/Save action button exists anywhere in the History panel', { tag: '@C105954' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The History panel offers no way to add, change, delete or save an entry.');
    const census = await pg.getPanelControlCensus();
    await verify('Check the panel has no Add, New, Edit, Delete, Remove or Save button', async () => {
      expect(census.actionButtonCount, `unexpected action buttons: ${census.actionButtonLabels.join(', ')}`).toBe(0);
    });

    await verify('Check there is no tick-box column for picking entries', async () => {
      expect(census.checkboxCount).toBe(0);
      expect(census.radioCount).toBe(0);
      expect(census.ariaCheckboxCount).toBe(0);
    });
  });

  test('TC-LOC-MGH-009: Clicking and double-clicking a data cell produces no editor and does not select the row', { tag: '@C105955' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Clicking or double-clicking an entry opens nothing to type in and does not highlight the row.');
    test.skip((await pg.getHistoryRowCount()) === 0, 'office has no history rows to click — data precondition, not a defect');

    const probe = await pg.attemptEditCell(0, 0);
    await verify('Check clicking the cell opened nothing to type in and left its text alone', async () => {
      expect(probe.editorCount).toBe(0);
      expect(probe.textAfter).toBe(probe.textBefore);
    });

    await verify('Check the entry was not highlighted as selected', async () => {
      expect(await pg.isRowSelected(0)).toBe(false);
    });
  });

  test('TC-LOC-MGH-010: Right-clicking a history row opens no context menu', { tag: '@C105956' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Right-clicking an entry does nothing, unlike the editable grids elsewhere in Locations.');
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to right-click — data precondition, not a defect');
    const headerCountBefore = await pg.getColumnHeaderCount();

    const menuAppeared = await pg.rightClickRow(0);
    await verify('Check no right-click menu appears', async () => {
      expect(menuAppeared).toBe(false);
    });

    await verify('Check the list is undamaged after the right-click', async () => {
      expect(await pg.getColumnHeaderCount()).toBe(headerCountBefore);
      expect(await pg.getHistoryRowCount()).toBe(rowCount);
    });
  });

  // ------------------------------------------------------------ 3. Column coverage and field mapping

  test('TC-LOC-MGH-011: Exactly 87 columns render, in the confirmed live order', { tag: '@C105957' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The list shows exactly the agreed 87 columns, in the agreed order.');
    const headers = await pg.getColumnHeaders();
    await verify('Check the full set of columns matches the agreed list exactly, in order', async () => {
      // Ordered equality, so a dropped, renamed or moved column fails with a precise diff.
      expect(headers).toEqual([...HISTORY_ALL_COLUMNS_IN_ORDER]);
    });

    await verify('Check "Currency" is the only heading that appears twice, as designed', async () => {
      expect(duplicatedLabels(headers)).toEqual(['Currency x2']);
    });
  });

  test('TC-LOC-MGH-012: Identity/status representative fields resolve', { tag: '@C105958' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The list has a column for every identity and status field NM-3937 asks for.');
    const missing = unresolvedFields(await pg.getColumnHeaders(), REPRESENTATIVE_FIELDS.identity);
    await verify('Check all seven identity and status fields have a column', async () => {
      expect(missing, `identity/status fields with no column: ${missing.join(', ')}`).toEqual([]);
    });
  });

  test('TC-LOC-MGH-013: Billing representative fields resolve', { tag: '@C105959' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The list has a column for every billing field NM-3937 asks for.');
    const headers = await pg.getColumnHeaders();
    const missing = unresolvedFields(headers, REPRESENTATIVE_FIELDS.billing);
    await verify('Check all four billing fields have a column', async () => {
      expect(missing, `billing fields with no column: ${missing.join(', ')}`).toEqual([]);
    });

    await verify('Check "Billing Way Effective Date" is recorded under its live name, "Billing Way Active"', async () => {
      expect(headers).toContain(REPRESENTATIVE_FIELDS.billing['Billing Way Effective Date']);
    });
    await attachNote('Requirement name vs live column', 'Billing Way Effective Date -> "Billing Way Active"');
  });

  test('TC-LOC-MGH-014: Pricing representative fields resolve via the five composite currency-pricing columns', { tag: '@C105960' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Price-book history is recorded in five columns, each holding one value per currency.');
    const missing = unresolvedFields(await pg.getColumnHeaders(), REPRESENTATIVE_FIELDS.pricing);
    await verify('Check all five price-book columns are present', async () => {
      expect(missing, `pricing fields with no column: ${missing.join(', ')}`).toEqual([]);
    });

    test.skip((await pg.getHistoryRowCount()) === 0, 'no history rows to read — data precondition');
    for (const column of COMPOSITE_CURRENCY_COLUMNS) {
      const raw = await pg.getColumnByHeader(0, column);
      const parsed = LocationManagementHistoryPage.parseCompositeCurrencyCell(raw);
      await verify(`Check "${column}" holds one value for each of USD, CAD and MXN`, async () => {
        expect(parsed, `"${column}" is not a per-currency composite: ${JSON.stringify(raw)}`).not.toBeNull();
        expect(Object.keys(parsed!)).toEqual([...COMPOSITE_CURRENCIES]);
      });
    }
  });

  test('TC-LOC-MGH-015: Commission/charge representative fields resolve', { tag: '@C105961' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The list has a column for every commission and service-charge field NM-3937 asks for.');
    const headers = await pg.getColumnHeaders();
    const missing = unresolvedFields(headers, REPRESENTATIVE_FIELDS.commission);
    await verify('Check all seven commission and charge fields have exactly one column each', async () => {
      expect(missing, `commission/charge fields with no column: ${missing.join(', ')}`).toEqual([]);
      for (const live of Object.values(REPRESENTATIVE_FIELDS.commission)) {
        expect(headers.filter(h => h === live), `"${live}" is not a single column`).toHaveLength(1);
      }
    });
  });

  test('TC-LOC-MGH-016: Operational representative fields resolve', { tag: '@C105962' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The list has a column for every operational setting NM-3937 asks for.');
    const missing = unresolvedFields(await pg.getColumnHeaders(), REPRESENTATIVE_FIELDS.operational);
    await verify('Check all ten operational settings have a column', async () => {
      // The largest group — the likeliest place for a dropped field to hide, so the message names it.
      expect(missing, `operational fields with no column: ${missing.join(', ')}`).toEqual([]);
    });
  });

  test('TC-LOC-MGH-017: Audit representative fields resolve, each asserted individually', { tag: '@C105963' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The list records who made each change, when, and any note — each in its own column.');
    const headers = await pg.getColumnHeaders();
    // One assertion each: every sorting and audit scenario depends on these exact labels.
    for (const [field, live] of Object.entries(REPRESENTATIVE_FIELDS.audit)) {
      await verify(`Check "${field}" has its column, "${live}"`, async () => {
        expect(headers).toContain(live);
      });
    }
  });

  test('TC-LOC-MGH-018: Location/integration representative fields resolve', { tag: '@C105964' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The list has a column for every location and integration field NM-3937 asks for.');
    const missing = unresolvedFields(await pg.getColumnHeaders(), REPRESENTATIVE_FIELDS.locationIntegration);
    await verify('Check all nine location and integration fields have a column', async () => {
      expect(missing, `location/integration fields with no column: ${missing.join(', ')}`).toEqual([]);
    });
  });

  test('TC-LOC-MGH-019: The requirement-name-to-live-header mapping is attached to the report as a durable record', { tag: '@C105965' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Records, for review, which live column each NM-3937 field appears under and where the names differ.');
    const headers = await pg.getColumnHeaders();
    const rows = Object.entries(REPRESENTATIVE_FIELDS).flatMap(([group, fields]) =>
      Object.entries(fields).map(([field, live]) => ({ group, field, live, present: headers.includes(live), renamed: field !== live })));

    await verify('Check every NM-3937 representative field maps to a column that exists', async () => {
      const absent = rows.filter(r => !r.present).map(r => `${r.field} -> "${r.live}"`);
      expect(absent).toEqual([]);
    });

    await attachNote('NM-3937 field -> live column',
      rows.map(r => `${r.group.padEnd(20)} ${r.field} -> "${r.live}"${r.renamed ? '   [RENAMED]' : ''}`).join('\n'));
    await attachNote('Fields shown under a different name than the requirement',
      rows.filter(r => r.renamed).map(r => `${r.field} -> "${r.live}"`).join('\n') || 'none');
  });

  test('TC-LOC-MGH-020: Every rendered data row has exactly 87 cells', { tag: '@C105966' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Every entry has one value under each heading, so nothing has slipped into the wrong column.');
    test.skip((await pg.getHistoryRowCount()) === 0, 'office has no history rows to measure — data precondition');
    const cellCounts = await pg.getRowCellCounts(20);
    await verify(`Check every entry has exactly ${COLUMN_COUNT} values`, async () => {
      const mismatched = cellCounts.map((c, i) => ({ row: i, c })).filter(x => x.c !== COLUMN_COUNT);
      expect(mismatched, `rows whose cell count differs from ${COLUMN_COUNT}: ${JSON.stringify(mismatched)}`).toEqual([]);
    });
  });

  // ------------------------------------------------------------ 4. Data rendering

  test('TC-LOC-MGH-021: Boolean cells render as a check glyph or a blank cell, never literal text', { tag: '@C105967' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('On/off values show as a tick or an empty cell, never as the words true or false.');
    test.skip((await pg.getHistoryRowCount()) === 0, 'office has no history rows to inspect — data precondition');

    const observed = await phase('Read every on/off column across the first five entries', async () => {
      const out: string[] = [];
      for (const column of HISTORY_BOOLEAN_COLUMNS) out.push(...await pg.getColumnValues(column, 5));
      return out;
    });

    await verify('Check no on/off cell shows the words true or false', async () => {
      const leaked = observed.filter(v => (HISTORY_FORBIDDEN_BOOLEAN_TEXT as readonly string[]).includes(v));
      expect(leaked).toEqual([]);
    });

    await verify('Check every on/off cell shows either a tick or nothing at all', async () => {
      expect(observed.filter(v => v !== '' && v !== HISTORY_CHECK_GLYPH)).toEqual([]);
    });

    await verify('Check at least one tick was actually seen, so the check is meaningful', async () => {
      // Without this, a grid rendering every boolean blank would pass the two checks above vacuously.
      expect(observed).toContain(HISTORY_CHECK_GLYPH);
    });
  });

  test("TC-LOC-MGH-022: Composite currency-pricing cells render the confirmed 'USD: ...; CAD: ...; MXN: ...' pattern without corrupting row width", { tag: '@C105968' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The per-currency price-book cells read cleanly and do not push later columns out of line.');
    test.skip((await pg.getHistoryRowCount()) === 0, 'office has no history rows to inspect — data precondition');

    const cells: Record<string, string> = {};
    for (const column of COMPOSITE_CURRENCY_COLUMNS) cells[column] = await pg.getColumnByHeader(0, column);
    await verify('Check each price-book cell splits cleanly into USD, CAD and MXN', async () => {
      for (const [column, raw] of Object.entries(cells)) {
        const parsed = LocationManagementHistoryPage.parseCompositeCurrencyCell(raw);
        expect(parsed, `"${column}" = ${JSON.stringify(raw)}`).not.toBeNull();
        expect(Object.keys(parsed!), `"${column}" = ${JSON.stringify(raw)}`).toEqual([...COMPOSITE_CURRENCIES]);
      }
    });

    await verify(`Check the entry still has exactly ${COLUMN_COUNT} values`, async () => {
      expect((await pg.getRowCellCounts(1))[0]).toBe(COLUMN_COUNT);
    });
    await attachNote('The price-book cells on the newest entry', JSON.stringify(cells, null, 2));
  });

  test('TC-LOC-MGH-023: Modified On and the plain-date columns use their confirmed, distinct formats', { tag: '@C105969' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Modified On shows a date and time; Live Date, Start Date and End Date show a date only.');
    test.skip((await pg.getHistoryRowCount()) === 0, 'office has no history rows to inspect — data precondition');

    const stamps = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 3));
    await verify('Check every Modified On reads MM/DD/YYYY hh:mm:ss AM or PM and is a real moment', async () => {
      expect(stamps.filter(v => !HISTORY_MODIFIED_ON_PATTERN.test(v)), 'malformed Modified On').toEqual([]);
      // A NaN here is a silent format change that would corrupt every sort assertion downstream.
      expect(stamps.map(parseTs).every(Number.isFinite), stamps.join(' | ')).toBe(true);
    });

    for (const column of HISTORY_PLAIN_DATE_COLUMNS) {
      const dates = meaningful(await pg.getColumnValues(column, 3));
      await verify(`Check "${column}" reads MM/DD/YYYY with no time`, async () => {
        expect(dates.filter(v => !HISTORY_PLAIN_DATE_PATTERN.test(v)), `${column}: ${dates.join(' | ')}`).toEqual([]);
      });
    }
  });

  test('TC-LOC-MGH-024: Null/blank optional values render as empty cells, never a placeholder string', { tag: '@C105970' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Where a value was never filled in, the cell is simply empty — no placeholder text and no shifted columns.');
    test.skip((await pg.getHistoryRowCount()) === 0, 'office has no history rows to inspect — data precondition');
    const matrix = await pg.getCellMatrix(10);

    await verify('Check no cell shows placeholder text such as null, undefined or [object Object]', async () => {
      // [object Object] matters here: several source fields are nested objects a naive renderer
      // would stringify directly.
      const leaked = matrix.flat().filter(cell => HISTORY_FORBIDDEN_CELL_TEXT.some(bad => cell.includes(bad)));
      expect(leaked).toEqual([]);
    });

    await verify('Check a missing value leaves an empty cell rather than removing it', async () => {
      expect(matrix.map(row => row.length).filter(n => n !== COLUMN_COUNT)).toEqual([]);
    });
  });

  test('TC-LOC-MGH-025: Modified By is a real user identifier, never a bare GUID', { tag: '@C105971' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Every change names the person who made it, never a long internal code and never nobody.');
    test.skip((await pg.getHistoryRowCount()) === 0, 'office has no history rows to inspect — data precondition');
    const users = await pg.getColumnValues(HISTORY_AUDIT_USER_COLUMN, 5);
    const stamps = await pg.getColumnValues(HISTORY_SORT_COLUMN, 5);

    await verify('Check Modified By is never a raw GUID', async () => {
      expect(users.filter(u => UUID_PATTERN.test(u))).toEqual([]);
    });

    await verify('Check every recorded change has an author', async () => {
      const unauthored = stamps.map((s, i) => ({ s, u: users[i] ?? '' })).filter(x => x.s !== '' && x.u === '');
      expect(unauthored, JSON.stringify(unauthored)).toEqual([]);
    });
  });

  // ------------------------------------------------------------ 5. Sorting

  test('TC-LOC-MGH-026: Sortable columns are exactly the confirmed 14-column set, each with a working, accessibly-named sort control', { tag: '@C105972' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Exactly the fourteen agreed columns can be sorted, and each sort control has a name a screen reader can announce.');
    const sortable = await pg.getSortableColumns();
    await verify('Check the sortable columns are exactly the agreed fourteen', async () => {
      // An exact set, not a count: a column silently losing its sort control fails by name.
      expect(sortable).toEqual([...SORTABLE_COLUMNS]);
    });

    const names = await pg.getSortControlNames();
    await verify('Check every sort control is named', async () => {
      expect(names).toHaveLength(SORTABLE_COLUMNS.length);
      expect(names.filter(n => n === ''), `${names.filter(n => n === '').length} unnamed sort control(s)`).toEqual([]);
    });
  });

  test('TC-LOC-MGH-027: A fresh load sorts Modified On descending by default', { tag: '@C105973' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('History opens sorted by Modified On, newest change first, with no other column sorted.');
    await phase('Re-open the tab so the sort is back to how it starts', () => pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no));
    const headers = await pg.getColumnHeaders();

    await verify('Check only Modified On shows a sort arrow, and it points down', async () => {
      expect(await pg.getSortIndicator(HISTORY_DEFAULT_SORT.column)).toBe(HISTORY_DEFAULT_SORT.direction);
      expect(await pg.getSortedColumnIndexes()).toEqual([headers.indexOf(HISTORY_DEFAULT_SORT.column)]);
    });

    const stamps = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20)).map(parseTs);
    await verify('Check the entries really are newest first', async () => {
      expect(isNonAscending(stamps)).toBe(true);
    });
  });

  test('TC-LOC-MGH-028: Sorting Modified On ascending then descending reverses row order; only one column is ever sorted at a time', { tag: '@C105974' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Sorting by Modified On shows the oldest change first going up and the newest first going down, and only that column shows an arrow.');
    test.setTimeout(120_000);
    const modifiedOnIndex = (await pg.getColumnHeaders()).indexOf(HISTORY_SORT_COLUMN);

    try {
      await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'ascending');
      const ascRaw = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20));
      const asc = ascRaw.map(parseTs);
      await verify('Check sorting up puts the oldest change first and every date is readable', async () => {
        expect(asc.every(Number.isFinite), ascRaw.join(' | ')).toBe(true);
        expect(isNonDescending(asc), ascRaw.join(' | ')).toBe(true);
        expect(asc[0]).toBe(Math.min(...asc));
      });
      await verify('Check Modified On shows an up arrow and no other column shows one', async () => {
        expect(await pg.getSortIndicator(HISTORY_SORT_COLUMN)).toBe('ascending');
        expect(await pg.getSortedColumnIndexes()).toEqual([modifiedOnIndex]);
      });

      await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending');
      const descRaw = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20));
      const desc = descRaw.map(parseTs);
      await verify('Check sorting down puts the newest change first, a different entry from before', async () => {
        expect(isNonAscending(desc), descRaw.join(' | ')).toBe(true);
        expect(desc[0]).toBe(Math.max(...desc));
        expect(descRaw[0]).not.toBe(ascRaw[0]);
      });
      await verify('Check Modified On shows a down arrow again', async () => {
        expect(await pg.getSortIndicator(HISTORY_SORT_COLUMN)).toBe('descending');
        expect(await pg.getSortedColumnIndexes()).toEqual([modifiedOnIndex]);
      });
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  test('TC-LOC-MGH-029: Sorting Live Date ascending then descending reverses order and the sort indicator moves off Modified On', { tag: '@C105975' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Sorting by Live Date moves the sort arrow there and orders the entries by date in both directions.');
    test.setTimeout(120_000);
    try {
      await pg.sortColumnAndSettle(HISTORY_DATE_SORT_COLUMN, 'ascending');
      const asc = meaningful(await pg.getColumnValues(HISTORY_DATE_SORT_COLUMN, 20));
      await verify('Check Live Date shows an up arrow and Modified On has lost its arrow', async () => {
        expect(await pg.getSortIndicator(HISTORY_DATE_SORT_COLUMN)).toBe('ascending');
        expect(await pg.getSortIndicator(HISTORY_SORT_COLUMN)).toBe('none');
        expect(await pg.getSortedColumnIndexes()).toHaveLength(1);
      });
      await verify('Check the live dates run earliest first', async () => {
        expect(isNonDescending(asc.map(parseDate)), asc.join(' | ')).toBe(true);
      });

      await pg.sortColumnAndSettle(HISTORY_DATE_SORT_COLUMN, 'descending');
      const desc = meaningful(await pg.getColumnValues(HISTORY_DATE_SORT_COLUMN, 20));
      await verify('Check Live Date flips to a down arrow and the dates run latest first', async () => {
        expect(await pg.getSortIndicator(HISTORY_DATE_SORT_COLUMN)).toBe('descending');
        expect(isNonAscending(desc.map(parseDate)), desc.join(' | ')).toBe(true);
      });
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  test('TC-LOC-MGH-030: Sorting a sortable boolean-like column groups its states, never interleaves them', { tag: '@C105976' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Sorting a tick-box column keeps the ticked entries together and the unticked ones together.');
    test.setTimeout(300_000);
    // Page 1 of history is near-uniform by nature, so the partition is proven by the two directions
    // leading with OPPOSITE states. A column that never varies across all history proves nothing, so
    // the candidates are tried in turn until one does — every one tried must still group cleanly.
    let proven: string | null = null;
    try {
      for (const column of HISTORY_BOOLEAN_SORT_COLUMNS) {
        await pg.sortColumnAndSettle(column, 'ascending');
        const asc = await pg.getColumnValues(column, 20);
        await pg.sortColumnAndSettle(column, 'descending');
        const desc = await pg.getColumnValues(column, 20);
        await verify(`Check sorting "${column}" either way keeps ticked and unticked entries in two blocks`, async () => {
          expect(asc.every(v => v === '' || v === HISTORY_CHECK_GLYPH), asc.join(' | ')).toBe(true);
          expect(isGrouped(asc), asc.map(v => v || '_').join('')).toBe(true);
          expect(isGrouped(desc), desc.map(v => v || '_').join('')).toBe(true);
        });
        if (asc[0] !== desc[0]) {
          await verify(`Check the two sort directions put opposite values first on "${column}"`, async () => {
            expect([asc[0], desc[0]].sort()).toEqual(['', HISTORY_CHECK_GLYPH].sort());
          });
          proven = column;
          break;
        }
        await attachNote(`"${column}" holds one value across all history`, `both directions lead with ${JSON.stringify(asc[0])}`);
      }
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
    test.skip(proven === null, 'every sortable tick-box column holds one value across all history — nothing to order');
  });

  test("TC-LOC-MGH-031: Server-side sort is confirmed via the request payload's sortBy/sortDescending fields", { tag: '@C105977' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Sorting asks the server for a newly ordered list, naming the column and direction, rather than re-ordering only the entries already on screen.');
    test.setTimeout(120_000);
    try {
      const liveDate = await pg.captureHistoryRequests(() => pg.sortColumnAndSettle(HISTORY_DATE_SORT_COLUMN, 'ascending'));
      await verify('Check sorting Live Date up asked the server for sortBy "LiveDate", ascending', async () => {
        expect(liveDate, JSON.stringify(liveDate)).toContainEqual(expect.objectContaining({
          sortBy: HISTORY_SORT_KEYS[HISTORY_DATE_SORT_COLUMN], sortDescending: false,
        }));
      });

      const modifiedOn = await pg.captureHistoryRequests(() => pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending'));
      await verify('Check sorting Modified On down asked the server for sortBy "ModDate", descending', async () => {
        expect(modifiedOn, JSON.stringify(modifiedOn)).toContainEqual(expect.objectContaining({
          sortBy: HISTORY_SORT_KEYS[HISTORY_SORT_COLUMN], sortDescending: true,
        }));
      });

      const stamps = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20)).map(parseTs);
      await verify('Check the list on screen is in the order the server was asked for', async () => {
        expect(isNonAscending(stamps)).toBe(true);
      });

      await attachNote('What the page asked the server for while sorting',
        JSON.stringify({ [HISTORY_DATE_SORT_COLUMN]: liveDate, [HISTORY_SORT_COLUMN]: modifiedOn }, null, 2));
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  test("TC-LOC-MGH-032: Rapid repeated toggling of one column's sort direction produces no duplicate or dropped rows", { tag: '@C105978' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Flipping a sort back and forth quickly ends on a clean, correctly ordered list with no repeated or missing entries.');
    test.setTimeout(180_000);
    try {
      await phase('Flip Modified On up, down, up, down in quick succession', async () => {
        for (const direction of ['ascending', 'descending', 'ascending', 'descending'] as const) {
          await pg.clickSortColumn(HISTORY_SORT_COLUMN, direction);
        }
        await pg.waitForHistoryGridLoaded();
      });

      await expect.poll(() => pg.getSortIndicator(HISTORY_SORT_COLUMN), { timeout: 15_000 }).toBe('descending');
      const matrix = await pg.getCellMatrix(50);
      await verify('Check the list ends on a full page with no entry repeated', async () => {
        expect(matrix).toHaveLength(parseInt(DEFAULT_ROWS_PER_PAGE, 10));
        const fingerprints = matrix.map(row => JSON.stringify(row));
        expect(new Set(fingerprints).size, 'a row was rendered twice').toBe(fingerprints.length);
      });

      const stamps = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20)).map(parseTs);
      await verify('Check the final order is newest first, as the last click asked', async () => {
        expect(isNonAscending(stamps)).toBe(true);
      });
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  test('TC-LOC-MGH-033: Sorting, then paging to next, preserves the sort order across the page boundary', { tag: '@C105979' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Moving to the next page continues the same newest-first order instead of starting it again.');
    test.setTimeout(120_000);
    test.skip((await pg.getPageIndicator()).total < 2, 'office has a single page of history — no page boundary');
    try {
      await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending');
      const page1 = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20)).map(parseTs);
      await pg.clickPaginationButton('next');
      const page2 = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20)).map(parseTs);

      await verify('Check page 2 carries on from where page 1 ended', async () => {
        expect((await pg.getPageIndicator()).current).toBe(2);
        expect(page2[0]!).toBeLessThanOrEqual(page1[page1.length - 1]!);
        expect(isNonAscending(page2)).toBe(true);
      });

      await verify('Check the sort arrow survived the page change', async () => {
        expect(await pg.getSortIndicator(HISTORY_SORT_COLUMN)).toBe('descending');
      });
    } finally {
      await pg.goToFirstPageIfNeeded();
    }
  });

  test('TC-LOC-MGH-034: Sorting, then changing rows-per-page, preserves the sort order', { tag: '@C105980' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Showing more entries per page keeps the list sorted the same way, with the same newest entry on top.');
    test.setTimeout(120_000);
    try {
      await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending');
      const topBefore = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);
      await pg.setRowsPerPage('50');
      const stamps = meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 50));

      await verify('Check up to 50 entries now show, still newest first, with the same entry on top', async () => {
        expect(await pg.getHistoryRowCount()).toBeLessThanOrEqual(50);
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(parseInt(DEFAULT_ROWS_PER_PAGE, 10));
        expect(parseTs(stamps[0]!)).toBeGreaterThanOrEqual(parseTs(topBefore));
        expect(isNonAscending(stamps.map(parseTs))).toBe(true);
      });
    } finally {
      await pg.setRowsPerPage(DEFAULT_ROWS_PER_PAGE);
      await pg.goToFirstPageIfNeeded();
    }
  });

  test('TC-LOC-MGH-035: aria-sort is never set on any header, in any state — a documented accessibility discrepancy', { tag: '@C105981' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Records that the sort direction is shown only as an arrow and is never announced to screen readers.');
    test.setTimeout(120_000);
    const states: Record<string, Array<string | null>> = {};
    try {
      states['fresh load'] = await pg.getAriaSortValues();
      await pg.sortColumnAndSettle(HISTORY_DATE_SORT_COLUMN, 'ascending');
      states['Live Date ascending'] = await pg.getAriaSortValues();
      await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending');
      states['Modified On descending'] = await pg.getAriaSortValues();
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }

    await verify('Check no heading carries aria-sort in any of the three states (current behaviour, pinned)', async () => {
      // DOCUMENTED DISCREPANCY, pinned on purpose: the moment the grid starts announcing sort state
      // this goes red, and the expectation is updated to the new contract rather than deleted.
      for (const [state, values] of Object.entries(states)) {
        expect(values.filter(v => v !== null), `aria-sort set during "${state}"`).toEqual([]);
      }
    });

    await attachNote('Accessibility gap: sort direction is not announced to screen readers',
      'aria-sort is null on all 87 headers before sorting, after Live Date ascending and after Modified On '
      + 'descending. Sort state reaches sighted users only, through the lucide arrow icon.');
  });

  // ------------------------------------------------------------ 6. Pagination and boundaries

  test('TC-LOC-MGH-036: Default pagination contract — 20 rows/page, correct boundary button states on page 1', { tag: '@C105982' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('History opens on page 1 with 20 entries, and only the forward page buttons can be used.');
    await verify('Check 20 entries show and the page-size chooser says 20', async () => {
      expect(await pg.getHistoryRowCount()).toBe(parseInt(DEFAULT_ROWS_PER_PAGE, 10));
      expect(await pg.getRowsPerPageValue()).toBe(DEFAULT_ROWS_PER_PAGE);
    });

    await verify('Check First and Previous are greyed out and Next and Last are not', async () => {
      expect(await pg.isPaginationButtonDisabled('first')).toBe(true);
      expect(await pg.isPaginationButtonDisabled('previous')).toBe(true);
      expect(await pg.isPaginationButtonDisabled('next')).toBe(false);
      expect(await pg.isPaginationButtonDisabled('last')).toBe(false);
    });
  });

  test('TC-LOC-MGH-037: Rows-per-page options are exactly 10/20/30/40/50 and changing the value changes the rendered row count', { tag: '@C105983' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The entries-per-page chooser offers 10 through 50, and picking 10 really shows 10 entries across more pages.');
    test.setTimeout(120_000);
    const options = await pg.getRowsPerPageOptions();
    await verify('Check the chooser offers exactly 10, 20, 30, 40 and 50', async () => {
      expect(options).toEqual([...ROWS_PER_PAGE_OPTIONS]);
    });

    const pagesBefore = (await pg.getPageIndicator()).total;
    try {
      await pg.setRowsPerPage(ROWS_PER_PAGE_OPTIONS[0]);
      await verify('Check choosing 10 shows exactly 10 entries, the same columns, and more pages', async () => {
        expect(await pg.getHistoryRowCount()).toBe(10);
        expect(await pg.getColumnHeaders()).toEqual([...HISTORY_ALL_COLUMNS_IN_ORDER]);
        expect((await pg.getPageIndicator()).total).toBeGreaterThan(pagesBefore);
      });
    } finally {
      await pg.setRowsPerPage(DEFAULT_ROWS_PER_PAGE);
      await pg.goToFirstPageIfNeeded();
    }
  });

  test('TC-LOC-MGH-038: Paging next then previous returns to the original page-1 content', { tag: '@C105984' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Going forward a page and back again returns to page 1 with its original entries.');
    test.setTimeout(120_000);
    test.skip((await pg.getPageIndicator()).total < 2, 'office has a single page of history');
    const page1Top = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);
    try {
      await pg.clickPaginationButton('next');
      const page2Top = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);
      await verify('Check page 2 starts with a different entry', async () => {
        expect(page2Top).not.toBe(page1Top);
      });

      await pg.clickPaginationButton('previous');
      await verify('Check going back returns page 1, still holding its original first entry', async () => {
        expect((await pg.getPageIndicator()).current).toBe(1);
        // Office 1604 is shared: a save by another run adds a newer entry and pushes the original
        // first entry down a row. Being back on page 1 means that entry is still on it.
        const page1 = await pg.getColumnValues(HISTORY_SORT_COLUMN, 20);
        expect(page1, `the original first entry ${page1Top} is no longer on page 1`).toContain(page1Top);
        expect(parseTs(page1[0]!)).toBeGreaterThanOrEqual(parseTs(page1Top));
      });
    } finally {
      await pg.goToFirstPageIfNeeded();
    }
  });

  test('TC-LOC-MGH-039: The last page renders its true partial row count without breaking the row-cell contract', { tag: '@C105985' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The last page shows exactly the leftover entries — not zero, not a full page padded out — each with every column.');
    test.setTimeout(120_000);
    const { total } = await pg.getPageIndicator();
    test.skip(total < 2, 'office has a single page of history');
    try {
      const response = pg.page.waitForResponse(r => HISTORY_API_URL_PATTERN.test(r.url()), { timeout: 30_000 });
      await pg.clickPaginationButton('last');
      const body = await (await response).json() as HistoryEnvelope;
      const totalCount = body.data?.totalCount ?? 0;
      const pageSize = parseInt(DEFAULT_ROWS_PER_PAGE, 10);
      const expectedRows = totalCount - (Math.ceil(totalCount / pageSize) - 1) * pageSize;

      await verify(`Check the last page shows the ${expectedRows} leftover entries the server's total implies`, async () => {
        expect((await pg.getPageIndicator()).current).toBe(Math.ceil(totalCount / pageSize));
        expect(expectedRows).toBeGreaterThan(0);
        expect(await pg.getHistoryRowCount()).toBe(expectedRows);
      });

      await verify(`Check every entry on the last page still has all ${COLUMN_COUNT} values`, async () => {
        expect((await pg.getRowCellCounts(pageSize)).filter(n => n !== COLUMN_COUNT)).toEqual([]);
      });
      await attachNote('Last-page arithmetic', `totalCount=${totalCount} pageSize=${pageSize} lastPageRows=${expectedRows}`);
    } finally {
      await pg.goToFirstPageIfNeeded();
    }
  });

  test("TC-LOC-MGH-040: The page-number input's native constraints match the confirmed live contract", { tag: '@C105986' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The page-number box limits typing to digits by pattern only; every range rule is the app’s own logic.');
    const attrs = await pg.getPageInputAttributes();
    await verify('Check the box is a digits-only text box with no native range limits', async () => {
      expect(attrs.typeAttr).toBeNull();
      expect(attrs.inputMode).toBe('numeric');
      expect(attrs.pattern).toBe('[0-9]*');
      expect(attrs.min).toBeNull();
      expect(attrs.max).toBeNull();
      expect(attrs.maxLength).toBeNull();
      expect(attrs.required).toBe(false);
      expect(attrs.ariaInvalid).toBe('false');
    });
  });

  test('TC-LOC-MGH-041: The page-number input rejects 0, -1, and abc by reverting to the currently-shown page', { tag: '@C105987' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Typing zero, a minus number or letters into the page box leaves the user on the page they were already on.');
    test.setTimeout(150_000);
    try {
      for (const probe of HISTORY_PAGE_INPUT_REJECTED) {
        // Checked against the page ALREADY shown, never a hardcoded page 1, so the case is order-independent.
        const before = (await pg.getPageIndicator()).current;
        const settled = await pg.setPageNumber(probe.typed);
        await verify(`Check typing ${JSON.stringify(probe.typed)} is refused and the user stays on page ${before} (${probe.note})`, async () => {
          expect(settled).toBe(String(before));
          expect((await pg.getPageIndicator()).current).toBe(before);
          expect(await pg.getHistoryRowCount()).toBe(parseInt(DEFAULT_ROWS_PER_PAGE, 10));
        });
      }
    } finally {
      await pg.goToFirstPageIfNeeded();
    }
  });

  test('TC-LOC-MGH-042: A decimal page number has its separator stripped and navigates to the concatenated page', { tag: '@C105988' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Typing a decimal page number drops the dot and goes to the page the remaining digits spell — the accepted behaviour.');
    test.setTimeout(120_000);
    const expectedPage = parseInt(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.observed, 10);
    test.skip((await pg.getPageIndicator()).total < expectedPage, `office has fewer than ${expectedPage} pages`);
    try {
      const settled = await pg.setPageNumber(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.typed);
      await verify(`Check typing "${HISTORY_PAGE_INPUT_DECIMAL_DEFECT.typed}" lands on page ${expectedPage}, the accepted behaviour`, async () => {
        // ACCEPTED BEHAVIOUR (owner ruling 2026-09-23): pattern="[0-9]*" strips the "." and the digits
        // are concatenated. Pinned, so any change to the paginator's handling shows up here.
        expect(settled).toBe(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.observed);
        expect((await pg.getPageIndicator()).current).toBe(expectedPage);
      });

      await verify('Check the wrong page is at least a real, complete page of history', async () => {
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        expect(await pg.getColumnHeaders()).toEqual([...HISTORY_ALL_COLUMNS_IN_ORDER]);
      });

      await attachNote('Accepted behaviour: a decimal page number loses its dot',
        `typed "${HISTORY_PAGE_INPUT_DECIMAL_DEFECT.typed}" -> settled on page "${settled}". Same shared paginator `
        + 'as Local Office History (TC-LOE-HIST-039), so one root cause surfacing in two modules.');
    } finally {
      await pg.goToFirstPageIfNeeded();
    }
  });

  test('TC-LOC-MGH-043: The page-number input normalizes leading zeros and accepts a valid page number', { tag: '@C105989' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Typing a valid page number jumps straight to it, and leading zeros are ignored.');
    test.setTimeout(120_000);
    test.skip((await pg.getPageIndicator()).total < 7, 'office has fewer than 7 pages');
    try {
      for (const probe of HISTORY_PAGE_INPUT_ACCEPTED) {
        const settled = await pg.setPageNumber(probe.typed);
        await verify(`Check typing ${JSON.stringify(probe.typed)} moves to page ${probe.expected} (${probe.note})`, async () => {
          expect(settled).toBe(probe.expected);
          expect((await pg.getPageIndicator()).current).toBe(parseInt(probe.expected, 10));
          expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        });
      }
    } finally {
      await pg.goToFirstPageIfNeeded();
    }
  });

  test('TC-LOC-MGH-044: A page number one past the last page reverts to the last page, not to page 1', { tag: '@C105990' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Typing a page number beyond the end keeps the user on the last page instead of showing an empty page.');
    test.setTimeout(120_000);
    const { total } = await pg.getPageIndicator();
    test.skip(total < 2, 'office has a single page of history');
    try {
      await pg.clickPaginationButton('last');
      const past = await pg.setPageNumber(String(total + 1));
      await verify(`Check page ${total + 1}, one past the end, leaves the user on page ${total}`, async () => {
        // Reverts to the CURRENT page — which here is the last page, not page 1.
        expect(past).toBe(String(total));
        expect((await pg.getPageIndicator()).current).toBe(total);
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        expect(await pg.isPaginationButtonDisabled('next')).toBe(true);
      });
    } finally {
      await pg.goToFirstPageIfNeeded();
    }
  });

  // ------------------------------------------------------------ 7. Empty, loading and error states (mocked)

  test('TC-LOC-MGH-045: A mocked empty history response shows the friendly empty state', { tag: '@C105991' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('When a location has no recorded changes, a clear "No results." message shows instead of a blank box.');
    test.setTimeout(120_000);
    try {
      await phase('Have the server return no changes at all', () => mockHistoryResponse(pg, withRecords(() => [])));
      await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);

      await verify('Check the list is empty and the no-history message is shown', async () => {
        expect(await pg.getHistoryRowCount()).toBe(0);
        expect(await pg.isTableEmpty()).toBe(true);
      });

      await verify('Check the headings stay visible and no new buttons or boxes appear', async () => {
        expect(await pg.getColumnHeaderCount()).toBe(COLUMN_COUNT);
        const census = await pg.getPanelControlCensus();
        expect(census.actionButtonCount, census.actionButtonLabels.join(', ')).toBe(0);
        expect(census.inputCount).toBe(0);
      });
      await attachNote('Empty-state copy', HISTORY_EMPTY_STATE_TEXT);
    } finally {
      await restoreLiveHistory(pg);
    }

    await verify('Check live entries return once the server answers normally again', async () => {
      expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
    });
  });

  test('TC-LOC-MGH-046: A pending history request shows a loading affordance and never the empty-state text before it resolves', { tag: '@C105992' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('While the list is still being fetched, the user sees it loading — never a premature "No results."');
    test.setTimeout(120_000);
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    try {
      await phase('Hold the server response back so the list stays loading', () =>
        pg.page.route(HISTORY_API_URL_PATTERN, async (route) => { await gate; await route.continue(); }));

      await phase('Open the History tab while the response is still held', async () => {
        await pg.openLocationSettings(HISTORY_OFFICE.no);
        await pg.page.locator('[data-testid="location-settings-tab-management-history"]').click();
        await pg.page.locator('[data-testid="location-settings-tab-content-management-history"]').waitFor({ state: 'visible', timeout: 30_000 });
      });

      const pending = await pg.getPendingState();
      await verify('Check a loading state shows and the panel does not claim there is no history', async () => {
        expect(pending.spinnerCount > 0 || pending.skeletonCount > 0 || pending.dataRowCount === 0,
          'no spinner, skeleton or row-less grid while the request was in flight').toBe(true);
        // The half that matters: "No results." mid-fetch tells the user something false.
        expect(pending.emptyStateShown, 'the empty state was shown while the request was pending').toBe(false);
      });
      await attachNote('What the panel showed while loading', JSON.stringify(pending));

      await phase('Let the server response through and wait for the list', async () => {
        release();
        await pg.waitForHistoryGridLoaded(30_000);
      });
      await verify('Check the entries appear once the response arrives', async () => {
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
      });
    } finally {
      release();
      await restoreLiveHistory(pg);
    }
  });

  test('TC-LOC-MGH-047: A mocked HTTP 500 on the history endpoint does not crash the tab; Basic Information remains reachable', { tag: '@C105993' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('If the server fails to return history, the tab still opens and the rest of Location Settings keeps working.');
    test.setTimeout(150_000);
    const pageErrors: string[] = [];
    const onError = (err: Error) => pageErrors.push(err.message);
    try {
      await phase('Make the server return an error for the history request', async () => {
        pg.page.on('pageerror', onError);
        await pg.page.route(HISTORY_API_URL_PATTERN, route =>
          route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error"}' }));
      });

      await phase('Open the History tab while the server is failing', async () => {
        await pg.openLocationSettings(HISTORY_OFFICE.no);
        await pg.page.locator('[data-testid="location-settings-tab-management-history"]').click();
        await pg.page.locator('[data-testid="location-settings-tab-content-management-history"]').waitFor({ state: 'visible', timeout: 30_000 });
        await pg.page.waitForTimeout(3_000); // give a failed fetch time to (mis)render
      });

      await verify('Check the tab still opens and shows no broken entries', async () => {
        expect(await pg.isOnHistoryTab()).toBe(true);
        const rows = (await pg.getActiveHistoryGrid()) === 'standard' ? await pg.getHistoryRowCount() : 0;
        expect(rows, 'a failed fetch rendered rows').toBe(0);
      });

      await verify('Check no uncaught page error was thrown', async () => {
        expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
      });

      await phase('Move to the Basic Information tab', () => pg.returnToBasicInformation());
      await verify('Check the failure did not lock the user out of Basic Information', async () => {
        expect(await pg.isOnBasicInformationTab()).toBe(true);
      });

      await phase('Let the server answer normally and reopen History, without a reload', async () => {
        await pg.page.unroute(HISTORY_API_URL_PATTERN);
        await pg.openHistoryTab(HISTORY_OFFICE.no);
      });
      await verify('Check the list recovers on its own, with no need to refresh the browser', async () => {
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
      });
    } finally {
      pg.page.off('pageerror', onError);
      await restoreLiveHistory(pg);
    }
  });

  test('TC-LOC-MGH-048: A mocked malformed/partial payload renders without crashing and without leaking placeholders', { tag: '@C105994' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('If the server returns an incomplete record, the list still renders and the missing values show as empty cells.');
    test.setTimeout(150_000);
    try {
      await phase('Have the server return a change with many of its values missing', () => mockHistoryResponse(pg, withPartialFields));
      await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);

      await verify('Check the list still shows all its headings and its entries', async () => {
        expect(await pg.getColumnHeaderCount()).toBe(COLUMN_COUNT);
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
      });

      const matrix = await pg.getCellMatrix(3);
      await verify('Check the missing values leave empty cells rather than shifting the row', async () => {
        expect(matrix.map(row => row.length).filter(n => n !== COLUMN_COUNT)).toEqual([]);
      });
      await verify('Check no cell shows placeholder text in place of the missing values', async () => {
        expect(matrix.flat().filter(cell => HISTORY_FORBIDDEN_CELL_TEXT.some(bad => cell.includes(bad)))).toEqual([]);
      });

      await pg.clickSortColumn(HISTORY_SORT_COLUMN, 'descending');
      await verify('Check the list still responds to a sort after receiving incomplete data', async () => {
        expect(await pg.getColumnHeaderCount()).toBe(COLUMN_COUNT);
      });
    } finally {
      await restoreLiveHistory(pg);
    }
  });

  test('TC-LOC-MGH-049: A mocked 2,000+ character Notes value scrolls inside the grid without page-level horizontal scroll', { tag: '@C105995' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('A very long note scrolls inside the list instead of stretching the whole page sideways.');
    test.setTimeout(120_000);
    try {
      await phase('Have the server return a 2,000-character Notes value', () => mockHistoryResponse(pg, withNotes(HISTORY_MOCK.longNotes)));
      await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);

      await verify('Check the long note actually reached the list', async () => {
        expect((await pg.getColumnByHeader(0, 'Notes')).length).toBeGreaterThanOrEqual(HISTORY_MOCK.longNotes.length);
      });

      const overflow = await pg.getOverflow();
      await verify('Check only the list scrolls sideways, never the whole page', async () => {
        // 1px allowance for sub-pixel rounding on fractional device pixel ratios.
        expect(overflow.pageOverflowPx).toBeLessThanOrEqual(1);
        expect(overflow.containerScrollsHorizontally).toBe(true);
      });
    } finally {
      await restoreLiveHistory(pg);
    }
  });

  test('TC-LOC-MGH-050: A mocked Notes value containing HTML-like/special characters renders as inert text', { tag: '@C105996' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('A note containing markup or a script is shown as plain text and never runs.');
    test.setTimeout(120_000);
    const dialogs: string[] = [];
    const onDialog = async (d: import('@playwright/test').Dialog) => {
      if (d.type() === 'alert') { dialogs.push(d.message()); await d.dismiss().catch(() => {}); }
    };
    try {
      await phase('Have the server return a note full of markup and special characters', async () => {
        pg.page.on('dialog', onDialog);
        await mockHistoryResponse(pg, withNotes(HISTORY_MOCK.specialNotes));
      });
      await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);

      await verify('Check the note is shown exactly as typed, as text', async () => {
        expect(await pg.getColumnByHeader(0, 'Notes')).toContain(HISTORY_MOCK.specialNotes);
      });

      await verify('Check nothing in the note ran: no alert and no injected script or bold text', async () => {
        expect(dialogs).toEqual([]);
        const firstRow = pg.page.locator('[data-testid="location-settings-table-management-history"] tbody tr').first();
        expect(await firstRow.locator('script, b').count()).toBe(0);
      });
    } finally {
      pg.page.off('dialog', onDialog);
      await restoreLiveHistory(pg);
    }
  });

  // ------------------------------------------------------------ 8. Localization

  test('TC-LOC-MGH-051: English (US) is the default UI language; the tab label and headers read in English', { tag: '@C105997' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('With no language chosen, the History tab and its column headings read in English.');
    const expected = HISTORY_TRANSLATIONS['en-US'];
    await verify('Check the app is in English (US)', async () => {
      expect(await pg.getCurrentLanguage()).toBe(DEFAULT_LANGUAGE);
    });

    const headers = await pg.getColumnHeaders();
    await verify('Check the tab label and the first headings read in English', async () => {
      expect(await pg.getHistoryTabLabel()).toBe(expected.tab);
      for (const [index, label] of Object.entries(expected.headers)) expect(headers[Number(index)]).toBe(label);
    });
  });

  for (const [tcId, code, caseTag] of [['TC-LOC-MGH-052', 'fr-CA', '@C105998'], ['TC-LOC-MGH-053', 'es-MX', '@C105999']] as const) {
    const language = LANGUAGE_OPTIONS.find(l => l.code === code)!;
    const title = code === 'fr-CA'
      ? `${tcId}: Switching the account language to French (Canada) translates the tab label and every column header`
      : `${tcId}: Switching the account language to Spanish (Mexico) translates the tab label and headers`;

    test(title, { tag: caseTag }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
      dependencyGate(['TC-LOC-MGH-001']);
      await about(`Choosing ${language.label} from the account menu translates the History tab and its column headings.`);
      test.setTimeout(150_000);
      const english = await pg.getColumnHeaders();
      const expected = HISTORY_TRANSLATIONS[code as AppLanguage];
      try {
        await phase(`Choose ${language.label} from the account menu`, async () => {
          await pg.switchAppLanguage(code);
          await pg.waitForHistoryGridLoaded();
        });

        await verify(`Check the app now reports ${code}`, async () => {
          expect(await pg.getCurrentLanguage()).toBe(code);
        });

        const headers = await pg.getColumnHeaders();
        await verify(`Check the first headings read in ${language.label}`, async () => {
          for (const [index, label] of Object.entries(expected.headers)) expect(headers[Number(index)]).toBe(label);
          if (expected.tab) expect(await pg.getHistoryTabLabel()).toBe(expected.tab);
          else expect(await pg.getHistoryTabLabel()).not.toBe(HISTORY_TRANSLATIONS['en-US'].tab);
        });

        await verify('Check the column count is unchanged by the translation', async () => {
          expect(headers).toHaveLength(COLUMN_COUNT);
        });

        const untranslated = headers.filter((h, i) => h === english[i] && /[a-z]{3,}/i.test(h));
        await attachNote(`Headings in ${code}`, headers.map((h, i) => `${i}: ${english[i]} -> ${h}`).join('\n'));
        await attachNote(`Headings that stayed identical to English in ${code}`, untranslated.join('\n') || 'none');
        if (code === 'es-MX') {
          // Translation-quality discrepancy, recorded rather than asserted as a literal string.
          await attachNote('Discrepancy: the es-MX label for "Live Date"',
            `"${headers[LIVE_DATE_COLUMN_INDEX]}" — reads as "real-time data", not a translation of "Live Date".`);
        }
      } finally {
        await restoreEnglish(pg);
      }
    });
  }

  test('TC-LOC-MGH-054: In all three locales, no header is blank, duplicated beyond the confirmed one exception, or a raw untranslated key', { tag: '@C106000' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('In English, French and Spanish every column heading shows proper wording: nothing blank, no leftover developer text, and only Currency twice.');
    test.setTimeout(240_000);
    try {
      for (const { code } of LANGUAGE_OPTIONS) {
        await pg.switchAppLanguage(code);
        await pg.waitForHistoryGridLoaded();
        const headers = await pg.getColumnHeaders();
        await verify(`Check every heading in ${code} is real, translated wording`, async () => {
          expect(headers).toHaveLength(COLUMN_COUNT);
          expect(headers.filter(h => h === ''), 'blank headings').toEqual([]);
          expect(headers.filter(h => RAW_FIELD_KEY_PATTERN.test(h)), 'raw field keys').toEqual([]);
          expect(headers.filter(h => I18N_PLACEHOLDER_PATTERNS.some(p => p.test(h))), 'i18n placeholders').toEqual([]);
        });
        await verify(`Check the only repeated headings in ${code} are the two Currency columns and the known discrepancy`, async () => {
          // The Currency pair is by design; index 5 holds the first Currency column in every locale.
          const currencyLabel = headers[HISTORY_ALL_COLUMNS_IN_ORDER.indexOf('Currency')]!;
          const dupes = duplicatedLabels(headers);
          expect(dupes).toContain(`${currencyLabel} x2`);
          const others = dupes.filter(d => d !== `${currencyLabel} x2`).map(d => d.replace(/ x\d+$/, ''));
          expect(others, `unexpected repeated headings in ${code}`).toEqual([...LOCALE_KNOWN_DUPLICATE_HEADERS[code]]);
        });
        if (LOCALE_KNOWN_DUPLICATE_HEADERS[code].length) {
          await attachNote(`Potential bug BUG-LOC-MGH-002: two columns share one heading in ${code}`,
            LOCALE_KNOWN_DUPLICATE_HEADERS[code].map(label =>
              `"${label}" is used for: ${headers.map((h, i) => (h === label ? HISTORY_ALL_COLUMNS_IN_ORDER[i] : null)).filter(Boolean).join(' AND ')}`).join('\n'));
        }
      }
    } finally {
      await restoreEnglish(pg);
    }
  });

  // ------------------------------------------------------------ 9. Data integrity and isolation

  test('TC-LOC-MGH-055: Every visible row belongs to the selected office (1604)', { tag: '@C106001' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about(`Every entry across the first three pages belongs to office ${HISTORY_OFFICE.no}.`);
    test.setTimeout(150_000);
    const offices: string[] = [];
    const names: string[] = [];
    try {
      for (let pageNo = 1; pageNo <= 3; pageNo++) {
        if (pageNo > 1) {
          if (await pg.isPaginationButtonDisabled('next')) break;
          await pg.clickPaginationButton('next');
        }
        offices.push(...await pg.getColumnValues('Local Office', 20));
        names.push(...await pg.getColumnValues('Local Office Name', 20));
      }
    } finally {
      await pg.goToFirstPageIfNeeded();
    }

    await verify(`Check every entry read is office ${HISTORY_OFFICE.no}`, async () => {
      expect(offices.length).toBeGreaterThan(0);
      expect(offices.filter(o => o !== HISTORY_OFFICE.no)).toEqual([]);
    });
    await verify(`Check every entry carries the office's name, "${HISTORY_OFFICE.name}"`, async () => {
      // startsWith, not equality: TC-058's own save-cycle entries carry the probe suffix.
      expect(names.filter(n => !n.startsWith(HISTORY_OFFICE.name))).toEqual([]);
    });
  });

  test("TC-LOC-MGH-056: Cross-location isolation — office 1606's rows never mix with 1604's", { tag: '@C106002' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about(`Office ${HISTORY_CONTRAST_OFFICE.no}'s History shows only its own changes, with the same columns as office ${HISTORY_OFFICE.no}.`);
    test.setTimeout(150_000);
    try {
      await pg.reloadAndNavigateToHistory(HISTORY_CONTRAST_OFFICE.no);
      const offices = await pg.getColumnValues('Local Office', 20);
      const names = await pg.getColumnValues('Local Office Name', 20);
      const { total } = await pg.getPageIndicator();

      await verify(`Check every entry is office ${HISTORY_CONTRAST_OFFICE.no}, "${HISTORY_CONTRAST_OFFICE.name}"`, async () => {
        expect(offices.length).toBeGreaterThan(0);
        expect(offices.filter(o => o !== HISTORY_CONTRAST_OFFICE.no)).toEqual([]);
        expect(names.filter(n => n !== HISTORY_CONTRAST_OFFICE.name)).toEqual([]);
      });
      await verify(`Check office ${HISTORY_CONTRAST_OFFICE.no} shows the same ${COLUMN_COUNT} columns`, async () => {
        expect(await pg.getColumnHeaders()).toEqual([...HISTORY_ALL_COLUMNS_IN_ORDER]);
      });
      await attachNote(`Office ${HISTORY_CONTRAST_OFFICE.no} history size`, `${total} page(s) at ${DEFAULT_ROWS_PER_PAGE} per page`);
    } finally {
      await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);
    }
  });

  test('TC-LOC-MGH-057: The corporate-pricing history request is scoped correctly (best-effort verification of the NM-1164 rolling window)', { tag: '@C106003' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about("The History request asks for this location's corporate history. The 90-day window itself cannot be proven from live data and is recorded as partial.");
    test.setTimeout(120_000);
    const responsePromise = pg.page.waitForResponse(r => HISTORY_API_URL_PATTERN.test(r.url()), { timeout: 60_000 });
    const requests = await pg.captureHistoryRequests(() => pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no));
    const body = await (await responsePromise).json() as HistoryEnvelope;

    await verify(`Check the request asks for office ${HISTORY_OFFICE.no}'s corporate history`, async () => {
      expect(requests, JSON.stringify(requests)).toContainEqual(expect.objectContaining({ locationNo: HISTORY_OFFICE.no, isCorporate: true }));
    });

    await verify('Check the server answered with a history list and a total', async () => {
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.history)).toBe(true);
      expect(body.data?.totalCount ?? 0).toBeGreaterThan(0);
    });

    const oldest = Math.min(...meaningful(await pg.getColumnValues(HISTORY_SORT_COLUMN, 20)).map(parseTs));
    await attachNote('NM-1164 rolling window — PARTIAL verification',
      `Request scoped with isCorporate=true for location ${HISTORY_OFFICE.no}. A full 90-day boundary proof `
      + '(rows older than 90 days genuinely excluded) needs an aged fixture or a DB cross-check and is not '
      + `claimed here. Oldest Modified On on page 1: ${new Date(oldest).toISOString()}.`);
  });

  // ------------------------------------------------------------ 10. Save-cycle history capture

  test('TC-LOC-MGH-058: A saved Local Office Name change appears as a new top History row', { tag: '@C106004' }, async ({ locationManagementHistoryPage: pg, locationLeftPanelBasicInformationPage: basic, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Saving a change on Basic Information adds a new entry at the top of History, showing the new value, who made it and when.');
    // Two history loads plus two Basic Information save cycles at ~30-60s apiece.
    test.setTimeout(300_000);
    const baselineTop = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);

    const original = await pg.getStoredLocalOfficeName(HISTORY_OFFICE.no);
    await pg.returnToBasicInformation();
    const probe = probeNameFor(original);

    try {
      await phase(`Change Local Office Name to "${probe}"`, () => basic.setLocalOfficeName(probe));
      await verify('Check the edit is recognised and Save turns on', async () => {
        expect(await basic.waitForSaveButtonEnabled(10_000)).toBe(true);
      });

      const savedOk = await phase('Save the change and confirm', () => saveBasicInfoAndWait(pg, basic));
      await verify('Check the server accepted the save', async () => {
        expect(savedOk, 'no successful save response from the server').toBe(true);
      });

      await phase('Open History, newest first, and wait for the new entry', async () => {
        await pg.openHistoryTab(HISTORY_OFFICE.no);
        await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending');
        await pg.waitForRecentTopRow(RECENT_ROW_WINDOW_MS, 30_000);
      });

      const top = await pg.readSettledTopRow([HISTORY_SORT_COLUMN, HISTORY_AUDIT_USER_COLUMN, SAVE_CYCLE_PROBE.column]);
      await verify('Check a newer entry has appeared at the top of History', async () => {
        expect(parseTs(top[HISTORY_SORT_COLUMN]!)).toBeGreaterThan(parseTs(baselineTop));
        const ageMs = Date.now() - parseTs(top[HISTORY_SORT_COLUMN]!);
        expect(ageMs, `the new top entry is ${Math.round(ageMs / 60000)} minutes old`).toBeLessThan(RECENT_ROW_WINDOW_MS);
      });
      await verify('Check the new entry records the saved value and names the automation user', async () => {
        expect(top[SAVE_CYCLE_PROBE.column]).toBe(probe);
        expect(top[HISTORY_AUDIT_USER_COLUMN]).toContain(AUTOMATION_USER);
      });
    } finally {
      await phase(`Put Local Office Name back to "${original}"`, () => restoreLocalOfficeName(pg, basic, original));
    }

    await verify('Check office 1604 is left exactly as it was found', async () => {
      // Server truth, not the form: a form read right after a save can show a stale value.
      expect(await pg.getStoredLocalOfficeName(HISTORY_OFFICE.no)).toBe(original);
    });
  });

  test('TC-LOC-MGH-059: A discarded/cancelled Local Office Name edit creates NO new History row', { tag: '@C106005' }, async ({ locationManagementHistoryPage: pg, locationLeftPanelBasicInformationPage: basic, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Throwing away an unsaved edit adds nothing to History.');
    test.setTimeout(180_000);
    const baselineTop = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);

    const original = await pg.getStoredLocalOfficeName(HISTORY_OFFICE.no);
    await pg.returnToBasicInformation();
    const probe = probeNameFor(original);

    try {
      await phase(`Change Local Office Name to "${probe}" without saving`, () => basic.setLocalOfficeName(probe));
      await verify('Check the form knows it has an unsaved edit', async () => {
        expect(await basic.waitForSaveButtonEnabled(10_000)).toBe(true);
      });

      await phase('Go to History and choose Discard in the Unsaved changes warning', async () => {
        await pg.page.locator('[data-testid="location-settings-tab-management-history"]').click();
        const dialog = pg.page.locator('[role="alertdialog"]');
        await dialog.waitFor({ state: 'visible', timeout: 10_000 });
        await dialog.getByRole('button', { name: 'Discard' }).click();
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
        await pg.openHistoryTab(HISTORY_OFFICE.no);
      });

      await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending');
      const top = await pg.readSettledTopRow([HISTORY_SORT_COLUMN, SAVE_CYCLE_PROBE.column]);
      await verify('Check no History entry records the discarded value', async () => {
        // Office 1604 is shared, so another run's save may add an entry here; what this edit must
        // never do is reach History. Every entry newer than the baseline must not carry it.
        const newer = await pg.getRowsSinceTimestamp(parseTs(baselineTop) + 1_000, [HISTORY_SORT_COLUMN, SAVE_CYCLE_PROBE.column]);
        expect(newer.filter(r => r[SAVE_CYCLE_PROBE.column] === probe), JSON.stringify(newer)).toEqual([]);
        expect(top[SAVE_CYCLE_PROBE.column]).not.toBe(probe);
      });

      await pg.returnToBasicInformation();
      await verify('Check Basic Information shows the original name again, with Save off', async () => {
        expect(await basic.getLocalOfficeName()).toBe(original);
        expect(await basic.isSaveEnabled()).toBe(false);
      });
    } finally {
      await restoreLocalOfficeName(pg, basic, original);
    }
  });

  test('TC-LOC-MGH-060: A mocked failed save creates NO new History row', { tag: '@C106006' }, async ({ locationManagementHistoryPage: pg, locationLeftPanelBasicInformationPage: basic, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('A save that the server rejects adds nothing to History.');
    test.setTimeout(240_000);
    const baselineTop = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);

    const original = await pg.getStoredLocalOfficeName(HISTORY_OFFICE.no);
    await pg.returnToBasicInformation();
    const probe = probeNameFor(original);
    // Every write to the location API fails; reads (history, lookups) pass through untouched.
    const failWrites = async (route: import('@playwright/test').Route) => {
      const req = route.request();
      if (req.method() !== 'GET' && !HISTORY_API_URL_PATTERN.test(req.url()) && !/\/get-/.test(req.url())) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false,"error":"mocked failure"}' });
        return;
      }
      await route.fallback();
    };

    try {
      await phase('Make every save to the server fail', () => pg.page.route(/\/navigator\/api\/location\//, failWrites));
      await phase(`Change Local Office Name to "${probe}"`, () => basic.setLocalOfficeName(probe));
      await verify('Check Save turns on for the edit', async () => {
        expect(await basic.waitForSaveButtonEnabled(10_000)).toBe(true);
      });

      const result = await basic.clickSave();
      await verify('Check the save is reported as failed, not silently accepted', async () => {
        expect(result.success, 'the mocked-failing save reported success').toBe(false);
      });
      await attachNote('What the failed save reported', result.networkError ?? 'no error text');

      await phase('Stop failing saves, throw the edit away and reopen History', async () => {
        await pg.page.unroute(/\/navigator\/api\/location\//, failWrites);
        await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no);
      });

      const top = await pg.readSettledTopRow([HISTORY_SORT_COLUMN, SAVE_CYCLE_PROBE.column]);
      await verify('Check no History entry records the value from the failed save', async () => {
        // Office 1604 is shared, so another run's save may add an entry here; the failed save must
        // never reach History. Every entry newer than the baseline must not carry its value.
        const newer = await pg.getRowsSinceTimestamp(parseTs(baselineTop) + 1_000, [HISTORY_SORT_COLUMN, SAVE_CYCLE_PROBE.column]);
        expect(newer.filter(r => r[SAVE_CYCLE_PROBE.column] === probe), JSON.stringify(newer)).toEqual([]);
        expect(top[SAVE_CYCLE_PROBE.column]).not.toBe(probe);
      });
    } finally {
      await pg.page.unroute(/\/navigator\/api\/location\//, failWrites).catch(() => {});
      // If the mock ever misses and the save lands, this puts the real value back.
      await restoreLocalOfficeName(pg, basic, original);
    }

    await verify('Check Local Office Name still reads its original value', async () => {
      expect(await pg.getStoredLocalOfficeName(HISTORY_OFFICE.no)).toBe(original);
    });
  });

  // ------------------------------------------------------------ 11. Accessibility and keyboard

  test('TC-LOC-MGH-061: Column headers are exposed as native columnheader roles', { tag: '@C106007' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('A screen reader can find every one of the 87 column headings.');
    const roleCount = await pg.getColumnHeaderRoleCount();
    await verify(`Check all ${COLUMN_COUNT} headings are announced as column headings`, async () => {
      expect(roleCount).toBe(COLUMN_COUNT);
      expect(roleCount).toBe(await pg.getColumnHeaderCount());
    });
  });

  test('TC-LOC-MGH-062: The sort menu is fully keyboard-operable', { tag: '@C106008' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('A keyboard-only user can open the sort menu, choose a direction and cancel with Escape.');
    test.setTimeout(120_000);
    try {
      const opened = await pg.openSortMenuByKeyboard(HISTORY_SORT_COLUMN);
      const items = await pg.getSortMenuItemLabels();
      await verify('Check pressing Enter on the sort control opens a menu offering both directions', async () => {
        expect(opened, 'the sort menu did not open from the keyboard').toBe(true);
        expect(items.join(' | ')).toContain('Sort ascending');
        expect(items.join(' | ')).toContain('Sort descending');
      });

      // Enter opens the menu with the first item ("Sort ascending") focused.
      await pg.applySortMenuItemByKeyboard(0);
      await verify('Check the keyboard alone applied the sort', async () => {
        await expect.poll(() => pg.getSortIndicator(HISTORY_SORT_COLUMN), { timeout: 15_000 }).toBe('ascending');
      });

      await pg.openSortMenuByKeyboard(HISTORY_SORT_COLUMN);
      const closed = await pg.closeSortMenuWithEscape();
      await verify('Check Escape closes the menu and leaves the sort as it was', async () => {
        expect(closed).toBe(true);
        expect(await pg.getSortIndicator(HISTORY_SORT_COLUMN)).toBe('ascending');
      });
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  // ------------------------------------------------------------ 12. Responsive

  test('TC-LOC-MGH-063: The grid stays usable with no page-level horizontal scroll at laptop viewport sizes', { tag: '@C106009' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('On smaller laptop screens no column disappears, and only the list scrolls sideways.');
    test.setTimeout(120_000);
    try {
      for (const viewport of HISTORY_MOCK.viewports) {
        await pg.resizeViewport(viewport.width, viewport.height);
        await pg.waitForHistoryGridLoaded();
        const overflow = await pg.getOverflow();
        const paginatorButtons = await pg.getPaginationButtonCount();
        await verify(`Check that at ${viewport.label} no column is lost and only the list scrolls sideways`, async () => {
          expect(await pg.getColumnHeaderCount()).toBe(COLUMN_COUNT);
          expect(overflow.pageOverflowPx, `the page scrolls horizontally at ${viewport.label}`).toBeLessThanOrEqual(1);
          expect(overflow.containerScrollsHorizontally).toBe(true);
          expect(paginatorButtons, `the paginator disappeared at ${viewport.label}`).toBeGreaterThan(0);
        });
      }
    } finally {
      await pg.resizeViewport(HISTORY_MOCK.defaultViewport.width, HISTORY_MOCK.defaultViewport.height);
      await pg.waitForHistoryGridLoaded();
    }
  });

  // ------------------------------------------------------------ 13. Resilience

  test('TC-LOC-MGH-064: No uncaught console/page error occurs across the tab’s core interactions', { tag: '@C106010' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Sorting, paging, switching history type and switching language raise no errors in the browser.');
    test.setTimeout(300_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
      // favicon 404s are present at page load before the tab is ever touched — unrelated noise.
      if (msg.type() === 'error' && !/favicon/i.test(msg.location().url ?? '')) consoleErrors.push(msg.text());
    };
    const onPageError = (err: Error) => pageErrors.push(err.message);
    pg.page.on('console', onConsole);
    pg.page.on('pageerror', onPageError);
    try {
      await phase('Sort Modified On up then down', async () => {
        await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'ascending');
        await pg.sortColumnAndSettle(HISTORY_SORT_COLUMN, 'descending');
      });
      await phase('Page forward then back', async () => {
        await pg.clickPaginationButton('next');
        await pg.clickPaginationButton('previous');
      });
      await phase('Switch to the Legacy history type and back', async () => {
        await pg.selectHistoryType(HISTORY_TYPES.legacy);
        await pg.selectHistoryType(HISTORY_TYPES.standard);
      });
      await phase('Switch the language to French (Canada) and back', async () => {
        await pg.switchAppLanguage('fr-CA');
        await pg.waitForHistoryGridLoaded();
        await pg.switchAppLanguage(DEFAULT_LANGUAGE);
        await pg.waitForHistoryGridLoaded();
      });
    } finally {
      pg.page.off('console', onConsole);
      pg.page.off('pageerror', onPageError);
      await restoreEnglish(pg);
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }

    await verify('Check no error was logged in the browser console', async () => {
      expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
    });
    await verify('Check no uncaught page error was thrown', async () => {
      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    });
  });

  test('TC-LOC-MGH-065: A full reload reproduces the identical 87-column contract even though the tab selection itself is not preserved', { tag: '@C106011' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('After a browser refresh, re-opening History shows the same columns and starts from the default newest-first sort again.');
    test.setTimeout(150_000);
    const headersBefore = await pg.getColumnHeaders();
    await pg.sortColumnAndSettle(HISTORY_DATE_SORT_COLUMN, 'ascending');

    await phase('Refresh the browser', () => pg.openLocationSettings(HISTORY_OFFICE.no));
    await verify('Check the refresh lands on Basic Information', async () => {
      expect(await pg.isOnBasicInformationTab()).toBe(true);
    });

    await pg.openHistoryTab(HISTORY_OFFICE.no);
    await verify('Check the same columns come back, sorted newest first again', async () => {
      expect(await pg.getColumnHeaders()).toEqual(headersBefore);
      expect(await pg.getSortIndicator(HISTORY_DEFAULT_SORT.column)).toBe(HISTORY_DEFAULT_SORT.direction);
      expect(await pg.getSortIndicator(HISTORY_DATE_SORT_COLUMN)).toBe('none');
    });
  });

  test('TC-LOC-MGH-066: A slow (delayed, not failed) history response keeps the loading affordance visible and issues no duplicate request', { tag: '@C106012' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('When the server is slow, the list keeps showing that it is loading, asks only once, and fills in when the answer arrives.');
    test.setTimeout(150_000);
    let requestCount = 0;
    try {
      await pg.openLocationSettings(HISTORY_OFFICE.no);
      await phase(`Slow every history response down by ${HISTORY_MOCK.slowResponseMs / 1000}s`, () =>
        pg.page.route(HISTORY_API_URL_PATTERN, async (route) => {
          requestCount++;
          await new Promise(r => setTimeout(r, HISTORY_MOCK.slowResponseMs));
          await route.continue().catch(() => {});
        }));

      await phase('Open the History tab against the slow server', async () => {
        await pg.page.locator('[data-testid="location-settings-tab-management-history"]').click();
        await pg.page.locator('[data-testid="location-settings-tab-content-management-history"]').waitFor({ state: 'visible', timeout: 30_000 });
      });

      const pending = await pg.getPendingState();
      await verify('Check the list shows it is loading, not that there is no history', async () => {
        expect(pending.emptyStateShown).toBe(false);
        expect(pending.spinnerCount > 0 || pending.skeletonCount > 0 || pending.dataRowCount === 0).toBe(true);
      });

      await pg.waitForHistoryGridLoaded(30_000);
      await verify('Check the entries arrive and only one request was made', async () => {
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        expect(requestCount, 'a duplicate history request fired while the first was pending').toBe(1);
      });
    } finally {
      await restoreLiveHistory(pg);
    }
  });

  test('TC-LOC-MGH-067: A mocked mid-session 401 on the history endpoint surfaces a sign-in/redirect state, not a silently blank or corrupt grid', { tag: '@C106013' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('If the session expires while paging through History, the user is not shown old entries passed off as the next page.');
    test.setTimeout(150_000);
    test.skip((await pg.getPageIndicator()).total < 2, 'office has a single page of history');
    const page1Top = await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN);
    const pageErrors: string[] = [];
    const onPageError = (err: Error) => pageErrors.push(err.message);
    try {
      pg.page.on('pageerror', onPageError);
      await phase('Make the next history request come back 401 Unauthorized', () =>
        pg.page.route(HISTORY_API_URL_PATTERN, route =>
          route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' }), { times: 1 }));

      await phase('Ask for page 2', async () => {
        // A raw click: clickPaginationButton() waits for a settled grid, which a 401 may never give.
        await pg.page.getByRole('button', { name: 'Go to next page' }).click();
        await pg.page.waitForTimeout(3_000);
      });

      const url = pg.page.url();
      const onHistory = url.includes('settings/location') && (await pg.isOnHistoryTab());
      const indicator = onHistory ? await pg.getPageIndicator() : { current: 0, total: 0 };
      const topNow = onHistory && (await pg.getHistoryRowCount()) > 0 ? await pg.getColumnByHeader(0, HISTORY_SORT_COLUMN) : '';
      await verify('Check page-1 entries are not shown labelled as page 2', async () => {
        expect(indicator.current === 2 && topNow === page1Top,
          'the grid claims page 2 while still showing page 1 entries').toBe(false);
      });
      await verify('Check no uncaught page error was thrown', async () => {
        expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
      });
      await attachNote('What the user saw after the 401', JSON.stringify({ url, onHistory, indicator, topNow, page1Top }, null, 2));
    } finally {
      pg.page.off('pageerror', onPageError);
      await restoreLiveHistory(pg);
    }
  });

  // ------------------------------------------------------------ 14. History type selector and legacy grid

  test('TC-LOC-MGH-068: The history type selector offers exactly the two confirmed options', { tag: '@C106014' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The history type chooser starts on the current history and offers exactly one other option, the legacy history.');
    const value = await pg.getHistoryTypeValue();
    const options = await pg.getHistoryTypeOptions();
    await verify('Check the chooser starts on the current history and offers exactly two types', async () => {
      expect(value).toBe(HISTORY_TYPES.standard);
      expect(options).toEqual([HISTORY_TYPES.standard, HISTORY_TYPES.legacy]);
    });
  });

  test('TC-LOC-MGH-069: STRUCTURAL FINDING — selecting Legacy swaps to an untagged 86-column table with a larger sortable set', { tag: '@C106015' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('The legacy history is its own read-only list: one column fewer than the current one, and more of it can be sorted.');
    test.setTimeout(120_000);
    try {
      await pg.selectHistoryType(HISTORY_TYPES.legacy);
      const headers = await pg.getActiveGridHeaders();
      await verify('Check the legacy list has replaced the current one', async () => {
        // The finding this exists for: the tagged table leaves the DOM, and the legacy table has no
        // data-testid of its own — an automation gap, reached here through the panel's one table.
        expect(await pg.getActiveHistoryGrid()).toBe('legacy');
        expect(await pg.getActiveTableCandidateCount(), 'the fallback is only safe with one table').toBe(1);
      });

      await verify(`Check it shows ${HISTORY_LEGACY.columnCount} columns: the current set minus "${HISTORY_LEGACY.missingColumn}"`, async () => {
        expect(headers).toEqual(HISTORY_ALL_COLUMNS_IN_ORDER.filter(h => h !== HISTORY_LEGACY.missingColumn));
      });

      const sortable = await pg.getActiveGridSortableColumns();
      await verify('Check more of the legacy list can be sorted than the current list', async () => {
        expect(sortable.length).toBeGreaterThan(SORTABLE_COLUMNS.length);
      });
      await attachNote('Legacy columns that can be sorted', `${sortable.length} of ${headers.length}\n${sortable.join('\n')}`);

      await verify('Check the legacy list is just as uneditable', async () => {
        expect(await pg.getActiveGridEditorCount()).toBe(0);
      });
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  test('TC-LOC-MGH-070: The legacy grid’s paginator is entirely ABSENT, not merely disabled, when all rows fit on one page', { tag: '@C106016' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('When the legacy history fits on one page, no page navigation is shown at all.');
    test.setTimeout(120_000);
    try {
      await pg.selectHistoryType(HISTORY_TYPES.legacy);
      const rows = await pg.getActiveGridRowCount();
      test.skip(rows > parseInt(DEFAULT_ROWS_PER_PAGE, 10), 'legacy history spans more than one page on this office');
      await verify('Check neither the page box nor the page count is shown', async () => {
        expect(await pg.isPageInputPresent()).toBe(false);
        expect(await pg.getPaginationText()).toBe('');
      });
      await attachNote('Legacy entries on this office', String(rows));
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  test('TC-LOC-MGH-071: Switching back from Legacy to Standard restores the exact original header list and default sort', { tag: '@C106017' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Going back from the legacy history to the current one restores the same columns and the newest-first sort.');
    test.setTimeout(120_000);
    const headersBefore = await pg.getColumnHeaders();
    try {
      await pg.selectHistoryType(HISTORY_TYPES.legacy);
      await pg.selectHistoryType(HISTORY_TYPES.standard);
      await verify('Check the current list is back with its full column set', async () => {
        expect(await pg.getActiveHistoryGrid()).toBe('standard');
        expect(await pg.getColumnHeaders()).toEqual(headersBefore);
      });
      await verify('Check it is sorted newest first again', async () => {
        expect(await pg.getSortIndicator(HISTORY_DEFAULT_SORT.column)).toBe(HISTORY_DEFAULT_SORT.direction);
      });
    } finally {
      await pg.restoreDefaultView(HISTORY_OFFICE.no);
    }
  });

  // ------------------------------------------------------------ 15. Related module cross-reference

  test('TC-LOC-MGH-072: SCOPE NOTE — Local Office Settings History (NM-854) is a separate, already-automated module', { tag: '@C106018' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Records that Local Office Settings History is a separate page with its own suite, not reached from this tab.');
    await verify('Check this tab has no link into Local Office Settings', async () => {
      expect(await pg.getLocalOfficeSettingsLinkCount()).toBe(0);
    });
    await attachNote('Related Local Office Settings History coverage (NM-3937 scope)',
      'Local Office Settings History (NM-854) lives at settings/local-office and is covered end to end by '
      + 'tests/local-office/local-office-history.spec.ts (TC-LOE-HIST-001..046): rendering, columns, read-only, '
      + 'sorting incl. server-side, pagination, mocked empty/loading/error, save cycle, accessibility, responsive. '
      + 'Cross-module Locations<->Legal precedent: TC-TNC-CORE-077 in tests/terms-conditions/terms-conditions.spec.ts (skipped).');
  });

  // ------------------------------------------------------------ 16. Audit completeness
  //
  // The groups above prove the columns exist. These prove what reaches them: a setting that has a
  // column must record its saved value there, and a setting without one is recorded as such. Save
  // cycles run in a UTC browser, so the form's Live Date display shift (BUG-LOC-LP-001, withdrawn)
  // cannot move Live Date on every save.

  test('TC-LOC-MGH-073: Every editable Location Settings control is either mapped to a History column or on the known untracked list', { tag: '@C106019' }, async ({ locationManagementHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Every setting a user can change on Location Settings is accounted for: it either has its History column or is on the agreed list of settings History does not record.');
    test.setTimeout(240_000);
    const strip = (id: string) => id.replace(/^location-settings-/, '');
    const seen: string[] = [];
    const unclassified: string[] = [];

    await phase('Read every control on the left panel and on each Basic Information sub-tab', async () => {
      await pg.openSettingsTab(null, HISTORY_OFFICE.no);
      for (const tab of SETTINGS_TABS) {
        if (tab) {
          await pg.page.getByRole('tab', { name: tab, exact: true }).click();
          await pg.page.waitForTimeout(3_000);
        }
        for (const id of (await pg.getSettingsControlTestIds(tab)).map(strip)) {
          seen.push(`${tab ?? 'Left panel'}: ${id}`);
          const known = id in SETTING_TO_HISTORY_COLUMN
            || UNTRACKED_SETTINGS.some(r => r.test(id)) || IGNORED_CONTROLS.some(r => r.test(id));
          if (!known) unclassified.push(`${tab ?? 'Left panel'}: ${id}`);
        }
      }
    });

    await verify('Check no control on the form is unclassified', async () => {
      // A control the map has never heard of is not passing — it is unexamined. Classify it in
      // SETTING_TO_HISTORY_COLUMN or UNTRACKED_SETTINGS rather than letting it drift unaudited.
      expect(unclassified, `controls not in the History map or the untracked list: ${unclassified.join(', ')}`).toEqual([]);
    });

    const headers = await pg.reloadAndNavigateToHistory(HISTORY_OFFICE.no).then(() => pg.getColumnHeaders());
    await verify('Check every mapped setting still has its History column', async () => {
      const missing = Object.entries(SETTING_TO_HISTORY_COLUMN).filter(([, m]) => !headers.includes(m.column))
        .map(([id, m]) => `${id} -> "${m.column}"`);
      expect(missing).toEqual([]);
    });

    const untracked = seen.filter(s => UNTRACKED_SETTINGS.some(r => r.test(s.split(': ')[1]!)));
    await attachNote('Settings with no History column (never visible in History)', untracked.join('\n'));
    await attachNote('Mapped settings not yet proven by a save (label match only)', Object.entries(SETTING_TO_HISTORY_COLUMN)
      .filter(([, m]) => !m.verified).map(([id, m]) => `${id} -> ${m.column}`).join('\n'));
  });

  for (const [tcId, caseTag, title, fields] of [
    ['TC-LOC-MGH-074', '@C106020', 'Left-panel settings of each type (Union, Region, Tax Mode) reach their History column when saved', SAVE_CHECK_LEFT_PANEL],
    ['TC-LOC-MGH-075', '@C106021', 'Local Information settings of each type (checkbox, percentage, text, dropdown, radio) reach their History column when saved', SAVE_CHECK_LOCAL_INFORMATION],
    ['TC-LOC-MGH-076', '@C106022', 'Account and Address, Pricing, Legal and Notes settings reach their History column when saved', SAVE_CHECK_OTHER_TABS],
  ] as const) {
    test(`${tcId}: ${title}`, { tag: caseTag }, async ({ browser, config, dependencyGate }) => {
      dependencyGate(['TC-LOC-MGH-001']);
      await about('Saving a change to each of these settings adds a History entry that shows the new value in the matching column, and the setting is put back afterwards.');
      // Two save cycles per field (change + restore) at roughly 30-60s apiece.
      test.setTimeout(fields.length * 150_000);
      await withUtcHistoryPage(browser, config, async (pg) => {
        for (const field of fields) await saveAndCheckField(pg, field);
      });
    });
  }

  test('TC-LOC-MGH-077: A pricing-strategy row change creates a History entry but leaves the pricing-strategy columns blank', { tag: '@C106023' }, async ({ browser, config, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Records how History handles a change to a pricing-strategy row: an entry is added, but none of the seven pricing-strategy columns show what changed.');
    test.setTimeout(300_000);
    await withUtcHistoryPage(browser, config, async (pg) => {
    let original = '';
    let saved = false;
    try {
      const [before] = await pg.readNewestHistoryEntries(HISTORY_OFFICE.no);
      await pg.openSettingsTab('Pricing', HISTORY_OFFICE.no);
      original = await pg.readSetting(PRICING_STRATEGY_PROBE_SELECTOR, 'checkbox');
      await pg.writeSetting(PRICING_STRATEGY_PROBE_SELECTOR, 'checkbox', original === 'true' ? 'false' : 'true');
      const result = await pg.saveSettings();
      saved = result.saved === true;
      await verify('Check the strategy-row change saves', async () => {
        expect(result.saved).toBe(true);
        expect(result.success, result.networkError ?? '').toBe(true);
      });

      const [top, prev] = await pg.readNewestHistoryEntries(HISTORY_OFFICE.no, before['Modified On']);
      await verify('Check the save added a History entry', async () => {
        expect(parseTs(top['Modified On'] ?? ''), 'no entry newer than the one before the save').toBeGreaterThan(parseTs(before['Modified On'] ?? ''));
      });
      await verify('Check the seven pricing-strategy columns are still blank (current behaviour, pinned)', async () => {
        // Accepted by the owner (2026-09-28) and pinned on purpose: the strategy row changed and
        // saved, yet History records none of it. If History starts recording strategy changes this
        // goes red — update it to assert the recorded values instead of deleting it.
        for (const column of PRICING_STRATEGY_COLUMNS) expect(top[column], `"${column}"`).toBe('');
      });
      await attachNote('Potential gap: pricing-strategy change not visible in History',
        `Toggled Is Alternate on pricing-strategy row 2 (${original} -> ${original === 'true' ? 'false' : 'true'}). `
        + `New entry ${top['Modified On']}; data columns that changed: ${changedDataColumns(top, prev).join(', ') || 'none'}.`);
    } finally {
      if (saved) {
        await pg.openSettingsTab('Pricing', HISTORY_OFFICE.no);
        if ((await pg.readSetting(PRICING_STRATEGY_PROBE_SELECTOR, 'checkbox')) !== original) {
          await pg.writeSetting(PRICING_STRATEGY_PROBE_SELECTOR, 'checkbox', original);
          await pg.saveSettings();
        }
      }
    }
    });
  });

  test('TC-LOC-MGH-078: Saving a setting that has no History column changes no History data column', { tag: '@C106024' }, async ({ browser, config, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await about('Changing a setting History does not track leaves every History column as it was, and the report records whether an entry was still added.');
    test.setTimeout(SAVE_CHECK_UNTRACKED.length * 150_000);
    await withUtcHistoryPage(browser, config, async (pg) => {
      for (const f of SAVE_CHECK_UNTRACKED) {
        await phase(`Save a change to "${f.name}" and inspect the newest History entry`, async () => {
          // The baseline is the newest entry BEFORE this save: both timestamps then come from the
          // server clock, which differs from the runner's by several seconds.
          const [baseline] = await pg.readNewestHistoryEntries(HISTORY_OFFICE.no);
          await pg.openSettingsTab(f.tab, HISTORY_OFFICE.no);
          const original = await pg.readSetting(f.selector, f.kind);
          let saved = false;
          try {
            await pg.writeSetting(f.selector, f.kind, original === 'true' ? 'false' : 'true');
            const result = await pg.saveSettings();
            saved = result.saved === true;
            await verify(`Check the change to "${f.name}" saves`, async () => {
              expect(result.saved).toBe(true);
              expect(result.success, result.networkError ?? '').toBe(true);
            });

            const [top] = await pg.readNewestHistoryEntries(HISTORY_OFFICE.no, baseline['Modified On']);
            const createdByThisSave = parseTs(top['Modified On'] ?? '') > parseTs(baseline['Modified On'] ?? '');
            // A save made while part of the form is still loading records some lookup names blank
            // (Billing Cycle, Legal names, Country/Region) although the location is unchanged, so a
            // blank-vs-value difference is not evidence about this setting. A value replaced by a
            // DIFFERENT value is.
            const diffs = changedDataColumns(top, baseline);
            const realChanges = diffs.filter(k => (top[k] ?? '') !== '' && (baseline[k] ?? '') !== '');
            const blankFlips = diffs.filter(k => !realChanges.includes(k));
            if (createdByThisSave) {
              await verify(`Check the entry added for "${f.name}" changes no recorded History value`, async () => {
                expect(realChanges.map(k => `${k}: ${JSON.stringify(baseline[k])} -> ${JSON.stringify(top[k])}`)).toEqual([]);
              });
            }
            await attachNote(`"${f.name}" save`, (createdByThisSave
              ? `An entry was added at ${top['Modified On']} that records no change to any value — it shows that `
                + 'something changed but not what.'
              : 'No History entry was added for this save.')
              + (blankFlips.length ? `\nColumns blank in one entry and filled in the other (loading-window artefact): ${blankFlips.join(', ')}` : ''));
          } finally {
            if (saved) {
              await pg.openSettingsTab(f.tab, HISTORY_OFFICE.no);
              if ((await pg.readSetting(f.selector, f.kind)) !== original) {
                await pg.writeSetting(f.selector, f.kind, original);
                await pg.saveSettings();
              }
            }
          }
        });
      }
    });
  });
});
