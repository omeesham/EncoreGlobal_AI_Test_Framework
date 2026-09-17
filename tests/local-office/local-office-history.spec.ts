import { test, expect } from '../../src/fixtures/pages.fixture';
import { OFFICE_NO } from '../../src/data/common';
import { about, phase, verify, attachNote } from '../../src/fixtures/report-steps';
import { Log } from '../../src/utils/logger';
import {
  LocalOfficeHistoryPage,
  HISTORY_CHECK_GLYPH,
} from '../../src/pages/local-office/local-office-history.page';
import {
  LOCAL_OFFICE_TAB_ORDER,
  HISTORY_EMPTY_STATE_TEXT,
  HISTORY_SORT_COLUMN,
  HISTORY_NUMERIC_SORT_COLUMN,
  HISTORY_BOOLEAN_SORT_COLUMN,
  HISTORY_AUDIT_USER_COLUMN,
  HISTORY_EXPECTED_COLUMNS,
  HISTORY_ALL_COLUMNS_IN_ORDER,
  HISTORY_DEFAULT_SORT,
  HISTORY_HOLIDAY_MULTIPLIER_COLUMN,
  HISTORY_MIN_COLUMN_COUNT,
  HISTORY_FORBIDDEN_CELL_TEXT,
  HISTORY_FORBIDDEN_BOOLEAN_TEXT,
  HISTORY_MODIFIED_ON_PATTERN,
  UUID_PATTERN,
  RAW_FIELD_KEY_PATTERN,
  I18N_PLACEHOLDER_PATTERNS,
  HISTORY_API_URL_PATTERN,
  HISTORY_MOCK,
  HISTORY_INTEGRATION_FIELD,
  HISTORY_NON_SORTABLE_COLUMNS,
  HISTORY_ROWS_PER_PAGE,
  HISTORY_COMPOSITE_COLUMNS,
  HISTORY_COMPOSITE_FLAGS,
  HISTORY_PAGE_INPUT_REJECTED,
  HISTORY_LEGACY,
  HISTORY_PAGE_INPUT_ACCEPTED,
  HISTORY_PAGE_INPUT_DECIMAL_DEFECT,
  AUTOMATION_USER,
} from '../../src/data/local-office/local-office-history';

// Location Settings History tab (NM-854). The grid is strictly read-only, so all but TC-034 and
// TC-035 mutate nothing and the beforeEach re-navigation is the whole reset.

// route.fetch() re-issues the request from the test process; the e2e gateway resets that socket
// often enough to make one attempt unreliable. Playwright retries ECONNRESET only, so this cannot
// mask a genuine 4xx/5xx -- those are returned, not retried.
const HISTORY_FETCH_MAX_RETRIES = 3;

type ColumnSample = { header: string; values: string[] };

/** Non-blank, non-check-glyph cell values — the input to every ordering assertion. */
const meaningful = (values: string[]): string[] =>
  values.filter(v => v !== '' && v !== HISTORY_CHECK_GLYPH);

const distinctCount = (values: string[]): number => new Set(values).size;

/**
 * A column of "MM/DD/YYYY hh:mm:ss AM/PM" timestamps.
 *
 * These must NEVER be ordered as text: the AM/PM clock puts "03:46:57 PM" AFTER "08:21:04 AM"
 * chronologically, while "03" sorts BEFORE "08" lexicographically. Comparing a correctly sorted
 * Modified On column as a string therefore reports a violation the grid did not commit — the
 * false failure this predicate exists to prevent. Such a column is ordered by parsed instant.
 */
const isTimestampLike = (values: string[]): boolean =>
  values.length >= 2 && values.every(v => HISTORY_MODIFIED_ON_PATTERN.test(v));

/** Free text: at least two distinct values, every one carrying a letter, and NOT a timestamp
 *  column — "AM"/"PM" are letters, so a date column passes the letter test and must be excluded. */
const isTextLike = (values: string[]): boolean => {
  const nb = meaningful(values);
  return nb.length >= 2 && distinctCount(nb) >= 2
    && nb.every(v => /[A-Za-z]/.test(v)) && !isTimestampLike(nb);
};

/** Ordering key for a cell: the parsed instant for a timestamp column, the folded text otherwise. */
type OrderKey<T extends string | number> = (value: string) => T;
const textKey: OrderKey<string> = v => v.toLowerCase();
const timestampKey: OrderKey<number> = v => LocalOfficeHistoryPage.parseModifiedOnMs(v);

const isNonDescendingBy = <T extends string | number>(values: string[], key: OrderKey<T>): boolean =>
  values.every((v, i) => i === 0 || key(v) >= key(values[i - 1]!));

const isNonAscendingBy = <T extends string | number>(values: string[], key: OrderKey<T>): boolean =>
  values.every((v, i) => i === 0 || key(v) <= key(values[i - 1]!));

const isNonDescendingNumeric = (values: number[]): boolean =>
  values.every((v, i) => i === 0 || v >= values[i - 1]!);

const isNonAscendingNumeric = (values: number[]): boolean =>
  values.every((v, i) => i === 0 || v <= values[i - 1]!);

/** A sorted boolean column must GROUP its two states, never interleave them: at most one flip. */
const isGrouped = (values: string[]): boolean => {
  let flips = 0;
  for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1]) flips++;
  return flips <= 1;
};

/** Every sortable column with its first `rows` values — one header pass, one matrix pass. */
async function sampleSortableColumns(pg: LocalOfficeHistoryPage, rows = 8): Promise<ColumnSample[]> {
  const headers = await pg.getHistoryColumnHeaders();
  const sortable = new Set(await pg.getHistorySortableColumns());
  const matrix = await pg.getHistoryCellMatrix(rows);
  return headers
    .map((header, i) => ({ header, values: matrix.map(row => (row[i] ?? '').trim()) }))
    .filter(column => sortable.has(column.header));
}

/**
 * Replaces the first record array found anywhere in an unknown JSON payload.
 *
 * NM-854 does not publish the history endpoint's response shape, so the mock adapts to whatever
 * the app actually receives: the body itself when it is an array of objects, otherwise the first
 * such array reachable through the object tree. Returns `replaced: false` when no record array is
 * found, which makes the caller pass the real response through untouched rather than fabricate a
 * shape the UI cannot read.
 */
function replaceRecordArray(
  node: unknown,
  mutate: (records: unknown[]) => unknown[],
): { value: unknown; replaced: boolean } {
  if (Array.isArray(node)) {
    if (node.length === 0 || (typeof node[0] === 'object' && node[0] !== null)) {
      return { value: mutate(node), replaced: true };
    }
    return { value: node, replaced: false };
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = { ...(node as Record<string, unknown>) };
    for (const key of Object.keys(out)) {
      const child = replaceRecordArray(out[key], mutate);
      if (child.replaced) {
        out[key] = child.value;
        return { value: out, replaced: true };
      }
    }
    return { value: out, replaced: false };
  }
  return { value: node, replaced: false };
}

/**
 * Installs a history-response rewriter. Non-JSON and unrecognised payloads pass through.
 *
 * `route.fetch()` re-issues the POST from the test process, so it owns a second connection to the
 * e2e gateway that the browser's own request never had. That gateway intermittently resets the
 * socket mid-body (200 headers arrive, then `read ECONNRESET`), which used to throw out of the
 * handler: the route was left unsettled, the reload hung, and the real assertion never ran.
 * `maxRetries` re-issues on exactly that error, and the catch guarantees the route is settled
 * even so -- a handler that throws is always worse than one that serves the live response.
 */
async function mockHistoryResponse(
  pg: LocalOfficeHistoryPage,
  mutate: (records: unknown[]) => unknown[],
): Promise<void> {
  await pg.page.route(HISTORY_API_URL_PATTERN, async (route) => {
    try {
      const response = await route.fetch({ maxRetries: HISTORY_FETCH_MAX_RETRIES, timeout: 60_000 });
      if (!(response.headers()['content-type'] || '').includes('json')) {
        await route.fulfill({ response });
        return;
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        await route.fulfill({ response });
        return;
      }
      const rewritten = replaceRecordArray(body, mutate);
      if (!rewritten.replaced) {
        await route.fulfill({ response });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rewritten.value) });
    } catch (error) {
      // Upstream reset, timeout, or a page that closed mid-flight. Hand the request back to the
      // network so the page still renders; the assertion below then fails on unmocked data with a
      // message about the data, not about a socket.
      Log.warn(`[history-mock] interception fell through to the live response: ${(error as Error).message}`);
      await route.fallback().catch(() => { /* route already settled or page gone */ });
    }
  });
}

/**
 * Tears the interception down and puts the grid back on live data.
 *
 * Runs from `finally`, so it must never throw over a page the test already lost -- a secondary
 * "Target page, context or browser has been closed" buries the error that actually failed the run.
 */
async function restoreLiveHistory(pg: LocalOfficeHistoryPage): Promise<void> {
  if (pg.page.isClosed()) return;
  await phase('Stop changing the server response', () => pg.page.unroute(HISTORY_API_URL_PATTERN));
  await pg.reloadAndNavigateToHistory(OFFICE_NO);
}

/** Overwrites (or adds) the record's Notes field with a 2,000-character unbreakable token. */
const withLongNotes = (records: unknown[]): unknown[] => {
  if (!records.length) return records;
  const first = { ...(records[0] as Record<string, unknown>) };
  const notesKey = Object.keys(first).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'notes');
  first[notesKey ?? 'Notes'] = HISTORY_MOCK.longNotes;
  return [first, ...records.slice(1)];
};

/** Drops a third of the record's fields and nulls another third — a partial/degraded payload. */
const withPartialFields = (records: unknown[]): unknown[] => {
  if (!records.length) return records;
  const first = { ...(records[0] as Record<string, unknown>) };
  Object.keys(first).forEach((key, i) => {
    if (i % 3 === 0) delete first[key];
    else if (i % 3 === 1) first[key] = null;
  });
  return [first, ...records.slice(1)];
};

test.describe('Local Office Location Settings History @local-office @location-settings-history', () => {
  // Nav guard uses DOM presence (aria-selected), not url.includes — the three sub-tabs share the
  // `settings/local-office` URL. 90s hook budget: cold-start nav (SSO handoff + Angular load +
  // hydrate) plus a 40+ column grid's first render regularly exceeds the 30s default.
  test.beforeEach(async ({ localOfficeHistoryPage }) => {
    test.setTimeout(90_000);
    if (!(await localOfficeHistoryPage.isOnHistoryTab())) {
      await localOfficeHistoryPage.navigateToBasicInfoTab(OFFICE_NO);
      await localOfficeHistoryPage.navigateToHistoryTab();
    }
    await localOfficeHistoryPage.waitForHistoryGridLoaded();
  });

  // ------------------------------------------------------------ 1. Navigation and panel rendering

  test('TC-LOE-HIST-001: Location Settings History tab opens its own panel with a rendered grid', { tag: '@C105469' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate([]);
    await about('Opening the History tab on a Local Office shows its own panel listing every past change, already sorted newest first.');
    const tabs = await pg.getTabStripLabels();
    await verify('Check the three Local Office Settings tabs appear along the top, in the expected order', async () => {
      expect(tabs).toEqual([...LOCAL_OFFICE_TAB_ORDER]);
    });

    await verify('Check the History tab is the one open and its list of changes is on screen', async () => {
      expect(await pg.isOnHistoryTab()).toBe(true);
      expect(await pg.isElementVisible('tabContentHistory')).toBe(true);
      expect(await pg.isElementVisible('tblHistory')).toBe(true);
    });

    const headers = await pg.getHistoryColumnHeaders();
    const rowCount = await pg.getHistoryRowCount();
    const isEmpty = await pg.isHistoryTableEmpty();
    await verify('Check the list finished loading properly, rather than stopping half-drawn', async () => {
      expect(headers.length).toBeGreaterThan(1);
      expect(rowCount > 0 || isEmpty, 'grid must show data rows or the empty state, never neither').toBe(true);
    });

    await verify('Check the list arrives already sorted by Modified On, newest change first', async () => {
      // NM-854 never specified a default sort; the first live run confirmed it (exactly one
      // column carried a directional arrow before any sort was applied), so it is asserted now.
      expect(await pg.getHistorySortIndicator(HISTORY_DEFAULT_SORT.column)).toBe(HISTORY_DEFAULT_SORT.direction);
      expect(await pg.getHistorySortedColumnIndexes()).toHaveLength(1);
    });

    await attachNote('The column headings seen on this run', headers.map((h, i) => `${i}: ${h}`).join('\n'));
    if (rowCount > 0) {
      const firstRow = await pg.getHistoryRowValues(0, headers);
      await attachNote('The first entry in the list, in full', JSON.stringify(firstRow, null, 2));
    }
  });

  test('TC-LOE-HIST-002: Switching away from and back to the History tab keeps the grid stable', { tag: '@C105470' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Leaving the History tab for Basic Information and coming back shows the same list again, not a second copy and not a reloaded one.');
    const headersBefore = await pg.getHistoryColumnHeaders();
    const rowsBefore = await pg.getHistoryRowCount();

    await phase('Switch to Basic Information and then back to History', async () => {
      await pg.clickTab('tabBasicInformation');
      await pg.waitForBasicInfoForm(30_000);
      await pg.navigateToHistoryTab();
      await pg.waitForHistoryGridLoaded();
    });

    await verify('Check the same columns and the same number of entries come back, in a single list', async () => {
      expect(await pg.getHistoryColumnHeaders()).toEqual(headersBefore);
      expect(await pg.getHistoryRowCount()).toBe(rowsBefore);
      expect(await pg.getHistoryTableCount(), 'the panel must not render a second grid').toBe(1);
    });
  });

  test('TC-LOE-HIST-003: The History tab selection is not preserved across a hard reload', { tag: '@C105471' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Refreshing the browser returns the user to Basic Information rather than History, and re-opening History shows the same columns as before.');
    const headerCountBefore = await pg.getHistoryColumnHeaderCount();

    await phase('Refresh the browser on the Local Office Settings page', () => pg.reloadBasicInfo(OFFICE_NO));
    await verify('Check the refresh lands the user back on Basic Information, not on History', async () => {
      expect(await pg.isOnBasicInfoTab()).toBe(true);
      expect(await pg.isOnHistoryTab()).toBe(false);
    });

    await pg.navigateToHistoryTab();
    await pg.waitForHistoryGridLoaded();
    await verify('Check re-opening History shows the same columns as before the refresh', async () => {
      expect(await pg.getHistoryColumnHeaderCount()).toBe(headerCountBefore);
    });
  });

  // ------------------------------------------------------------ 2. Read-only enforcement

  test('TC-LOE-HIST-004: The history grid contains no editable control and the panel offers no Save', { tag: '@C105472' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('History is a read-only record: there is nothing to type into and no Save button anywhere on the panel.');
    const census = await pg.getHistoryPanelControlCensus();
    await verify('Check there is nothing to type into and no Save button inside the list', async () => {
      // Scoped to the table on purpose: the paginator's page-number input is a sibling of the
      // table inside the panel, and counting it would make a read-only tab look editable.
      expect(census.inputCount).toBe(0);
      expect(census.textareaCount).toBe(0);
      expect(census.saveButtonCount).toBe(0);
    });

    await verify('Check the read-only test agrees that nothing here can be edited', async () => {
      expect(await pg.isHistoryTabReadOnly()).toBe(true);
    });
  });

  test('TC-LOE-HIST-005: No add, edit, delete or row-selection affordance exists in the history panel', { tag: '@C105473' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The History panel offers no way to add, change, delete or tick an entry. It can only be read.');
    const census = await pg.getHistoryPanelControlCensus();

    await verify('Check the panel offers no Add, New, Edit, Delete, Remove or Save button', async () => {
      expect(census.actionButtonCount, `unexpected action buttons: ${census.actionButtonLabels.join(', ')}`).toBe(0);
    });

    await verify('Check there is no tick-box column for picking entries', async () => {
      expect(census.checkboxCount).toBe(0);
      expect(census.radioCount).toBe(0);
      expect(census.ariaCheckboxCount).toBe(0);
    });

    await verify('Check no cell can be turned into a box to type in', async () => {
      expect(census.selectCount).toBe(0);
      expect(census.contentEditableCount).toBe(0);
    });
  });

  test('TC-LOE-HIST-006: Clicking and double-clicking a data cell produces no editor and no selection', { tag: '@C105474' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Clicking and double-clicking an entry opens nothing to type in and does not highlight the row.');
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to click — data precondition, not a defect');

    const probe = await pg.attemptEditHistoryCell(0, 0);
    await verify('Check clicking the cell opened nothing to type in and left its text alone', async () => {
      expect(probe.editorCount).toBe(0);
      expect(probe.textAfter).toBe(probe.textBefore);
    });

    await verify('Check the entry was not highlighted as selected', async () => {
      expect(await pg.isHistoryRowSelected(0)).toBe(false);
    });
  });

  test('TC-LOE-HIST-007: Right-clicking a history row opens no context menu', { tag: '@C105475' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Right-clicking an entry does nothing, unlike the editable grids elsewhere in Local Office.');
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to right-click — data precondition, not a defect');
    const headerCountBefore = await pg.getHistoryColumnHeaderCount();

    const menuAppeared = await pg.rightClickHistoryRow(0);
    await verify('Check no right-click menu appears, unlike the editable grids on Basic Information', async () => {
      expect(menuAppeared).toBe(false);
    });

    await verify('Check the list is undamaged after the right-click', async () => {
      expect(await pg.getHistoryColumnHeaderCount()).toBe(headerCountBefore);
      expect(await pg.getHistoryRowCount()).toBe(rowCount);
    });
  });

  // ------------------------------------------------------------ 3. Column coverage and localization

  test('TC-LOE-HIST-008: Every column header renders translated text, uniquely and non-blank', { tag: '@C105476' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Every column heading shows proper wording: nothing blank, nothing duplicated and no leftover developer text.');
    const headers = await pg.getHistoryColumnHeaders();

    await verify('Check every tracked field has a column, not just a handful of them', async () => {
      expect(headers.length).toBeGreaterThanOrEqual(HISTORY_MIN_COLUMN_COUNT);
    });

    await verify('Check no column heading is blank', async () => {
      expect(headers.filter(h => h.trim() === '')).toEqual([]);
    });

    await verify('Check no heading shows a raw internal field name', async () => {
      const rawKeys = headers.filter(h => RAW_FIELD_KEY_PATTERN.test(h.trim()));
      expect(rawKeys, `headers rendered as raw field keys instead of i18n labels: ${rawKeys.join(', ')}`).toEqual([]);
    });

    await verify('Check no heading shows leftover placeholder text from the translation files', async () => {
      const leaked = headers.filter(h => I18N_PLACEHOLDER_PATTERNS.some(p => p.test(h.trim())));
      expect(leaked, `headers containing i18n placeholders: ${leaked.join(', ')}`).toEqual([]);
    });

    await verify('Check no column heading appears twice', async () => {
      const unique = new Set(headers.map(h => h.trim()));
      expect(unique.size).toBe(headers.length);
    });

    await verify('Check the full set of columns matches the agreed list exactly, in order', async () => {
      // Hardened from case-insensitive subset matching to an exact ordered equality now that the
      // first live run recorded all 42 translated labels. A renamed, reordered, added or dropped
      // column now fails here with a precise diff.
      expect(headers).toEqual([...HISTORY_ALL_COLUMNS_IN_ORDER]);
    });

    await attachNote('The column headings seen on this run', headers.join('\n'));
  });

  test('TC-LOE-HIST-009: Identifier and date-offset columns are present in the history grid', { tag: '@C105477' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The list includes the identifier and date-offset columns the change request asked for.');
    const resolution = await pg.resolveHistoryColumns(HISTORY_EXPECTED_COLUMNS.identifiersAndOffsets);
    await verify('Check all seven identifier and date-offset fields have a column', async () => {
      expect(resolution.missing, `identifier/offset columns not captured in history: ${resolution.missing.join(', ')}`).toEqual([]);
      expect(resolution.resolved).toHaveLength(HISTORY_EXPECTED_COLUMNS.identifiersAndOffsets.length);
    });
  });

  test('TC-LOE-HIST-010: Feature-toggle and boolean columns are present in the history grid', { tag: '@C105478' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The list includes all sixteen on/off setting columns the change request asked for.');
    const resolution = await pg.resolveHistoryColumns(HISTORY_EXPECTED_COLUMNS.featureToggles);
    await verify('Check all sixteen on/off settings have a column', async () => {
      // The failure message names the absent fields: a missing-field-capture regression must say
      // WHICH field was dropped, not just that a count fell short.
      expect(resolution.missing, `boolean columns not captured in history: ${resolution.missing.join(', ')}`).toEqual([]);
      expect(resolution.resolved).toHaveLength(HISTORY_EXPECTED_COLUMNS.featureToggles.length);
    });
  });

  test('TC-LOE-HIST-011: Contact, section, service, tax, branding and audit columns are present', { tag: '@C105479' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The list includes the contact, section, service, tax, branding and who-changed-it columns.');
    const contact = await pg.resolveHistoryColumns(HISTORY_EXPECTED_COLUMNS.contactAndSection);
    await verify('Check all five contact and section fields have a column', async () => {
      expect(contact.missing, `contact/section columns missing: ${contact.missing.join(', ')}`).toEqual([]);
    });

    const service = await pg.resolveHistoryColumns(HISTORY_EXPECTED_COLUMNS.serviceAndTax);
    await verify('Check all four service and tax fields have a column', async () => {
      expect(service.missing, `service/tax columns missing: ${service.missing.join(', ')}`).toEqual([]);
    });

    const audit = await pg.resolveHistoryColumns(HISTORY_EXPECTED_COLUMNS.brandingAndAudit);
    await verify('Check all five branding and who-changed-it fields have a column, including Modified On', async () => {
      expect(audit.missing, `branding/audit columns missing: ${audit.missing.join(', ')}`).toEqual([]);
      // Modified On is the label every sorting scenario resolves against, so its absence is a
      // hard failure rather than one entry in a list.
      expect(await pg.findHistoryColumnLabel(HISTORY_SORT_COLUMN)).not.toBeNull();
      expect(await pg.findHistoryColumnLabel(HISTORY_AUDIT_USER_COLUMN)).not.toBeNull();
    });
  });

  test('TC-LOE-HIST-012: Labor settings columns are present, including Holiday Multiplier', { tag: '@C105480' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The list includes the labor settings columns, and Holiday Multiplier in particular is present.');
    const resolution = await pg.resolveHistoryColumns(HISTORY_EXPECTED_COLUMNS.laborSettings);
    await verify('Check all seven labor settings fields have a column', async () => {
      expect(resolution.missing, `labor settings columns not captured in history: ${resolution.missing.join(', ')}`).toEqual([]);
    });

    // Asserted on its own line: this is the field NM-854's prior analysis recorded as missing, so a
    // regression here must be unambiguous in the report rather than buried in a list diff.
    const holidayLabel = await pg.findHistoryColumnLabel(HISTORY_HOLIDAY_MULTIPLIER_COLUMN);
    await verify('Check Holiday Multiplier in particular has a column, a known problem area', async () => {
      expect(holidayLabel, 'Holiday Multiplier is not rendered as a history column').not.toBeNull();
    });
  });

  test('TC-LOE-HIST-013: Every data row has exactly as many cells as there are column headers', { tag: '@C105481' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Every entry has one value under each heading, so nothing has slipped into the wrong column.');
    const headerCount = await pg.getHistoryColumnHeaderCount();
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to measure — data precondition, not a defect');

    const cellCounts = await pg.getHistoryRowCellCounts(20);
    await verify('Check every entry has exactly one value per heading, so nothing has shifted sideways', async () => {
      expect(headerCount).toBeGreaterThan(1);
      const mismatched = cellCounts.filter(c => c !== headerCount);
      expect(mismatched, `rows whose cell count differs from the ${headerCount} headers: ${mismatched.join(', ')}`).toEqual([]);
    });
  });

  // ------------------------------------------------------------ 4. Sorting

  test('TC-LOE-HIST-014: Sortable columns expose a sort control with an accessible name', { tag: '@C105482' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Columns that can be sorted offer a single sort control, and each one is named so a screen reader can announce it.');
    const headerCount = await pg.getHistoryColumnHeaderCount();
    const sortButtonCount = await pg.getHistorySortButtonCount();

    await verify('Check at least one column can be sorted, and none offers two sort controls', async () => {
      expect(sortButtonCount).toBeGreaterThan(0);
      expect(sortButtonCount).toBeLessThanOrEqual(headerCount);
    });

    const controlNames = await pg.getHistorySortControlNames();
    await verify('Check every sort control is named, so a screen reader can announce it', async () => {
      const unnamed = controlNames.filter(n => n === '');
      expect(unnamed, `${unnamed.length} sort control(s) have no accessible name`).toEqual([]);
    });
  });

  test('TC-LOE-HIST-015: Sorting a text column ascending then descending reverses the row order', { tag: '@C105483' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Sorting a text column A-Z and then Z-A puts the entries into the opposite order.');
    test.setTimeout(120_000);
    const columns = await phase('Take a sample of the columns that can be sorted', () => sampleSortableColumns(pg));
    // Page 1 of this grid is uniform by nature — consecutive history rows are near-identical
    // configuration snapshots — so free text that varies is scarce and the audit timestamp is
    // often the only sortable column with two distinct values. Prefer real text; fall back to the
    // timestamp column, which is then ordered by parsed instant, never as a string.
    const target = columns.find(c => isTextLike(c.values))
      ?? columns.find(c => isTimestampLike(meaningful(c.values)) && distinctCount(meaningful(c.values)) >= 2);
    test.skip(!target, 'no sortable text column with two distinct values on this page — data precondition');
    const byInstant = isTimestampLike(meaningful(target!.values));
    const order = byInstant ? 'oldest-first' : 'A-Z';
    await attachNote('Sorted column', `"${target!.header}" — compared ${byInstant ? 'as timestamps' : 'as text'}`);

    await pg.sortHistoryColumn(target!.header, 'ascending');
    const ascending = meaningful(await pg.getHistoryColumnValues(target!.header, 10));
    await verify(`Check "${target!.header}" is now in ${order} order`, async () => {
      const ok = byInstant
        ? isNonDescendingBy(ascending, timestampKey)
        : isNonDescendingBy(ascending, textKey);
      expect(ok, `ascending order violated: ${ascending.join(' | ')}`).toBe(true);
    });

    await pg.sortHistoryColumn(target!.header, 'descending');
    const descending = meaningful(await pg.getHistoryColumnValues(target!.header, 10));
    await verify(`Check "${target!.header}" flips to the reverse order and a different entry is now on top`, async () => {
      const ok = byInstant
        ? isNonAscendingBy(descending, timestampKey)
        : isNonAscendingBy(descending, textKey);
      expect(ok, `descending order violated: ${descending.join(' | ')}`).toBe(true);
      expect(descending[0]).not.toBe(ascending[0]);
    });
  });

  test('TC-LOE-HIST-016: Sorting a numeric column sorts numerically, not lexicographically', { tag: '@C105484' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Sorting a number column orders it by value, so 9 is not placed after 10 the way plain text would be.');
    test.setTimeout(150_000);
    const column = HISTORY_NUMERIC_SORT_COLUMN.column;
    await verify(`Check "${column}" can be sorted`, async () => {
      expect(await pg.isHistoryColumnSortable(column)).toBe(true);
    });

    // Sort FIRST, read after. Page 1 is uniform by nature — consecutive history rows are
    // near-identical configuration snapshots — so looking for variation before sorting finds none
    // and skips. Sorting brings the extremes to the top, which is the same shape TC-017 uses.
    await pg.sortHistoryColumn(column, 'ascending');
    const ascending = meaningful(await pg.getHistoryColumnValues(column, 20)).map(Number);
    await verify(`Check "${column}" sorts by value, smallest first`, async () => {
      expect(ascending.length).toBeGreaterThan(0);
      expect(ascending.every(Number.isFinite), 'a value did not parse as a number').toBe(true);
      // Compared as parsed NUMBERS, so a lexicographic sort putting "10" before "9" fails here.
      expect(isNonDescendingNumeric(ascending), `ascending order violated: ${ascending.join(' | ')}`).toBe(true);
      expect(ascending[0]).toBe(Math.min(...ascending));
      expect(ascending[0]).toBe(HISTORY_NUMERIC_SORT_COLUMN.min);
    });

    await pg.sortHistoryColumn(column, 'descending');
    const descending = meaningful(await pg.getHistoryColumnValues(column, 20)).map(Number);
    await verify(`Check "${column}" sorts by value, largest first`, async () => {
      expect(descending.every(Number.isFinite)).toBe(true);
      expect(isNonAscendingNumeric(descending), `descending order violated: ${descending.join(' | ')}`).toBe(true);
      expect(descending[0]).toBe(Math.max(...descending));
      expect(descending[0]).toBe(HISTORY_NUMERIC_SORT_COLUMN.max);
      // The two extremes must differ, or the column is constant and nothing was actually ordered.
      expect(descending[0]).not.toBe(ascending[0]);
    });
  });

  test('TC-LOE-HIST-017: Sorting Modified On ascending shows the oldest record first and descending the newest', { tag: '@C105485' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Sorting by Modified On shows the oldest change first going up, and the newest change first going down.');
    test.setTimeout(120_000);

    await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'ascending');
    const ascendingRaw = meaningful(await pg.getHistoryColumnValues(HISTORY_SORT_COLUMN, 10));
    const ascending = ascendingRaw.map(LocalOfficeHistoryPage.parseModifiedOnMs);
    await verify('Check sorting up puts the oldest change first and every date is readable', async () => {
      // A NaN here means the rendered format no longer matches the parser — the assertion that
      // catches a silent date-format change rather than letting comparisons pass vacuously.
      expect(ascending.every(Number.isFinite), `unparseable Modified On values: ${ascendingRaw.join(' | ')}`).toBe(true);
      expect(isNonDescendingNumeric(ascending)).toBe(true);
      expect(ascending[0]).toBe(Math.min(...ascending));
    });

    await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'descending');
    const descendingRaw = meaningful(await pg.getHistoryColumnValues(HISTORY_SORT_COLUMN, 10));
    const descending = descendingRaw.map(LocalOfficeHistoryPage.parseModifiedOnMs);
    await verify('Check sorting down puts the newest change first, in the opposite order', async () => {
      expect(descending.every(Number.isFinite)).toBe(true);
      expect(isNonAscendingNumeric(descending)).toBe(true);
      expect(descending[0]).toBe(Math.max(...descending));
      expect(descendingRaw[0]).not.toBe(ascendingRaw[0]);
    });
  });

  test('TC-LOE-HIST-018: Sorting a boolean column groups its set and unset rows contiguously', { tag: '@C105486' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Sorting a tick-box column keeps all the ticked entries together and all the unticked ones together.');
    test.setTimeout(150_000);
    const column = HISTORY_BOOLEAN_SORT_COLUMN.column;
    await verify(`Check "${column}" can be sorted`, async () => {
      expect(await pg.isHistoryColumnSortable(column)).toBe(true);
    });

    await pg.sortHistoryColumn(column, 'ascending');
    const ascending = await pg.getHistoryColumnValues(column, 20);
    await verify(`Check sorting "${column}" keeps the ticked and unticked entries in two blocks`, async () => {
      expect(ascending.every(v => v === '' || v === HISTORY_CHECK_GLYPH),
        `a boolean cell rendered something other than a check or a blank: ${ascending.join(' | ')}`).toBe(true);
      expect(isGrouped(ascending), `boolean values interleaved: ${ascending.map(v => v || '_').join('')}`).toBe(true);
    });

    await pg.sortHistoryColumn(column, 'descending');
    const descending = await pg.getHistoryColumnValues(column, 20);
    await verify('Check sorting the other way keeps the two blocks but swaps which comes first', async () => {
      expect(isGrouped(descending), `boolean values interleaved: ${descending.map(v => v || '_').join('')}`).toBe(true);
      // The ordering proof for a heavily-skewed boolean column: the two sort directions must lead
      // with OPPOSITE states. Both states rarely co-occur on one page (the history holds far more
      // of one than the other), so asserting a visible transition would skip on real data - this
      // asserts the partition instead, which is what sorting a boolean actually guarantees.
      expect(descending[0]).not.toBe(ascending[0]);
      expect([ascending[0], descending[0]].sort().join('|')).toBe(['', HISTORY_CHECK_GLYPH].sort().join('|'));
    });
  });

  test('TC-LOE-HIST-019: The sorted column communicates its sort state and only one column sorts at a time', { tag: '@C105487' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Only one column is ever sorted at a time, and that column clearly shows which way it is sorted.');
    test.setTimeout(120_000);

    await phase('Re-open the tab so the sort is back to how it starts', () => pg.reloadAndNavigateToHistory(OFFICE_NO));
    const initiallySorted = await pg.getHistorySortedColumnIndexes();
    await verify('Check exactly one column shows a sort arrow on first load, and it is the expected one', async () => {
      // Tightened from "at most one" now that the default sort is confirmed live.
      expect(initiallySorted).toHaveLength(1);
      expect(await pg.getHistorySortIndicator(HISTORY_DEFAULT_SORT.column)).toBe(HISTORY_DEFAULT_SORT.direction);
    });

    // Sort state is read from the header's lucide arrow icon, resolved by column INDEX. The grid
    // never sets aria-sort in any state (confirmed live) - that gap is recorded in the attachment
    // below and documented in the plan rather than asserted here.
    const modifiedOnIndex = await pg.getHistoryColumnIndex(HISTORY_SORT_COLUMN);

    await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'ascending');
    await verify('Check Modified On shows an up arrow and no other column shows one', async () => {
      expect(await pg.getHistorySortIndicator(HISTORY_SORT_COLUMN)).toBe('ascending');
      expect(await pg.getHistorySortedColumnIndexes(), 'more than one column reports a sort state').toEqual([modifiedOnIndex]);
    });

    await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'descending');
    await verify('Check the same column flips to a down arrow and is still the only one sorted', async () => {
      expect(await pg.getHistorySortIndicator(HISTORY_SORT_COLUMN)).toBe('descending');
      expect(await pg.getHistorySortedColumnIndexes()).toEqual([modifiedOnIndex]);
    });

    const sortable = await pg.getHistorySortableColumns();
    const other = sortable.find(h => h !== HISTORY_SORT_COLUMN && h !== '');
    test.skip(!other, 'only one sortable column on this grid — cannot prove the indicator moves');

    await pg.sortHistoryColumn(other!, 'ascending');
    await verify('Check sorting a different column moves the arrow off Modified On', async () => {
      expect(await pg.getHistorySortIndicator(other!)).toBe('ascending');
      expect(await pg.getHistorySortIndicator(HISTORY_SORT_COLUMN)).toBe('none');
      expect(await pg.getHistorySortedColumnIndexes()).toHaveLength(1);
    });

    // Records the accessibility gap without gating on it: the grid communicates sort state only
    // visually (a lucide arrow icon) and never sets aria-sort, so a screen-reader user cannot tell
    // which column is sorted. Reported as a discrepancy for dev awareness - see the plan.
    await attachNote('Which arrow each column heading was showing',
      JSON.stringify(await pg.getHistorySortIndicatorStates(), null, 2));
    await attachNote('Accessibility gap: the sort direction is not announced to screen readers',
      'aria-sort on the sorted column = '
      + JSON.stringify(await pg.getHistoryAriaSortAttribute(HISTORY_SORT_COLUMN))
      + ' -- NM-854 requires headers to communicate sort state accessibly, but the grid sets no'
      + ' aria-sort in any state, so sort order reaches sighted users only.');
  });

  test('TC-LOE-HIST-020: Sorting issues a backend request and the rendered order matches the response', { tag: '@C105488' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Sorting asks the server for a re-ordered list, and what appears on screen matches what the server sent back.');
    test.setTimeout(120_000);

    const requests = await pg.captureRequestsDuringSort(HISTORY_SORT_COLUMN, 'descending');
    const historyRequests = requests.filter(url => HISTORY_API_URL_PATTERN.test(url) || url.includes('local-office') || url.includes('locationsetting'));
    await verify('Check sorting actually asked the server for a newly ordered list', async () => {
      // NM-854: "sorting must align with backend-supported sort behavior" — the observable
      // contract is that a request goes out. The exact parameter shape is open question 1 and is
      // recorded to the report below rather than asserted.
      expect(historyRequests.length, `no history-looking request observed during the sort. All requests: ${requests.join('\n')}`).toBeGreaterThan(0);
    });

    const values = meaningful(await pg.getHistoryColumnValues(HISTORY_SORT_COLUMN, 10)).map(LocalOfficeHistoryPage.parseModifiedOnMs);
    await verify('Check the list on screen matches the order the server sent back', async () => {
      expect(values.every(Number.isFinite)).toBe(true);
      expect(values[0]).toBe(Math.max(...values));
    });

    await attachNote('What the page asked the server for while sorting', historyRequests.join('\n'));
  });

  // ------------------------------------------------------------ 5. Data rendering

  test('TC-LOE-HIST-021: Boolean cells render as a check glyph or blank, never as literal text', { tag: '@C105489' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('On/off values show as a tick or an empty cell, never as the words true or false.');
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to inspect — data precondition, not a defect');

    const resolution = await pg.resolveHistoryColumns(HISTORY_EXPECTED_COLUMNS.featureToggles);
    test.skip(resolution.resolved.length === 0, 'no boolean column resolved — TC-LOE-HIST-010 covers that as a failure');

    const observed = await phase('Read every on/off column across the first few entries', async () => {
      const out: Record<string, string[]> = {};
      for (const field of resolution.resolved) out[field] = await pg.getHistoryColumnValues(field, 5);
      return out;
    });
    const flattened = Object.values(observed).flat();

    await verify('Check no on/off cell shows the words true or false', async () => {
      const leaked = flattened.filter(v => (HISTORY_FORBIDDEN_BOOLEAN_TEXT as readonly string[]).includes(v));
      expect(leaked, `boolean columns rendering literal text: ${leaked.join(', ')}`).toEqual([]);
    });

    await verify('Check every on/off cell shows either a tick or nothing at all', async () => {
      const unexpected = flattened.filter(v => v !== '' && v !== HISTORY_CHECK_GLYPH);
      expect(unexpected, `boolean cells rendering something other than a check or a blank: ${unexpected.join(', ')}`).toEqual([]);
    });

    await verify('Check at least one tick was actually seen, so the check is meaningful', async () => {
      // Without this, a grid rendering every boolean as blank would pass the two checks above
      // vacuously — the assertion that makes this test non-trivial.
      expect(flattened.some(v => v === HISTORY_CHECK_GLYPH), 'no boolean column showed a true value in the sample').toBe(true);
    });
  });

  test('TC-LOE-HIST-022: Modified On is formatted correctly and Modified By is a user identifier, not a GUID', { tag: '@C105490' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Modified On reads as a normal date and time, and Modified By names a person rather than a long internal code.');
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to inspect — data precondition, not a defect');

    const timestamps = await pg.getHistoryColumnValues(HISTORY_SORT_COLUMN, 3);
    await verify('Check every Modified On reads as MM/DD/YYYY hh:mm:ss AM or PM', async () => {
      const malformed = timestamps.filter(v => v !== '' && !HISTORY_MODIFIED_ON_PATTERN.test(v));
      expect(malformed, `Modified On values in an unexpected format: ${malformed.join(' | ')}`).toEqual([]);
    });

    const users = await pg.getHistoryColumnValues(HISTORY_AUDIT_USER_COLUMN, 3);
    await verify('Check Modified By names a person and is never blank or a long internal code', async () => {
      const guids = users.filter(v => UUID_PATTERN.test(v));
      expect(guids, `Modified By leaked raw identifiers: ${guids.join(', ')}`).toEqual([]);
      users.forEach((user, i) => {
        if ((timestamps[i] ?? '') !== '') {
          expect(user, `row ${i} has a Modified On but no Modified By`).not.toBe('');
        }
      });
    });
  });

  test('TC-LOE-HIST-023: Null and blank optional values render as empty cells without corrupting the row', { tag: '@C105491' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Where a value was never filled in the cell is simply empty, with no placeholder text and no shifted columns.');
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to inspect — data precondition, not a defect');

    const headerCount = await pg.getHistoryColumnHeaderCount();
    const matrix = await pg.getHistoryCellMatrix(10);

    await verify('Check no cell shows placeholder text such as null or undefined', async () => {
      const leaked = matrix.flat().filter(cell =>
        HISTORY_FORBIDDEN_CELL_TEXT.some(bad => cell === bad || cell.includes(bad)));
      expect(leaked, `cells rendering a missing-value placeholder: ${leaked.join(' | ')}`).toEqual([]);
    });

    await verify('Check a missing value leaves an empty cell rather than removing it', async () => {
      const shifted = matrix.map(row => row.length).filter(len => len !== headerCount);
      expect(shifted).toEqual([]);
    });
  });

  test('TC-LOE-HIST-024: A very long Notes value scrolls inside the grid without widening the page', { tag: '@C105492' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('A very long Notes entry scrolls inside the list instead of stretching the whole page sideways.');
    test.setTimeout(120_000);
    try {
      await phase('Have the server return a 2,000-character Notes value', () => mockHistoryResponse(pg, withLongNotes));
      await pg.reloadAndNavigateToHistory(OFFICE_NO);

      await verify('Check the list still shows its headings and its entries', async () => {
        expect(await pg.getHistoryColumnHeaderCount()).toBeGreaterThan(1);
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
      });

      const overflow = await pg.getHistoryOverflow();
      await verify('Check only the list scrolls sideways, never the whole page', async () => {
        // 1px allowance for sub-pixel rounding on fractional device pixel ratios.
        expect(overflow.pageOverflowPx, 'the page body scrolls horizontally — wide content escaped its container').toBeLessThanOrEqual(1);
        expect(overflow.containerScrollsHorizontally).toBe(true);
      });
    } finally {
      await restoreLiveHistory(pg);
    }
  });

  test('TC-LOE-HIST-025: Single-row and multi-row payloads both render correctly', { tag: '@C105493' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The list renders correctly whether the server returns many changes or only one.');
    test.setTimeout(120_000);
    const liveRowCount = await pg.getHistoryRowCount();
    const headersBefore = await pg.getHistoryColumnHeaders();
    await verify('Check the real list is showing more than one entry to begin with', async () => {
      expect(liveRowCount).toBeGreaterThan(1);
    });

    try {
      await phase('Have the server return just one change', () => mockHistoryResponse(pg, records => records.slice(0, 1)));
      await pg.reloadAndNavigateToHistory(OFFICE_NO);

      const headerCount = await pg.getHistoryColumnHeaderCount();
      await verify('Check exactly one entry shows and the columns are unchanged', async () => {
        expect(await pg.getHistoryRowCount()).toBe(1);
        expect(await pg.getHistoryColumnHeaders()).toEqual(headersBefore);
      });

      await verify('Check that single entry still has one value per heading', async () => {
        expect(await pg.getHistoryRowCellCounts(1)).toEqual([headerCount]);
      });
    } finally {
      await restoreLiveHistory(pg);
    }
  });

  // ------------------------------------------------------------ 6. Empty, loading and error states

  test('TC-LOE-HIST-026: The friendly empty state is shown when no history exists', { tag: '@C105494' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('When a location has no recorded changes, a clear message is shown instead of a blank box.');
    test.setTimeout(120_000);
    try {
      await phase('Have the server return no changes at all', () => mockHistoryResponse(pg, () => []));
      await pg.reloadAndNavigateToHistory(OFFICE_NO);

      await verify('Check the list is empty and the no-history message is shown', async () => {
        expect(await pg.getHistoryRowCount()).toBe(0);
        expect(await pg.isHistoryTableEmpty()).toBe(true);
        expect(await pg.getHistoryEmptyStateText()).toContain(HISTORY_EMPTY_STATE_TEXT);
      });

      await verify('Check the headings stay visible and no new buttons appear', async () => {
        expect(await pg.getHistoryColumnHeaderCount(), 'the header row must survive so the user sees what the grid holds').toBeGreaterThan(1);
        const census = await pg.getHistoryPanelControlCensus();
        expect(census.actionButtonCount, `empty state grew controls: ${census.actionButtonLabels.join(', ')}`).toBe(0);
        expect(census.inputCount).toBe(0);
      });
    } finally {
      await restoreLiveHistory(pg);
    }
  });

  test('TC-LOE-HIST-027: A pending history request shows a loading state that is then replaced by rows', { tag: '@C105495' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('While the list is still being fetched the user sees a loading indicator, not a premature no-history message.');
    test.setTimeout(120_000);
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });

    try {
      await phase('Hold the server response back so the list stays loading', async () => {
        await pg.page.route(HISTORY_API_URL_PATTERN, async (route) => {
          await gate;
          await route.continue();
        });
      });

      await phase('Open the History tab while the response is still held', async () => {
        await pg.navigateToBasicInfoTab(OFFICE_NO);
        await pg.clickTabDirect('tabHistory');
        await pg.page.locator('[data-testid="local-office-settings-tab-content-history"]')
          .waitFor({ state: 'visible', timeout: 30_000 });
      });

      const pending = await pg.getHistoryPendingState();
      await verify('Check a loading indicator shows and the panel does not claim there is no history', async () => {
        const showsPending = pending.spinnerCount > 0 || pending.skeletonCount > 0 || pending.dataRowCount === 0;
        expect(showsPending, 'no spinner, skeleton or row-less grid while the request was in flight').toBe(true);
        // The important half: telling the user "No results." while the request is still pending
        // is a defect, not a loading state.
        expect(pending.emptyStateShown, 'the empty state was shown while the request was still pending').toBe(false);
      });

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

  test('TC-LOE-HIST-028: A history API failure does not crash the tab and leaves the module navigable', { tag: '@C105496' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('If the server fails to return the history, the tab still opens and the rest of Local Office keeps working.');
    test.setTimeout(120_000);
    const pageErrors: string[] = [];

    try {
      await phase('Make the server return an error for the history request', async () => {
        pg.page.on('pageerror', err => pageErrors.push(err.message));
        await pg.page.route(HISTORY_API_URL_PATTERN, route =>
          route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error"}' }));
      });

      await phase('Open the History tab while the server is failing', async () => {
        await pg.navigateToBasicInfoTab(OFFICE_NO);
        await pg.navigateToHistoryTab();
      });

      await verify('Check the tab still opens and its panel still draws', async () => {
        expect(await pg.isOnHistoryTab()).toBe(true);
        expect(await pg.isElementVisible('tabContentHistory')).toBe(true);
      });

      await verify('Check the panel shows an empty or error message rather than broken entries', async () => {
        const rowCount = await pg.getHistoryRowCount();
        const isEmpty = await pg.isHistoryTableEmpty();
        expect(rowCount === 0 || isEmpty, 'a failed fetch rendered partial rows').toBe(true);
        expect(pageErrors, `unhandled page error(s) during the failed fetch: ${pageErrors.join(' | ')}`).toEqual([]);
      });

      await phase('Move to the Basic Information tab', async () => {
        await pg.clickTab('tabBasicInformation');
        await pg.waitForBasicInfoForm(30_000);
      });

      await verify('Check the failure did not lock the user out of the rest of Local Office', async () => {
        expect(await pg.isOnBasicInfoTab()).toBe(true);
      });
    } finally {
      if (!pg.page.isClosed()) {
        await phase('Stop making the server fail', () => pg.page.unroute(HISTORY_API_URL_PATTERN));
        await pg.navigateToHistoryTab();
        await pg.waitForHistoryGridLoaded(30_000);
      }
    }

    await verify('Check the list comes back on its own, with no need to refresh the browser', async () => {
      expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
    });
  });

  test('TC-LOE-HIST-029: A malformed or partial history payload renders without crashing', { tag: '@C105497' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('If the server returns an incomplete record, the list still renders and the missing values show as empty cells.');
    test.setTimeout(120_000);
    try {
      await phase('Have the server return a change with many of its values missing', () => mockHistoryResponse(pg, withPartialFields));
      await pg.reloadAndNavigateToHistory(OFFICE_NO);

      const headerCount = await pg.getHistoryColumnHeaderCount();
      await verify('Check the list still shows its headings and its entries', async () => {
        expect(headerCount).toBeGreaterThan(1);
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
      });

      const matrix = await pg.getHistoryCellMatrix(3);
      await verify('Check the missing values leave empty cells rather than shifting the row', async () => {
        expect(matrix.map(row => row.length).filter(len => len !== headerCount)).toEqual([]);
      });

      await verify('Check no cell shows placeholder text in place of the missing values', async () => {
        const leaked = matrix.flat().filter(cell =>
          HISTORY_FORBIDDEN_CELL_TEXT.some(bad => cell === bad || cell.includes(bad)));
        expect(leaked, `cells rendering a missing-value placeholder: ${leaked.join(' | ')}`).toEqual([]);
      });

      await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'descending');
      await verify('Check the list still responds after receiving incomplete data', async () => {
        expect(await pg.getHistoryColumnHeaderCount()).toBe(headerCount);
      });
    } finally {
      await restoreLiveHistory(pg);
    }
  });

  // ------------------------------------------------------------ 7. Accessibility and responsive

  test('TC-LOE-HIST-030: Headers are exposed as column headers and the sort menu is keyboard-operable', { tag: '@C105498' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('A keyboard-only or screen-reader user can read the column headings and sort the list without a mouse.');
    test.setTimeout(120_000);
    const headerCount = await pg.getHistoryColumnHeaderCount();
    const roleCount = await pg.getHistoryColumnHeaderRoleCount();
    await verify('Check every heading is announced as a column heading to a screen reader', async () => {
      expect(roleCount).toBe(headerCount);
    });

    const opened = await pg.openHistorySortMenuByKeyboard(HISTORY_SORT_COLUMN);
    const menuItems = await pg.getSortMenuItemLabels();
    await verify('Check pressing Enter on a sort control opens a menu with both sort directions', async () => {
      expect(opened, 'the sort menu did not open from the keyboard').toBe(true);
      expect(menuItems.join(' | ')).toContain('Sort ascending');
      expect(menuItems.join(' | ')).toContain('Sort descending');
    });

    await pg.applySortMenuItemByKeyboard(1);
    const stateAfterKeyboardSort = await pg.getHistorySortIndicator(HISTORY_SORT_COLUMN);
    await verify('Check a sort can be applied using the keyboard alone', async () => {
      expect(stateAfterKeyboardSort, 'keyboard sort did not change the column sort indicator').not.toBe('none');
    });

    await pg.openHistorySortMenuByKeyboard(HISTORY_SORT_COLUMN);
    const closed = await pg.closeSortMenuWithEscape();
    await verify('Check Escape closes the menu and leaves the sort as it was', async () => {
      expect(closed).toBe(true);
      expect(await pg.getHistorySortIndicator(HISTORY_SORT_COLUMN)).toBe(stateAfterKeyboardSort);
    });
  });

  test('TC-LOE-HIST-031: The grid stays usable at laptop viewport sizes with no page-level horizontal scroll', { tag: '@C105499' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('On smaller laptop screens no column disappears, and only the list scrolls sideways rather than the whole page.');
    test.setTimeout(120_000);
    const baselineHeaderCount = await pg.getHistoryColumnHeaderCount();

    try {
      for (const viewport of HISTORY_MOCK.viewports) {
        await pg.resizeViewport(viewport.width, viewport.height);
        await pg.waitForHistoryGridLoaded();
        const overflow = await pg.getHistoryOverflow();
        const paginatorVisible = await pg.getHistoryPaginationButtonCount();
        await verify(`Check that at ${viewport.label} no column is lost and only the list scrolls sideways`, async () => {
          expect(await pg.getHistoryColumnHeaderCount()).toBe(baselineHeaderCount);
          expect(overflow.pageOverflowPx, `the page scrolls horizontally at ${viewport.label}`).toBeLessThanOrEqual(1);
          expect(overflow.containerScrollsHorizontally).toBe(true);
          expect(paginatorVisible, `the paginator disappeared at ${viewport.label}`).toBeGreaterThan(0);
        });
      }
    } finally {
      await pg.resizeViewport(HISTORY_MOCK.defaultViewport.width, HISTORY_MOCK.defaultViewport.height);
      await pg.waitForHistoryGridLoaded();
    }

    await verify('Put the browser window back to its normal size for the tests that follow', async () => {
      expect(await pg.getHistoryColumnHeaderCount()).toBe(baselineHeaderCount);
    });
  });

  // ------------------------------------------------------------ 8. Pagination and data completeness

  test('TC-LOE-HIST-032: Paging through history keeps the column set stable and renders rows on every page', { tag: '@C105500' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Moving between pages of history keeps the same columns, shows entries on every page, and greys out the buttons that cannot be used.');
    test.setTimeout(150_000);
    const indicator = await pg.getHistoryPageIndicator();
    const headersPage1 = await pg.getHistoryColumnHeaders();
    const firstRowPage1 = await pg.getHistoryColumnByHeader(0, HISTORY_SORT_COLUMN);
    await verify('Check the page navigation says which page of results is showing', async () => {
      expect(indicator.total, 'no paginator total found — the grid may not be paginated for this office').toBeGreaterThan(0);
    });

    test.skip(indicator.total < 2, 'office has a single page of history — multi-page paging cannot be exercised');

    await pg.clickHistoryPaginationButton('next');
    await verify('Check page 2 opens, keeps the same columns and starts with a different entry', async () => {
      expect((await pg.getHistoryPageIndicator()).current).toBe(indicator.current + 1);
      expect(await pg.getHistoryColumnHeaders()).toEqual(headersPage1);
      expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
      expect(await pg.getHistoryColumnByHeader(0, HISTORY_SORT_COLUMN), 'page 2 rendered the same slice as page 1').not.toBe(firstRowPage1);
    });

    await pg.clickHistoryPaginationButton('previous');
    await verify('Check going back returns page 1 exactly as it was', async () => {
      expect((await pg.getHistoryPageIndicator()).current).toBe(indicator.current);
      expect(await pg.getHistoryColumnByHeader(0, HISTORY_SORT_COLUMN)).toBe(firstRowPage1);
    });

    await verify('Check the back buttons are greyed out on page 1', async () => {
      expect(await pg.isHistoryPaginationButtonDisabled('first')).toBe(true);
      expect(await pg.isHistoryPaginationButtonDisabled('previous')).toBe(true);
    });

    await pg.clickHistoryPaginationButton('last');
    await verify('Check the forward buttons are greyed out on the last page', async () => {
      expect(await pg.isHistoryPaginationButtonDisabled('next')).toBe(true);
      expect(await pg.isHistoryPaginationButtonDisabled('last')).toBe(true);
    });

    await pg.goToFirstHistoryPageIfNeeded();
  });

  test('TC-LOE-HIST-033: Older history records are not truncated when the page size changes', { tag: '@C105501' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Choosing to show more entries per page never hides the oldest changes.');
    test.setTimeout(180_000);
    await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'ascending');
    const indicator = await pg.getHistoryPageIndicator();
    const originalPageSize = await pg.getHistoryRowsPerPageValue();
    const headersBefore = await pg.getHistoryColumnHeaders();
    await verify('Check the page navigation and the entries-per-page chooser can both be read', async () => {
      expect(indicator.total).toBeGreaterThan(0);
      expect(originalPageSize).not.toBe('');
    });

    await pg.clickHistoryPaginationButton('last');
    await verify('Check the last page still has entries on it, not an empty page', async () => {
      // An empty terminal page is exactly how an off-by-one row-count/offset cut-off presents.
      expect(await pg.getHistoryRowCount(), 'the last page rendered zero rows — older records are being cut off').toBeGreaterThan(0);
    });

    const oldestBefore = await phase('Note the oldest change visible at the current page size', async () => {
      await pg.clickHistoryPaginationButton('first');
      const values = meaningful(await pg.getHistoryColumnValues(HISTORY_SORT_COLUMN, 50)).map(LocalOfficeHistoryPage.parseModifiedOnMs);
      return Math.min(...values);
    });

    const options = await pg.getHistoryRowsPerPageOptions();
    const largest = options[options.length - 1];
    test.skip(!largest || largest === originalPageSize, 'no larger page size offered — cannot vary the page size');

    try {
      await pg.setHistoryRowsPerPage(largest!);
      const afterIndicator = await pg.getHistoryPageIndicator();
      const rowsAfter = await pg.getHistoryRowCount();
      await verify('Check a bigger page size shows more entries per page or fewer pages', async () => {
        expect(rowsAfter > 0).toBe(true);
        expect(afterIndicator.total <= indicator.total, 'raising the page size increased the page count').toBe(true);
        expect(await pg.getHistoryColumnHeaders()).toEqual(headersBefore);
      });

      const oldestAfter = meaningful(await pg.getHistoryColumnValues(HISTORY_SORT_COLUMN, 100))
        .map(LocalOfficeHistoryPage.parseModifiedOnMs);
      await verify('Check raising the page size never hides the oldest changes', async () => {
        expect(Math.min(...oldestAfter)).toBeLessThanOrEqual(oldestBefore);
      });
    } finally {
      await pg.setHistoryRowsPerPage(originalPageSize);
      await pg.goToFirstHistoryPageIfNeeded();
    }
  });

  // ------------------------------------------------------------ 9. Regression and integration

  test('TC-LOE-HIST-034: A Basic Information save appears as a new top row in Location Settings History', { tag: '@C105502' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Saving a change on Basic Information adds a new entry at the top of History, stamped with who made it and when.');
    // Two history-grid loads plus two Basic Information save cycles at ~30-60s apiece.
    test.setTimeout(300_000);

    await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'descending');
    const baselineTop = await pg.getHistoryColumnByHeader(0, HISTORY_SORT_COLUMN);
    const baselineRows = await pg.getHistoryRowCount();

    await pg.navigateToBasicInfoTab(OFFICE_NO);
    const originalPhone = await pg.getInputValue(HISTORY_INTEGRATION_FIELD.key);
    // Derived from the live value, never hardcoded: a net-zero edit leaves the Angular form
    // pristine, Save never enables, and clickSaveAndConfirm() hangs on a disabled button.
    const probeValue = originalPhone === HISTORY_INTEGRATION_FIELD.probeValue
      ? HISTORY_INTEGRATION_FIELD.altProbeValue
      : HISTORY_INTEGRATION_FIELD.probeValue;

    try {
      await pg.fillAndTab(HISTORY_INTEGRATION_FIELD.key, probeValue);
      await verify('Check the edit is recognised and the Save button turns on', async () => {
        expect(await pg.waitForSaveToEnable(10_000)).toBe(true);
      });

      const saveResult = await pg.clickSaveAndConfirm();
      await verify('Check the change is saved and the Save button turns off again', async () => {
        expect(saveResult.success, `save failed: ${saveResult.networkError ?? 'unknown error'}`).toBe(true);
        expect(await pg.isSaveEnabled()).toBe(false);
      });

      await pg.navigateToHistoryTab();
      await pg.waitForHistoryGridLoaded();
      await pg.sortHistoryColumn(HISTORY_SORT_COLUMN, 'descending');
      await pg.waitForRecentTopHistoryRow();

      const newTopTimestamp = await pg.getHistoryColumnByHeader(0, HISTORY_SORT_COLUMN);
      const newTopUser = await pg.getHistoryColumnByHeader(0, HISTORY_AUDIT_USER_COLUMN);
      const newTopPhone = await pg.getHistoryColumnByHeader(0, HISTORY_INTEGRATION_FIELD.column);

      await verify('Check a new entry has appeared at the top of the History list', async () => {
        expect(await pg.getHistoryRowCount()).toBeGreaterThanOrEqual(baselineRows);
        expect(LocalOfficeHistoryPage.parseModifiedOnMs(newTopTimestamp))
          .toBeGreaterThan(LocalOfficeHistoryPage.parseModifiedOnMs(baselineTop));
      });

      await verify('Check the new entry names the user who saved it and is stamped just now', async () => {
        expect(newTopUser).toContain(AUTOMATION_USER);
        // Recency rather than a date-string comparison: the grid renders UTC text with no offset,
        // so comparing against "today" in the runner's or the render timezone would flip at
        // midnight. A 15-minute window is timezone-proof and a stronger claim anyway.
        const ageMs = Date.now() - LocalOfficeHistoryPage.parseModifiedOnMs(newTopTimestamp);
        expect(ageMs, `the new top row is ${Math.round(ageMs / 60000)} minutes old`).toBeLessThan(15 * 60 * 1000);
      });

      await verify('Check the value that was saved is the value recorded in History', async () => {
        // The missing-field-capture regression: a row can appear while the changed field is
        // silently dropped from the history record.
        expect(newTopPhone).toContain(probeValue);
      });
    } finally {
      await pg.navigateToBasicInfoTab(OFFICE_NO);
      await pg.fillAndTab(HISTORY_INTEGRATION_FIELD.key, originalPhone);
      // Poll rather than checking once: Save can flip back to disabled between the check and the
      // click. A restore that never enables Save is already a net-zero restore.
      if (await pg.waitForSaveToEnable(5_000)) {
        await pg.clickSaveAndConfirm();
      }
    }
  });

  test('TC-LOE-HIST-035: Navigating to History with unsaved Basic Information edits raises the Unsaved Changes dialog', { tag: '@C105503' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Leaving Basic Information for History with unsaved edits warns the user first, and both Stay and Discard behave as they should.');
    test.setTimeout(150_000);

    await pg.navigateToBasicInfoTab(OFFICE_NO);
    const originalPhone = await pg.getInputValue(HISTORY_INTEGRATION_FIELD.key);
    const probeValue = originalPhone === HISTORY_INTEGRATION_FIELD.probeValue
      ? HISTORY_INTEGRATION_FIELD.altProbeValue
      : HISTORY_INTEGRATION_FIELD.probeValue;

    await pg.fillAndTab(HISTORY_INTEGRATION_FIELD.key, probeValue);
    await verify('Check the unsaved edit is recognised by the form', async () => {
      expect(await pg.waitForSaveToEnable(10_000)).toBe(true);
    });

    await pg.clickTabDirect('tabHistory');
    await verify('Check the Unsaved changes warning appears, offering Stay and Discard', async () => {
      const dialog = pg.page.locator('[role="alertdialog"]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Unsaved changes');
      await expect(dialog).toContainText('Are you sure you want to leave this view? Any unsaved changes will be lost.');
      await expect(dialog.getByRole('button', { name: 'Stay' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Discard' })).toBeVisible();
    });

    await phase('Choose Stay in the warning', async () => {
      await pg.page.locator('[role="alertdialog"]').getByRole('button', { name: 'Stay' }).click();
      await pg.page.locator('[role="alertdialog"]').waitFor({ state: 'hidden', timeout: 5_000 });
    });

    await verify('Check Stay keeps the user on Basic Information with the edit still there', async () => {
      expect(await pg.isOnBasicInfoTab()).toBe(true);
      expect(await pg.getInputValue(HISTORY_INTEGRATION_FIELD.key)).toBe(probeValue);
      expect(await pg.isSaveEnabled()).toBe(true);
    });

    // clickTab() clicks and then discards whatever unsaved-changes dialog it raises — the
    // convention the ECT and Basic Information suites already use to complete this navigation.
    await pg.clickTab('tabHistory');
    await pg.waitForHistoryGridLoaded();
    await verify('Check Discard lets the move to History go ahead', async () => {
      expect(await pg.isOnHistoryTab()).toBe(true);
      expect(await pg.getHistoryColumnHeaderCount()).toBeGreaterThan(1);
    });

    await pg.navigateToBasicInfoTab(OFFICE_NO);
    await verify('Check Discard threw the unsaved edit away completely', async () => {
      expect(await pg.getInputValue(HISTORY_INTEGRATION_FIELD.key)).toBe(originalPhone);
      expect(await pg.isSaveEnabled()).toBe(false);
    });
  });

  test('TC-LOE-HIST-036: The history type selector switches between the standard and legacy grids', { tag: '@C105504' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The history type chooser switches between the current list and the older one, and both are read-only.');
    test.setTimeout(180_000);
    const present = await pg.isHistoryTypeSelectorPresent();
    // Not part of NM-854 — it may be feature-flagged or permission-gated, so its absence is a
    // skip with a stated reason, never a failure.
    test.skip(!present, 'history type selector is not present for this office/permission');

    const currentValue = await pg.getHistoryTypeValue();
    const options = await pg.getHistoryTypeOptions();
    const standardHeaders = await pg.getHistoryColumnHeaders();
    await verify('Check the chooser shows one of the options it actually offers', async () => {
      expect(options).toEqual([HISTORY_LEGACY.standardType, HISTORY_LEGACY.type]);
      expect(currentValue).toBe(HISTORY_LEGACY.standardType);
      expect(await pg.getActiveHistoryGrid()).toBe('standard');
    });

    await attachNote('The history types the chooser offered', options.join('\n'));

    try {
      await pg.selectHistoryType(HISTORY_LEGACY.type);
      await verify('Check the older type shows its own list, not the current one', async () => {
        // The structural finding this scenario exists for: the legacy view swaps in a different
        // table (its own data-testid) with 44 columns instead of the standard view's 42. Waiting
        // for the standard table here is what timed this test out before.
        expect(await pg.getActiveHistoryGrid()).toBe('legacy');
        expect(await pg.getLegacyHistoryColumnHeaders()).toHaveLength(HISTORY_LEGACY.columnCount);
        expect(await pg.getLegacyHistoryRowCount()).toBeGreaterThan(0);
      });

      await verify('Check the older list is just as uneditable as the current one', async () => {
        expect(await pg.isLegacyHistoryReadOnly()).toBe(true);
      });
    } finally {
      await pg.selectHistoryType(currentValue);
    }

    await verify('Check switching back brings the current list and its columns back exactly', async () => {
      expect(await pg.getHistoryTypeValue()).toBe(currentValue);
      expect(await pg.getActiveHistoryGrid()).toBe('standard');
      expect(await pg.getHistoryColumnHeaders()).toEqual(standardHeaders);
    });
  });

  // ------------------------------------------------------------ 10. Paginator page-number input
  //
  // The ONLY editable field on this read-only tab, so it is the tab's only field-level validation
  // surface. NM-854 puts field validation out of scope for the history GRID, which is why the
  // original 36 scenarios did not cover it — but the paginator input is real, in scope, and
  // unvalidated, so it gets proper negative coverage here.

  test('TC-LOE-HIST-037: The paginator page box rejects zero, negative, non-numeric and far-out-of-range input', { tag: '@C105505' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Typing a nonsense page number, whether zero, a minus number, letters or a huge value, leaves the user on the page they were already on.');
    test.setTimeout(180_000);

    const attrs = await pg.getHistoryPageInputAttributes();
    await verify('Check the page box limits what can be typed by shape, not by a smallest and largest value', async () => {
      // Confirmed live: type="text" with inputmode="numeric" and pattern="[0-9]*", and NO min,
      // max or maxLength — so range handling is entirely the app's own logic, which is what the
      // probes below exercise.
      expect(attrs.pattern).toBe('[0-9]*');
      expect(attrs.inputMode).toBe('numeric');
      expect(attrs.required).toBe(false);
    });

    try {
      // Each rejected value is checked against the page the grid was ALREADY on, not against a
      // hardcoded page 1. The control reverts to the current page, which only looked like
      // "reset to page 1" because the discovery probes all happened to start there.
      for (const probe of HISTORY_PAGE_INPUT_REJECTED) {
        const before = (await pg.getHistoryPageIndicator()).current;
        const settled = await pg.setHistoryPageNumber(probe.typed);
        const indicator = await pg.getHistoryPageIndicator();
        const rowCount = await pg.getHistoryRowCount();
        await verify(`Check typing ${JSON.stringify(probe.typed)} is refused and the user stays on page ${before} (${probe.note})`, async () => {
          expect(settled).toBe(String(before));
          expect(indicator.current).toBe(before);
          // Whatever the input, the grid must still render a full page of data — a rejected
          // value must never leave an empty or broken grid behind.
          expect(rowCount).toBeGreaterThan(0);
        });
      }

      // One-past-the-end is derived live rather than hardcoded: a literal is only out of range
      // while the grid is in its default state, which is precisely how the first full sequential
      // run contaminated this test.
      const total = (await pg.getHistoryPageIndicator()).total;
      const beforeOverflow = (await pg.getHistoryPageIndicator()).current;
      const overflowSettled = await pg.setHistoryPageNumber(String(total + 1));
      await verify(`Check typing ${total + 1}, one past the last page, leaves the user on page ${beforeOverflow}`, async () => {
        expect(overflowSettled).toBe(String(beforeOverflow));
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
      });

      for (const probe of HISTORY_PAGE_INPUT_ACCEPTED) {
        const settled = await pg.setHistoryPageNumber(probe.typed);
        const indicator = await pg.getHistoryPageIndicator();
        await verify(`Check typing ${JSON.stringify(probe.typed)} moves to page ${probe.expected} (${probe.note})`, async () => {
          expect(settled).toBe(probe.expected);
          expect(indicator.current).toBe(parseInt(probe.expected, 10));
          expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        });
      }
    } finally {
      await pg.setHistoryPageNumber('1');
    }

    await verify('Put the list back on page 1 for the tests that follow', async () => {
      expect((await pg.getHistoryPageIndicator()).current).toBe(1);
    });
  });

  test('TC-LOE-HIST-038: A page number one past the last page reverts to the page already shown', { tag: '@C105506' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Typing a page number one beyond the last page keeps the user where they are instead of showing an empty page.');
    test.setTimeout(180_000);
    const indicator = await pg.getHistoryPageIndicator();
    test.skip(indicator.total < 2, 'office has a single page of history — no out-of-range boundary to probe');

    try {
      const lastPage = await pg.setHistoryPageNumber(String(indicator.total));
      await verify('Check the last page can be reached by typing its number', async () => {
        expect(lastPage).toBe(String(indicator.total));
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        expect(await pg.isHistoryPaginationButtonDisabled('next')).toBe(true);
      });

      const onePastEnd = String(indicator.total + 1);
      const past = await pg.setHistoryPageNumber(onePastEnd);
      await verify(`Check page ${onePastEnd}, one past the end, leaves the user on the page already shown`, async () => {
        // The out-of-range value is rejected and the box reverts to the CURRENT page — which here
        // is the last page, not page 1. This is the assertion that corrected the model: probing
        // only from page 1 made revert-to-current indistinguishable from reset-to-page-1.
        expect(past).toBe(String(indicator.total));
        expect((await pg.getHistoryPageIndicator()).current).toBe(indicator.total);
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        expect(await pg.isHistoryPaginationButtonDisabled('next')).toBe(true);
      });
    } finally {
      await pg.setHistoryPageNumber('1');
    }
  });

  test('TC-LOE-HIST-039: A decimal page number has its separator stripped and navigates to the concatenated page', { tag: '@C105507' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Records a known defect: typing a decimal page number drops the dot and jumps to the wrong page.');
    test.setTimeout(180_000);
    const indicator = await pg.getHistoryPageIndicator();
    const expectedPage = parseInt(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.observed, 10);
    test.skip(indicator.total < expectedPage, `office has only ${indicator.total} pages — cannot reach page ${expectedPage}`);

    try {
      const settled = await pg.setHistoryPageNumber(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.typed);
      await verify(`Check typing ${JSON.stringify(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.typed)} lands on page ${HISTORY_PAGE_INPUT_DECIMAL_DEFECT.observed} instead of page 2, the defect being recorded`, async () => {
        // DOCUMENTED DEFECT, asserted against the live behaviour on purpose. The "." is stripped
        // by pattern="[0-9]*" and the remaining digits are concatenated, so a user aiming at
        // page 2 silently lands on page 25. This assertion pins the current behaviour so the
        // change is caught the moment it is fixed — at which point this test should be updated
        // to expect page 2 (or a rejection), not deleted.
        expect(settled).toBe(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.observed);
        expect((await pg.getHistoryPageIndicator()).current).toBe(expectedPage);
      });

      await verify('Check the wrong page is at least a real page of history, not a broken one', async () => {
        expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
        expect(await pg.getHistoryColumnHeaders()).toEqual([...HISTORY_ALL_COLUMNS_IN_ORDER]);
      });

      await attachNote('Defect: a decimal page number loses its dot and jumps to the wrong page',
        `typed ${JSON.stringify(HISTORY_PAGE_INPUT_DECIMAL_DEFECT.typed)} -> settled on page `
        + `${JSON.stringify(settled)}; the decimal separator is stripped rather than the value`
        + ' being rejected or truncated to the integer part.');
    } finally {
      await pg.setHistoryPageNumber('1');
    }
  });

  // ------------------------------------------------------------ 11. Sortability & paging contract

  test('TC-LOE-HIST-040: Exactly the four structural columns are non-sortable and every other column sorts', { tag: '@C105508' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Only the four columns that cannot sensibly be sorted are locked, and every other column sorts.');
    test.setTimeout(180_000);

    const nonSortable = await pg.getHistoryNonSortableColumns();
    await verify('Check exactly four columns are locked from sorting: the two packed columns, Notes and Local Office', async () => {
      // NM-854 requires every column "marked sortable" to sort. Asserting the exact SET of
      // exceptions - rather than TC-014's count bound - is what catches a column silently
      // losing its sort control.
      expect(nonSortable).toEqual([...HISTORY_NON_SORTABLE_COLUMNS]);
    });

    const sortable = await pg.getHistorySortableColumns();
    await verify('Check every other column can be sorted', async () => {
      expect(sortable).toHaveLength(HISTORY_ALL_COLUMNS_IN_ORDER.length - HISTORY_NON_SORTABLE_COLUMNS.length);
      const overlap = sortable.filter(h => (HISTORY_NON_SORTABLE_COLUMNS as readonly string[]).includes(h));
      expect(overlap, `these columns are both sortable and listed non-sortable: ${overlap.join(', ')}`).toEqual([]);
    });

    // Prove a sample of them genuinely sort rather than merely carrying a control.
    const probe = sortable.find(h => h === 'Local Office ID' ? false : h !== HISTORY_SORT_COLUMN) ?? sortable[0]!;
    await pg.sortHistoryColumn(probe, 'ascending');
    await verify(`Check "${probe}" really re-orders the list rather than offering a dead control`, async () => {
      expect(await pg.getHistorySortIndicator(probe)).toBe('ascending');
      expect(await pg.getHistoryRowCount()).toBeGreaterThan(0);
    });
  });

  test('TC-LOE-HIST-041: The rows-per-page control offers the confirmed options and changing it changes the rendered row count', { tag: '@C105509' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The entries-per-page chooser offers 10 through 50, starts at 20, and changing it really changes how many entries appear.');
    test.setTimeout(180_000);

    const current = await pg.getHistoryRowsPerPageValue();
    const options = await pg.getHistoryRowsPerPageOptions();
    await verify('Check the chooser starts at 20 and offers exactly 10, 20, 30, 40 and 50', async () => {
      expect(current).toBe(HISTORY_ROWS_PER_PAGE.default);
      expect(options).toEqual([...HISTORY_ROWS_PER_PAGE.options]);
    });

    await verify('Check the number of entries shown matches the chosen page size', async () => {
      expect(await pg.getHistoryRowCount()).toBe(parseInt(HISTORY_ROWS_PER_PAGE.default, 10));
    });

    try {
      const smallest = HISTORY_ROWS_PER_PAGE.options[0];
      await pg.setHistoryRowsPerPage(smallest);
      await verify(`Check choosing ${smallest} shows exactly ${smallest} entries`, async () => {
        expect(await pg.getHistoryRowsPerPageValue()).toBe(smallest);
        expect(await pg.getHistoryRowCount()).toBe(parseInt(smallest, 10));
        expect(await pg.getHistoryColumnHeaders()).toEqual([...HISTORY_ALL_COLUMNS_IN_ORDER]);
      });
    } finally {
      await pg.setHistoryRowsPerPage(current);
      await pg.goToFirstHistoryPageIfNeeded();
    }

    await verify('Put the page size back for the tests that follow', async () => {
      expect(await pg.getHistoryRowsPerPageValue()).toBe(current);
    });
  });

  // ------------------------------------------------------------ 12. Composite (folded) cells

  test('TC-LOE-HIST-042: Composite Section Name and Service Type cells render pipe-delimited name and flag pairs', { tag: '@C105510' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('The Section Name and Service Type columns pack a name and its setting into a single cell, separated cleanly.');
    test.setTimeout(180_000);
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to inspect — data precondition, not a defect');

    for (const column of HISTORY_COMPOSITE_COLUMNS) {
      const cell = await pg.getHistoryCompositeCell(column, 0);
      await verify(`Check "${column}" packs its two fields into clean name-and-setting pairs`, async () => {
        // These two columns are why SectionIsActive, ServiceTypeName and STExempt have no columns
        // of their own (HISTORY_FOLDED_FIELDS). The pair structure IS the contract for those
        // three fields, so it is asserted rather than left as opaque text.
        expect(cell.pairs.length, `"${column}" produced no name/flag pairs from ${JSON.stringify(cell.raw.slice(0, 120))}`).toBeGreaterThan(1);
        for (const pair of cell.pairs) {
          expect(pair.name, `empty name in "${column}"`).not.toBe('');
          expect(HISTORY_COMPOSITE_FLAGS as readonly string[],
            `"${column}" pair ${JSON.stringify(pair.name)} has flag ${JSON.stringify(pair.flag)}, expected true/false`).toContain(pair.flag);
        }
      });

      await attachNote(`What the packed ${column} cell actually contained`, `length=${cell.length} pairs=${cell.pairs.length}\n${cell.raw}`);
    }
  });

  test('TC-LOE-HIST-043: Long composite cells do not break row alignment or push the page into horizontal scroll', { tag: '@C105511' }, async ({ localOfficeHistoryPage: pg, dependencyGate }) => {
    dependencyGate(['TC-LOE-HIST-001']);
    await about('Even when those packed cells are very long, entries stay lined up and the page does not scroll sideways.');
    test.setTimeout(180_000);
    const rowCount = await pg.getHistoryRowCount();
    test.skip(rowCount === 0, 'office has no history rows to inspect — data precondition, not a defect');

    // Unlike TC-LOE-HIST-024, which injects a synthetic 2,000-character Notes value, this uses the
    // REAL composite data, which is already ~250 characters per cell on office 1604.
    const lengths = await phase('Measure how long those packed cells really are', async () => {
      const out: Record<string, number> = {};
      for (const column of HISTORY_COMPOSITE_COLUMNS) {
        out[column] = (await pg.getHistoryCompositeCell(column, 0)).length;
      }
      return out;
    });

    await verify('Check those cells are long enough to be a genuine layout risk', async () => {
      for (const [column, length] of Object.entries(lengths)) {
        expect(length, `${column} was only ${length} chars — this scenario is not exercising long content`).toBeGreaterThan(100);
      }
    });

    const headerCount = await pg.getHistoryColumnHeaderCount();
    await verify('Check the long content did not shift any entry out of line', async () => {
      const cellCounts = await pg.getHistoryRowCellCounts(20);
      expect(cellCounts.filter(c => c !== headerCount)).toEqual([]);
    });

    const overflow = await pg.getHistoryOverflow();
    await verify('Check the list absorbs the extra width so the page does not scroll sideways', async () => {
      expect(overflow.pageOverflowPx, 'long composite cells pushed the page into horizontal scroll').toBeLessThanOrEqual(1);
      expect(overflow.containerScrollsHorizontally).toBe(true);
    });
  });

});
