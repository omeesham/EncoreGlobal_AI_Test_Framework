import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  COLUMN_COUNT,
  FIRST_COLUMN,
  LAST_COLUMN,
  DEFAULT_ROWS_PER_PAGE,
  ROWS_PER_PAGE_OPTIONS,
  NON_SORTABLE_COLUMNS,
  ROW_1_EXPECTED,
} from '../../src/data/locations/location-management-history';
import { OFFICE_NO } from '../../src/data/common';
import { NOTE_SEQUENTIAL_A, NOTE_SEQUENTIAL_B } from '../../src/data/locations/location-notes';

/** Parse "MM/DD/YYYY HH:MM:SS AM/PM" date format deterministically. */
function parseDateVal(val: string): number {
  const parts = val.trim().split(' ');
  const dateParts = (parts[0] || '').split('/');
  const timeParts = (parts[1] || '').split(':').map(Number);
  const ampm = parts[2] || '';
  const m = Number(dateParts[0]);
  const d = Number(dateParts[1]);
  const y = Number(dateParts[2]);
  let h = timeParts[0] || 0;
  const min = timeParts[1] || 0;
  const s = timeParts[2] || 0;
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return new Date(y, m - 1, d, h, min, s).getTime();
}

test.describe('Location Management History @locations @management-history', () => {

  // Per-test navigation guard. Unconditionally calls navigateToHistoryTab —
  // the page-object method has its own internal URL-check that skips the
  // navigateTo when URL is already correct, while still re-clicking the tab
  // when the tab is not yet active and waiting on <th> visibility.
  // DOM-presence beats URL-substring — URL on /settings/location does NOT
  // guarantee History tab is the active tab and <th> is rendered.
  test.beforeEach(async ({ locationManagementHistoryPage }) => {
    await locationManagementHistoryPage.navigateToHistoryTab(OFFICE_NO);
  });

  test('TC-LOC-MGH-001: Tab renders and DataTable loads', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await locationManagementHistoryPage.navigateToHistoryTab(OFFICE_NO);
    expect(await locationManagementHistoryPage.isTableVisible(), 'History table should be visible after loading').toBe(true);
    expect(await locationManagementHistoryPage.getColumnHeaderCount()).toBeGreaterThan(0);
  });

  test('TC-LOC-MGH-002: All 87 column headers present', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    const count = await locationManagementHistoryPage.getColumnHeaderCount();
    expect(count, 'History table should show the expected number of columns').toBe(COLUMN_COUNT);
    const headers = await locationManagementHistoryPage.getColumnHeaders();
    expect(headers[0]).toBe(FIRST_COLUMN);
    expect(headers[headers.length - 1]).toBe(LAST_COLUMN);
  });

  test('TC-LOC-MGH-003: Default rows per page is 20', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    const value = await locationManagementHistoryPage.getRowsPerPageValue();
    expect(value).toBe(DEFAULT_ROWS_PER_PAGE);
  });

  test('TC-LOC-MGH-004: Rows per page dropdown options', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    const options = await locationManagementHistoryPage.getRowsPerPageOptions();
    expect(options).toEqual(ROWS_PER_PAGE_OPTIONS);
  });

  test('TC-LOC-MGH-005: Change rows per page updates table display', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await locationManagementHistoryPage.setRowsPerPage('10');
    const rows = await locationManagementHistoryPage.getDataRowCount();
    expect(rows).toBeLessThanOrEqual(10);
    await locationManagementHistoryPage.setRowsPerPage(DEFAULT_ROWS_PER_PAGE);
  });

  test('TC-LOC-MGH-006: Pagination controls disabled when only one page', async ({ dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    test.skip(true, 'Office 1604 has 2900+ rows -- always multi-page. Requires a location with <= 20 history rows.');
  });

  test('TC-LOC-MGH-007: Empty state message for location with no history', async ({ dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
 // TC requirement: a location with NO history. 1604 has history.
 // This test documents the expected empty state behavior.
 // Use a freshly created location or one known to have no records.
    test.skip(true, 'Requires a location with zero history rows -- 1604 has 2900+ rows');
  });

  test('TC-LOC-MGH-008: Data row renders with correct values (location 1604)', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    const row = await locationManagementHistoryPage.getRowValues(0, [
      ...Object.keys(ROW_1_EXPECTED), 'Modified By', 'Oracle Product Code',
    ]);
    for (const [key, expected] of Object.entries(ROW_1_EXPECTED)) {
 // Mutable-value columns: Country / Active / Currency drift via other specs' Save cycles in the same project run
 // (currency, legal, etc. mutate row 0 between MGH runs). Assert non-empty instead of exact
 // match — structural presence of the data is the feature under test, not the literal value.
 // Local Office ('1604') and Local Office Name ('Parker Palm Springs') stay strict — those
 // are immutable for office 1604 and would catch a real regression (wrong row, empty table).
      if (key === 'Active' || key === 'Currency') {
        expect(row[key], `${key} column should not be empty in latest history row`).toBeTruthy();
      } else {
        expect(row[key]).toBe(expected);
      }
    }
 // Dynamic fields — values change per save, just verify non-empty
    expect(row['Modified By']).toBeTruthy();
    expect(row['Oracle Product Code']).toBeTruthy();
  });

  test('TC-LOC-MGH-009: Sort ascending on sortable column', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await locationManagementHistoryPage.clickSortColumn('Modified On', 'ascending');
    const firstVal = await locationManagementHistoryPage.getColumnByHeader(0, 'Modified On');
    const lastVal = await locationManagementHistoryPage.getColumnByHeader(
      Math.min(19, await locationManagementHistoryPage.getDataRowCount() - 1), 'Modified On');
    expect(firstVal).toBeTruthy();
    expect(lastVal).toBeTruthy();
 // Verify ascending order: first date <= last date
    const firstTs = parseDateVal(firstVal);
    const lastTs = parseDateVal(lastVal);
    expect(firstTs).not.toBeNaN();
    expect(lastTs).not.toBeNaN();
    expect(firstTs).toBeLessThanOrEqual(lastTs);
  });

  test('TC-LOC-MGH-010: Sort descending by toggling same column', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await locationManagementHistoryPage.clickSortColumn('Modified On', 'descending');
    const firstVal = await locationManagementHistoryPage.getColumnByHeader(0, 'Modified On');
    const lastVal = await locationManagementHistoryPage.getColumnByHeader(
      Math.min(19, await locationManagementHistoryPage.getDataRowCount() - 1), 'Modified On');
    expect(firstVal).toBeTruthy();
    expect(lastVal).toBeTruthy();
 // Verify descending order: first date >= last date
    const firstTs = parseDateVal(firstVal);
    const lastTs = parseDateVal(lastVal);
    expect(firstTs).not.toBeNaN();
    expect(lastTs).not.toBeNaN();
    expect(firstTs).toBeGreaterThanOrEqual(lastTs);
  });

  test('TC-LOC-MGH-011: Sort by Live Date column', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    await locationManagementHistoryPage.clickSortColumn('Live Date');
    const firstRow = await locationManagementHistoryPage.getColumnByHeader(0, 'Live Date');
    expect(firstRow).toBeTruthy();
  });

  test('TC-LOC-MGH-012: Non-sortable columns have no sort button', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    for (const col of NON_SORTABLE_COLUMNS) {
      expect(await locationManagementHistoryPage.isSortButtonPresent(col)).toBe(false);
    }
  });

  test('TC-LOC-MGH-013: Column 28 renders correct header text', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    const headers = await locationManagementHistoryPage.getColumnHeaders();
    const col28 = headers[27]; // 0-indexed
    expect(col28).toBe('Calculate LDW on Net Amount');
  });

  test('TC-LOC-MGH-014: Columns 37 and 38 have correct distinct headers', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    const headers = await locationManagementHistoryPage.getColumnHeaders();
    const col37 = headers[36]; // 0-indexed
    const col38 = headers[37]; // 0-indexed
    expect(col37).toBe('Calculate CAC on Net Amount');
    expect(col38).toBe('Terms and Conditions');
 // Both columns are non-sortable (Live-verified)
    expect(await locationManagementHistoryPage.isSortButtonPresentByIndex(36)).toBe(false);
    expect(await locationManagementHistoryPage.isSortButtonPresentByIndex(37)).toBe(false);
  });

  // Re-enabled 2026-06-02: isReadOnly() now scopes the editable-field count to the nested data
  // <table> (tblMgmtHistory wrapper contains the paginator input OUTSIDE that table — live walk
  // 2026-06-02). The data region is genuinely input-free.
  test('TC-LOC-MGH-015: Read-only -- no Add/Edit/Delete controls present', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    expect(await locationManagementHistoryPage.isReadOnly()).toBe(true);
  });

  test('TC-LOC-MGH-016: Read-only -- table cells are not interactive', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    expect(await locationManagementHistoryPage.areCellsNonInteractive()).toBe(true);
  });

  test('TC-LOC-MGH-017: Horizontal scroll works for wide table', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
    expect(await locationManagementHistoryPage.hasHorizontalScroll()).toBe(true);
    const headers = await locationManagementHistoryPage.getColumnHeaders();
    expect(headers[headers.length - 1]).toBe(LAST_COLUMN);
  });

  test('TC-LOC-MGH-018: API endpoint called on tab activation', async ({ locationManagementHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-MGH-001']);
 // Switch away from History tab, then re-enter — verify API fires
    const responses = await locationManagementHistoryPage.captureResponsesOnHistoryTabSwitch();
    expect(responses.length).toBeGreaterThan(0);
  });

 // Re-enabled 2026-06-02: the prior "first/last buttons vanish after Next→Previous" claim was REFUTED by
 // a live walk (2026-06-02) — all four nav buttons stay in the DOM
 // through the full Next→Prev→Last→First sequence. The real failure was our getPaginationText() reading a
 // <span> when the indicator is an <input> + a "/N" span; that selector is now fixed. Assertions unchanged.
  test('TC-LOC-MGH-019: Pagination navigation enables with multiple pages', async ({ locationManagementHistoryPage }) => {
 // Page 1: next/last enabled, first/prev disabled
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('first')).toBe(true);
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('previous')).toBe(true);
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('next')).toBe(false);
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('last')).toBe(false);

    await locationManagementHistoryPage.clickPaginationButton('next');
    const paginationAfterNext = await locationManagementHistoryPage.getPaginationText();
    expect(paginationAfterNext).toContain('2');

    await locationManagementHistoryPage.clickPaginationButton('previous');
    const paginationAfterPrev = await locationManagementHistoryPage.getPaginationText();
    expect(paginationAfterPrev).toMatch(/^1\s*\/\s*\d+$/);

    await locationManagementHistoryPage.clickPaginationButton('last');
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('next')).toBe(true);
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('last')).toBe(true);

    await locationManagementHistoryPage.clickPaginationButton('first');
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('first')).toBe(true);
    expect(await locationManagementHistoryPage.isPaginationButtonDisabled('previous')).toBe(true);
  });

});

// Notes column (col 69) HIST tests — consolidated here 2026-06-05 from the now-removed
// tests/locations/history/location-hist-notes.spec.ts. This describe is the single source of Notes col-69 HIST truth.
//
// Encoding rule (verified across long-text-4000, special-chars, newlines, unicode):
//   col 69 = formArrayRows.map(r => `${D} - ${r.value}`).join(' | ')
//   Special chars + newlines + unicode are preserved as-is (no HTML escape, no normalization).
//
// Spec design — content-anchored row lookup (avoids multi-save row-position pollution):
//   capture `Date.now() - 5000` (clock-skew buffer) BEFORE save → save → nav history →
//   sort desc → getRowsSinceTimestamp → pick the row whose Notes value matches one of the two
//   valid encoded forms. The auto-empty placeholder may or may not be present
//   at save time, so both forms are accepted without weakening byte-exact equality. Office 1604
//   sees interleaved saves from the shared save handler, so content-anchored lookup is the only
//   deterministic way to find the right row across the suite.
//
// Bug workarounds embedded:
//   - Delete-only not persisting: ensureEmptyState() codifies the
//     clear+delete+save+reload sequence; invoked in beforeEach (per-test baseline) and TC-032's finally.
//   - Dialog button says "Ok" instead of "Save": handled by the shared
//     btnSaveChangesConfirm path via clickSaveWithDialog in BasePage.
//   - Auto-empty placeholder row: expected accepts both single-row and
//     content+placeholder forms; content-anchored lookup is agnostic to which fired.

/** Format today as MM/DD/YYYY with leading-zero preservation (catalog rule). */
function todayMMDDYYYY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Two valid encoded forms for a single-content-row save.
 *   col 69 = formArrayRows.map(r => `${D} - ${r.value}`).join(' | ')
 * Trailing-space artifact from the empty placeholder row is trimmed by the
 * page-object getRowsSinceTimestamp read path.
 */
function expectedCol69Forms(payload: string, D: string): [string, string] {
  return [
    `${D} - ${payload}`,                       // FormArray = [content]
    `${D} - ${payload} | ${D} -`,              // FormArray = [content, empty placeholder] (trimmed)
  ];
}

const COL69_PAYLOADS = {
  'TC-LOC-MGH-020': 'hello',                                                                  // baseline → 'hello' save (catalog Save-1 analog)
  'TC-LOC-MGH-021': 'A'.repeat(4000),                                                         // boundary char count (catalog soft-limit 4000)
  'TC-LOC-MGH-022': `<script>alert(1)</script> & "quotes" 'apos' \`tick\` <div>`,            // special chars / HTML-like / quotes / backticks
  'TC-LOC-MGH-023': 'line1\nline2\nline3',                                                    // newlines + multi-line content
  'TC-LOC-MGH-024': 'café résumé 中文 ✔',                                                    // unicode (BMP-only — Latin diacritic + CJK + dingbat)
} as const;

test.describe('Location Management HIST — Notes col 69 @locations @management-history @notes-hist', () => {

  // Per-test setup: navigate to Notes tab + enforce baseline empty state per test.
  // `ensureEmptyState()` is intermittently unreliable (delete-only does not always persist) — the
  // first delete+save cycle sometimes doesn't persist when Angular's auto-row logic
  // races the Delete click. Retry up to 3 times; the second/third attempts work
  // because the prior cycle reloaded the form, surfacing the persisted state and
  // letting the next deleteAllRows hit a different timing window.
  test.beforeEach(async ({ locationNotesPage }) => {
    const url = locationNotesPage.getCurrentUrl();
    if (!url.includes(`locations/${OFFICE_NO}/settings/location`)) {
      await locationNotesPage.navigateToNotesTab(OFFICE_NO);
    } else {
      // URL is right but the active tab may not be Notes (esp. if prior test left on History).
      await locationNotesPage.clickNotesTab();
    }
    let isEmpty = false;
    for (let attempt = 0; attempt < 3 && !isEmpty; attempt++) {
      await locationNotesPage.ensureEmptyState();
      isEmpty = await locationNotesPage.isDefaultEmptyState();
    }
    // After up to 3 retries, the form must show 0 OR 1 empty textarea (both are valid
    // baselines per LocationNotesPage.isDefaultEmptyState()). The next fillNote(0, ...)
    // handles both. If still not empty after 3 attempts, this assertion captures the
    // pathological case for triage rather than silently proceeding.
    expect(isEmpty).toBe(true);
  });

  // Shared per-test routine: fill + save + content-anchored history lookup + strict assert.
  async function runCol69Assertion(
    locationNotesPage: any,
    locationManagementHistoryPage: any,
    payload: string,
  ): Promise<void> {
    const D = todayMMDDYYYY();
    const [formA, formB] = expectedCol69Forms(payload, D);

    // 5s back-buffer covers client-server clock skew on Modified On rendering.
    const sinceMs = Date.now() - 5_000;

    await locationNotesPage.fillNote(0, payload);
    await locationNotesPage.saveAndConfirm();

    await locationManagementHistoryPage.navigateToHistoryTab(OFFICE_NO);
    await locationManagementHistoryPage.sortByModifiedOnDesc();
    await locationManagementHistoryPage.waitForRecentTopRow();

    const rows = await locationManagementHistoryPage.getRowsSinceTimestamp(
      sinceMs,
      ['Notes', 'Modified On'],
    );
    const matched = rows.find((r: Record<string, string>) => (r.Notes ?? '') === formA || (r.Notes ?? '') === formB);
    if (!matched) {
      const notesPreview = rows.map((r: Record<string, string>) => {
        const notes = r.Notes ?? '';
        return {
          modifiedOn: r['Modified On'] ?? '',
          notesLen: notes.length,
          notesHead: notes.slice(0, 80),
        };
      });
      void notesPreview; // diagnostic context preserved for future debugging
      // Rich-diff failure path: assert against formA so report shows actual vs expected.
      // Picks the newest row's Notes value (rows are desc-sorted) for the diff.
      const firstRow = rows[0];
      const actual = firstRow ? (firstRow.Notes ?? '<no Notes col on row 0>') : '<no rows since sinceMs>';
      expect(actual).toBe(formA);
      return; // unreachable — expect above throws
    }
    // Strict equality on the matched row's Notes value.
    // Strict-line: literal `.toBe` form (no `.toContain` matcher anywhere in spec).
    // Avoid opaque `.toBe(true)` on OR expressions — branch so failure shows
    // actual vs expected (formA is preferred / single-row form; formB is the
    // placeholder-fallback form). This branch is unreachable when `.find` matched,
    // but lets the report surface the actual string if a regression weakens the match.
    const matchedNotes = matched.Notes ?? '';
    if (matchedNotes !== formA && matchedNotes !== formB) {
      expect(matchedNotes).toBe(formA);
    }

    await locationManagementHistoryPage.returnToBasicInformation();
  }

  test('TC-LOC-MGH-020: Verify saving a note records it in Location Management History', async ({
    locationNotesPage, locationManagementHistoryPage, dependencyGate,
  }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await runCol69Assertion(locationNotesPage, locationManagementHistoryPage, COL69_PAYLOADS['TC-LOC-MGH-020']);
  });

  test('TC-LOC-MGH-021: Verify a 4000-character note records in Location Management History', async ({
    locationNotesPage, locationManagementHistoryPage, dependencyGate,
  }) => {
    dependencyGate(['TC-LOC-MGH-020']);
    test.setTimeout(120_000);  // longer for 4000-char fill + save round-trip
    await runCol69Assertion(locationNotesPage, locationManagementHistoryPage, COL69_PAYLOADS['TC-LOC-MGH-021']);
  });

  test('TC-LOC-MGH-022: Verify a note with special characters records in Management History', async ({
    locationNotesPage, locationManagementHistoryPage, dependencyGate,
  }) => {
    dependencyGate(['TC-LOC-MGH-020']);
    test.setTimeout(90_000);
    await runCol69Assertion(locationNotesPage, locationManagementHistoryPage, COL69_PAYLOADS['TC-LOC-MGH-022']);
  });

  test('TC-LOC-MGH-023: Verify a multi-line note records in Location Management History', async ({
    locationNotesPage, locationManagementHistoryPage, dependencyGate,
  }) => {
    dependencyGate(['TC-LOC-MGH-020']);
    test.setTimeout(90_000);
    await runCol69Assertion(locationNotesPage, locationManagementHistoryPage, COL69_PAYLOADS['TC-LOC-MGH-023']);
  });

  test('TC-LOC-MGH-024: Verify a unicode note records in Location Management History', async ({
    locationNotesPage, locationManagementHistoryPage, dependencyGate,
  }) => {
    dependencyGate(['TC-LOC-MGH-020']);
    test.setTimeout(90_000);
    try {
      await runCol69Assertion(locationNotesPage, locationManagementHistoryPage, COL69_PAYLOADS['TC-LOC-MGH-024']);
    } finally {
      // Final cleanup — restore Office 1604 to catalog baseline (col 69 = "").
      // try/finally ensures cleanup runs even if the assertion above fails.
      // `locationNotesPage` is a test-scoped fixture (not afterAll-compatible), so
      // this is the strongest robustness contract available without spinning a
      // fresh context. Delete-only-not-persisting workaround codified inside ensureEmptyState:
      // clears textarea.value first, then Delete, then Save, then reload
      // (implemented in the Location Notes page object).
      await locationNotesPage.clickNotesTab();
      await locationNotesPage.ensureEmptyState();
    }
  });

  /**
   * TC-LOC-MGH-025 — HIST col 69 sequential-save 2-row distinctness.
   *
   * The Notes-spec sequential-save test (TC-LOC-NTS-053, "Sequential save
   * persists most recent value") asserts value-persistence only; this is the
   * HIST counterpart that owns the distinctness check.
   *
   * Assertion NTS-059 does not make: that sequential saves produce
   * TWO distinct HIST rows (one per save), not one merged row.
   *
   * Strategy: content-anchored lookup per `feedback_history_content_anchored_lookup.md`.
   * Office 1604 sees interleaved saves from the shared save handler, so we cannot
   * assume row[0] / row[1] are our saves — find each by content match independently,
   * then assert the temporal ordering on their `Modified On` timestamps.
   */
  test('TC-LOC-MGH-025: Verify two sequential note saves create two History rows', async ({
    locationNotesPage, locationManagementHistoryPage, dependencyGate,
  }) => {
    dependencyGate(['TC-LOC-MGH-020']);
    test.setTimeout(120_000);

    const D = todayMMDDYYYY();
    const [formA1, formA2] = expectedCol69Forms(NOTE_SEQUENTIAL_A, D);
    const [formB1, formB2] = expectedCol69Forms(NOTE_SEQUENTIAL_B, D);

    // 5s back-buffer covers client-server clock skew on Modified On rendering.
    // Captured BEFORE Save A so the read-window includes both Save A and Save B.
    const sinceMs = Date.now() - 5_000;

    await locationNotesPage.fillNote(0, NOTE_SEQUENTIAL_A);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();

    // clearNote sets textarea.value="" via Angular-friendly input event so the
    // form re-dirties and Save re-enables. Different content from A guarantees
    // a new HIST row rather than a no-op save.
    await locationNotesPage.clearNote(0);
    await locationNotesPage.fillNote(0, NOTE_SEQUENTIAL_B);
    await locationNotesPage.saveAndConfirm();

    await locationManagementHistoryPage.navigateToHistoryTab(OFFICE_NO);
    await locationManagementHistoryPage.sortByModifiedOnDesc();
    await locationManagementHistoryPage.waitForRecentTopRow();

    const rows = await locationManagementHistoryPage.getRowsSinceTimestamp(
      sinceMs,
      ['Notes', 'Modified On'],
    );

    // Find Save A's row + Save B's row by content match. Either FormArray form
    // is valid (auto-empty placeholder may or may not be present at save time).
    const isMatchA = (notes: string): boolean => notes === formA1 || notes === formA2;
    const isMatchB = (notes: string): boolean => notes === formB1 || notes === formB2;
    const rowA = rows.find((r: Record<string, string>) => isMatchA(r.Notes ?? ''));
    const rowB = rows.find((r: Record<string, string>) => isMatchB(r.Notes ?? ''));

    if (!rowA || !rowB) {
      const preview = rows.map((r: Record<string, string>) => ({
        modifiedOn: r['Modified On'] ?? '',
        notesLen: (r.Notes ?? '').length,
        notesHead: (r.Notes ?? '').slice(0, 80),
      }));
      void preview; // diagnostic context preserved for future debugging
      // Rich-diff failure: assert against the preferred (single-row) form so the
      // report shows actual vs expected for whichever side is missing.
      if (!rowA) expect(rows[0]?.Notes ?? '<no rows since sinceMs>').toBe(formA1);
      if (!rowB) expect(rows[0]?.Notes ?? '<no rows since sinceMs>').toBe(formB1);
      return; // unreachable when both rows matched
    }

    // Both saves produced distinct HIST rows. Now prove they are NOT the same row
    // (single merged save) by verifying their Modified On timestamps differ AND
    // that B is more recent than A.
    expect(rowA['Modified On']).not.toBe(rowB['Modified On']);
    // Modified On format per catalog: `MM/DD/YYYY HH:MM:SS AM/PM` (12-hour clock).
    // Date.parse handles this format on V8; if it ever returns NaN, the toBeGreaterThan
    // below would fail loudly with NaN > NaN === false.
    const tA = Date.parse(rowA['Modified On'] ?? '');
    const tB = Date.parse(rowB['Modified On'] ?? '');
    expect(tB).toBeGreaterThan(tA);

    await locationManagementHistoryPage.returnToBasicInformation();

    // Cleanup — restore Office 1604 to catalog baseline (col 69 = "").
    await locationNotesPage.clickNotesTab();
    await locationNotesPage.ensureEmptyState();
  });

});
