import { test, expect } from '../../src/fixtures/pages.fixture';
import {
  NOTE_TEXT_SHORT, NOTE_ROW1, NOTE_ROW2,
  NOTE_HELLO, NOTE_WORLD, NOTE_END,
  NOTE_SAVED, NOTE_PERSISTENT, NOTE_TEMPORARY, NOTE_UNSAVED, NOTE_LIFECYCLE,
  NOTE_4000_CHARS, NOTE_4001_CHARS, NOTE_2000_CHARS, NOTE_40_CHARS,
  NOTE_ROW_A, NOTE_ROW_B, NOTE_ROW_C,
  NOTE_COUNTER_EMPTY, NOTE_COUNTER_FULL, KEYBOARD_TEST,
  SPECIAL_CONTENT_TESTS,
  NOTE_ROW_ALPHA, NOTE_ROW_BETA, NOTE_ROW_GAMMA,
  NOTE_KEEP_FIRST, NOTE_DELETE_ME, NOTE_KEEP_LAST,
  NOTE_CANCEL_TEST,
  NOTE_SEQ_A, NOTE_SEQ_B, NOTE_ORIGINAL, NOTE_EDITED, NOTE_DELETE_CHECK,
} from '../../src/data/locations/location-notes';
import { OFFICE_NO, SAVE_CHANGES_DIALOG } from '../../src/data/common';
import { saveAndVerifyCase } from '../../src/utils/field-case-runner';
import {
  NOTE_1_CHAR, NOTE_3999_CHARS, NOTE_WHITESPACE_ONLY, NOTE_LEADING_WS, NOTE_TRAILING_WS,
  NOTE_TAB_CHAR, NOTE_NEWLINE_MULTI,
  NOTE_APPEND_BASE, NOTE_APPEND_SUFFIX, NOTE_PREPEND_PREFIX,
  NOTE_REPLACE_BASE, NOTE_REPLACE_SLICE,
  NOTE_2ROW_A, NOTE_2ROW_B, NOTE_5ROW, NOTE_MIXED_SHORT, NOTE_MIXED_LONG,
  NOTE_CANCEL_RESAVE_INITIAL, NOTE_CANCEL_RESAVE_FINAL, NOTE_ESCAPE_DIALOG,
  NOTE_IDEMPOTENT, NOTE_SEQUENTIAL_A, NOTE_SEQUENTIAL_B,
} from '../../src/data/locations/location-notes';

// 26 net-new tests + 1 DEFERRED (4000-char exact-limit persist — not implemented). Each test is
// independent: own baseline, own cleanup.
test.describe('Location Notes — FCC @locations @notes @fcc', () => {

  // DOM-presence beats url.includes (shared `settings/location` URL across sub-tabs).
  test.beforeEach(async ({ locationNotesPage }) => {
    if (!(await locationNotesPage.isOnNotesTab())) {
      await locationNotesPage.navigateToNotesTab(OFFICE_NO);
    }
  });

  test('TC-LOC-NTS-033: Verify a single-character note persists after save and reload', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-033',
      label: 'Notes row 0 — 1-char persist (BVA min)',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.fillNote(0, NOTE_1_CHAR),
      expectBeforeSave: async () => {
        expect(await locationNotesPage.getCharCount()).toBe(1);
        expect(await locationNotesPage.isSaveEnabled()).toBe(true);
      },
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_1_CHAR);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-034: Verify a 3999-character note persists after save and reload', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-034',
      label: 'Notes row 0 — 3999-char persist (BVA -1)',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.pasteIntoNote(0, NOTE_3999_CHARS),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_3999_CHARS);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-035: Whitespace-only " " persist', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-035',
      label: 'Whitespace-only persist',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.fillNote(0, NOTE_WHITESPACE_ONLY),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_WHITESPACE_ONLY);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-036: Leading whitespace " hello" persist (not trimmed)', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-036',
      label: 'Leading whitespace persist',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.fillNote(0, NOTE_LEADING_WS),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_LEADING_WS);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-037: Trailing whitespace "hello " persist (not trimmed)', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-037',
      label: 'Trailing whitespace persist',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.fillNote(0, NOTE_TRAILING_WS),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_TRAILING_WS);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-057: Tab character "a\\tb" persist', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-057',
      label: 'Tab character persist',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.pasteIntoNote(0, NOTE_TAB_CHAR),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_TAB_CHAR);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-038: Verify a multi-line note with line breaks persists after save', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-038',
      label: 'Newline multi-line persist',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.pasteIntoNote(0, NOTE_NEWLINE_MULTI),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_NEWLINE_MULTI);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-058: Edit append', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-058',
      label: 'Edit append after baseline save',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, NOTE_APPEND_BASE);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: () => locationNotesPage.appendToNote(0, NOTE_APPEND_SUFFIX),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_APPEND_BASE + NOTE_APPEND_SUFFIX);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-039: Edit prepend', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-039',
      label: 'Edit prepend after baseline save',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, NOTE_APPEND_BASE);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: () => locationNotesPage.prependToNote(0, NOTE_PREPEND_PREFIX),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_PREPEND_PREFIX + NOTE_APPEND_BASE);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-040: Edit partial-replace (slice middle)', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    const expected =
      NOTE_REPLACE_BASE.slice(0, NOTE_REPLACE_SLICE.start) +
      NOTE_REPLACE_SLICE.replacement +
      NOTE_REPLACE_BASE.slice(NOTE_REPLACE_SLICE.end);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-040',
      label: 'Edit partial-replace slice',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, NOTE_REPLACE_BASE);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: () => locationNotesPage.replaceSliceInNote(
        0, NOTE_REPLACE_SLICE.start, NOTE_REPLACE_SLICE.end, NOTE_REPLACE_SLICE.replacement,
      ),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(expected);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-041: Edit clear-to-empty (row stays with empty value)', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-041',
      label: 'Edit clear-to-empty after baseline save',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, NOTE_APPEND_BASE);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: () => locationNotesPage.clearNote(0),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        // After clear+save+reload, two acceptable states per BUG-LOC-NTS-003 placeholder behavior:
        // (a) row 0 exists with empty textarea value, OR (b) default empty state (no rows).
        // Branch on isDefaultEmptyState — no catch-swallow (clear diagnostics, content not row-count).
        if (await locationNotesPage.isDefaultEmptyState()) {
          expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
        } else {
          expect(await locationNotesPage.getNoteValue(0)).toBe('');
        }
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-042: 2-row positive (smallest multi-row save+reload)', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-042',
      label: '2-row positive',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: async () => {
        await locationNotesPage.fillNote(0, NOTE_2ROW_A);
        await locationNotesPage.clickAdd();
        await locationNotesPage.fillNote(1, NOTE_2ROW_B);
      },
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_2ROW_A);
        expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_2ROW_B);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-043: 5-row positive (smoke at moderate count)', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-043',
      label: '5-row positive',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: async () => {
        for (let i = 0; i < NOTE_5ROW.length; i++) {
          if (i > 0) await locationNotesPage.clickAdd();
          await locationNotesPage.fillNote(i, NOTE_5ROW[i]!);
        }
      },
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        for (let i = 0; i < NOTE_5ROW.length; i++) {
          expect(await locationNotesPage.getNoteValue(i)).toBe(NOTE_5ROW[i]!);
        }
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-044: Mixed-content (note 1 = 1-char, note 2 = 4000-char) save+reload', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-044',
      label: 'Mixed short+long rows',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: async () => {
        await locationNotesPage.fillNote(0, NOTE_MIXED_SHORT);
        await locationNotesPage.clickAdd();
        await locationNotesPage.pasteIntoNote(1, NOTE_MIXED_LONG);
      },
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_MIXED_SHORT);
        expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_MIXED_LONG);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-045: Edit the second of two note rows - first row unchanged after save+reload', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    const editSuffix = ' — edited';
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-045',
      label: 'Edit row 1 leaves row 0 intact',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, NOTE_2ROW_A);
        await locationNotesPage.clickAdd();
        await locationNotesPage.fillNote(1, NOTE_2ROW_B);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: () => locationNotesPage.appendToNote(1, editSuffix),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_2ROW_A);
        expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_2ROW_B + editSuffix);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-046: Verify deleting the first of two note rows leaves the other', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-046',
      label: 'Delete row 0 of 2',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, NOTE_2ROW_A);
        await locationNotesPage.clickAdd();
        await locationNotesPage.fillNote(1, NOTE_2ROW_B);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: async () => {
        await locationNotesPage.clearNote(0);
        await locationNotesPage.deleteRow(0);
      },
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_2ROW_B);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-047: Verify deleting the last of three note rows leaves the first two', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    const r0 = 'r1', r1 = 'r2', r2 = 'r3';
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-047',
      label: 'Delete row 2 of 3',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, r0);
        await locationNotesPage.clickAdd();
        await locationNotesPage.fillNote(1, r1);
        await locationNotesPage.clickAdd();
        await locationNotesPage.fillNote(2, r2);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: async () => {
        await locationNotesPage.clearNote(2);
        await locationNotesPage.deleteRow(2);
      },
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        // Content assertion only — placeholder row from BUG-LOC-NTS-003 may inflate count
        expect(await locationNotesPage.getNoteValue(0)).toBe(r0);
        expect(await locationNotesPage.getNoteValue(1)).toBe(r1);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  // BUG-LOC-NTS-004: Delete button vanishes on single-row form-array after clear() — TC cannot
  // reach the Delete step.
  // BUG-LOC-NTS-004
  // FIXME TC-LOC-NTS-056 (Blocked — the Delete control disappears on a single-row note list after the text is cleared, so the row cannot be deleted. Pending an application fix.)
  test.fixme('TC-LOC-NTS-056: Verify deleting the only note row returns the empty state', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-056',
      label: 'Delete the only row',
      baseline: async () => {
        await locationNotesPage.ensureEmptyState();
        await locationNotesPage.fillNote(0, NOTE_1_CHAR);
        await locationNotesPage.saveAndConfirm();
        await locationNotesPage.reloadAndNavigateToNotesTab();
      },
      act: async () => {
        await locationNotesPage.clearNote(0);
        await locationNotesPage.deleteRow(0);
      },
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        // Either default empty state or a single placeholder empty textarea (BUG-LOC-NTS-003).
        // Branch on isDefaultEmptyState — no catch-swallow (clear diagnostics, content not row-count).
        if (await locationNotesPage.isDefaultEmptyState()) {
          expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
        } else {
          expect(await locationNotesPage.getNoteValue(0)).toBe('');
        }
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

  test('TC-LOC-NTS-048: Verify a note persists after a cancel-then-resave flow', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_CANCEL_RESAVE_INITIAL);
    await locationNotesPage.clickSaveButton();
    await locationNotesPage.cancelSaveDialog();
    expect(await locationNotesPage.isSaveEnabled()).toBe(true);
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_CANCEL_RESAVE_INITIAL);
    await locationNotesPage.clearNote(0);
    await locationNotesPage.fillNote(0, NOTE_CANCEL_RESAVE_FINAL);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteValue(0), 'Note should keep the final saved value after reload').toBe(NOTE_CANCEL_RESAVE_FINAL);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-049: Verify reloading during the save dialog does not persist the note', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    const realPage = locationNotesPage.page;
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_IDEMPOTENT);
    await locationNotesPage.clickSaveButton();
    // Dialog open — now reload mid-dialog. Dialog-on-unload may auto-handle; scope handler
    // via named ref + try/finally + page.off to prevent leak into subsequent tests.
    const dialogHandler = (d: import('@playwright/test').Dialog) => { void d.accept().catch(() => {}); };
    realPage.on('dialog', dialogHandler);
    try {
      await realPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      await locationNotesPage.navigateToNotesTab(OFFICE_NO);
      expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
      await locationNotesPage.ensureEmptyState();
    } finally {
      realPage.off('dialog', dialogHandler);
    }
  });

  test('TC-LOC-NTS-050: Verify pressing Escape on the save dialog cancels without saving', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    const realPage = locationNotesPage.page;
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_ESCAPE_DIALOG);
    await locationNotesPage.clickSaveButton();
    await realPage.keyboard.press('Escape');
    // Dialog should close; form remains dirty in-memory.
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_ESCAPE_DIALOG);
    expect(await locationNotesPage.isSaveEnabled()).toBe(true);
    // Reload discards unsaved changes — scope beforeunload handler via try/finally + page.off.
    const dialogHandler = (d: import('@playwright/test').Dialog) => { void d.accept().catch(() => {}); };
    realPage.on('dialog', dialogHandler);
    try {
      await locationNotesPage.reloadAndNavigateToNotesTab();
      expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
    } finally {
      realPage.off('dialog', dialogHandler);
    }
  });

  test('TC-LOC-NTS-051: Verify the save dialog behavior when clicking outside it', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    const realPage = locationNotesPage.page;
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_ESCAPE_DIALOG);
    await locationNotesPage.clickSaveButton();
    // Click in top-left corner of viewport (outside any modal dialog content).
    await realPage.mouse.click(2, 2);
    // Title-aligned probe: observe whether the alertdialog dismissed or stayed (UX
    // classification of this case is pending). Branch — no opaque OR-assertion.
    const dialogStillOpen = await realPage.locator('[role="alertdialog"]').isVisible().catch(() => false);
    if (dialogStillOpen) {
      // Behavior: click-outside does NOT dismiss the Save dialog — dismiss with Escape to move on.
      await realPage.keyboard.press('Escape').catch(() => {});
      await expect(realPage.locator('[role="alertdialog"]')).toBeHidden({ timeout: 5_000 });
    }
    // Whichever click-outside behavior, reload must discard unsaved changes — nothing persists.
    const dialogHandler = (d: import('@playwright/test').Dialog) => { void d.accept().catch(() => {}); };
    realPage.on('dialog', dialogHandler);
    try {
      await locationNotesPage.reloadAndNavigateToNotesTab();
      expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
    } finally {
      realPage.off('dialog', dialogHandler);
    }
  });

  test('TC-LOC-NTS-052: Verify a second save attempt keeps the Save button disabled', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    // The real save endpoint is `PUT /navigator/api/location/update-properties`; the network wait
    // is narrowed to `/navigator/api/`. POSTs to `/locations/.../settings/location` are Next.js 15
    // App-Router RSC server-component renders (framework hydration POSTs that cascade for 0-8s after
    // any page.reload). Filter narrowed to `/navigator/api/` so the listener captures only real
    // Encore API calls.
    // force:true is preserved — a synthetic MouseEvent on a disabled button proved Angular gates
    // the save inside the click handler (form.dirty/valid check) and aborts before any HTTP request.
    // The test verifies the defense-in-depth contract.
    const realPage = locationNotesPage.page;
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_IDEMPOTENT);
    await locationNotesPage.saveAndConfirm();
    // After save, button should disable (form pristine per the reload-on-tab pattern).
    expect(await locationNotesPage.isSaveEnabled()).toBe(false);
    // Idempotent attempt: force-click the disabled Save button to bypass Playwright's
    // actionability check. The click event is delivered to the Angular handler, which
    // gates on form.dirty/valid and aborts before issuing any save HTTP request.
    const networkRequests: string[] = [];
    const reqHandler = (req: import('@playwright/test').Request) => {
      const method = req.method();
      if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && req.url().includes('/navigator/api/')) {
        networkRequests.push(`${method} ${req.url()}`);
      }
    };
    realPage.on('request', reqHandler);
    try {
      // force:true bypasses Playwright's actionability check (button is disabled by design).
      // catch swallows the click rejection since "did the click attempt fire" is the test, not
      // "did the click succeed". The side-effect assertions below are the real check.
      await realPage.locator('[data-testid="location-settings-btn-save"]').click({ force: true, timeout: 2_000 }).catch(() => {});
      // sleep-ok: a fixed settle window to prove NO save request fires — a negative has no signal
      // to poll for. This is a one-shot probe, not inside a polling loop.
      await realPage.waitForTimeout(1_000);
      expect(await locationNotesPage.isSaveEnabled()).toBe(false);
      expect(networkRequests).toHaveLength(0);
    } finally {
      realPage.off('request', reqHandler);
    }
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-053: Sequential save persists most recent value', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(120_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_SEQUENTIAL_A);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    await locationNotesPage.clearNote(0);
    await locationNotesPage.fillNote(0, NOTE_SEQUENTIAL_B);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    // Verify the final value persisted (content-only persistence check).
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_SEQUENTIAL_B);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-054: Verify saving Notes does not leave the Currency tab unsaved', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(90_000);
    const realPage = locationNotesPage.page;
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_1_CHAR);
    await locationNotesPage.saveAndConfirm();
    // Cross-tab isolation proof: switching to Currency must NOT trigger the "Unsaved Changes"
    // alertdialog. (The shared Save button being disabled only proves Notes is pristine — not
    // that Currency was untouched, because the Save button is page-scoped.)
    const currencyTab = realPage.locator('[data-testid="location-settings-sub-tab-currency"]');
    await currencyTab.click();
    // If Currency had been dirtied as a side-effect of Notes save, navigating away would open
    // the Unsaved-Changes dialog. Asserting count === 0 proves the form was clean before switch.
    await expect(realPage.locator('[data-testid="location-settings-modal-unsaved-changes"]')).toHaveCount(0);
    // Round-trip back to Notes — verify the saved value is still present (Currency tab switch
    // did not corrupt or revert Notes state).
    await locationNotesPage.navigateToNotesTab(OFFICE_NO);
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_1_CHAR);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-055: Verify saved note rows persist by content after reload', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await saveAndVerifyCase({
      id: 'TC-LOC-NTS-055',
      label: 'Placeholder-aware content check',
      baseline: () => locationNotesPage.ensureEmptyState(),
      act: () => locationNotesPage.fillNote(0, NOTE_IDEMPOTENT),
      saveAndConfirm: () => locationNotesPage.saveAndConfirm(),
      reload: () => locationNotesPage.reloadAndNavigateToNotesTab(),
      expectAfterReload: async () => {
        // Content-only assertion — auto-empty placeholder row inflates count.
        expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_IDEMPOTENT);
      },
      cleanup: () => locationNotesPage.ensureEmptyState(),
    });
  });

});

test.describe('Location Notes @locations @notes', () => {

  // Per-test navigation guard — DOM-presence beats url.includes
  // (shared `settings/location` URL across sub-tabs).
  test.beforeEach(async ({ locationNotesPage }) => {
    if (!(await locationNotesPage.isOnNotesTab())) {
      await locationNotesPage.navigateToNotesTab(OFFICE_NO);
    }
    // Per-test baseline: clear notes to the default empty state before every test, so a single
    // test re-run (retry / parallel) starts clean instead of inheriting a prior test's saved rows.
    await locationNotesPage.ensureEmptyState();
  });

 // Live-verified: Default state = 1 empty textarea row (0/4000), NOT "No Notes Available"

  test('TC-LOC-NTS-001: Verify Notes tab default empty state', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await locationNotesPage.navigateToNotesTab(OFFICE_NO);
    await locationNotesPage.ensureEmptyState();
 // Default state: 1 empty textarea, counter 0/4000, Add visible, no Delete
    expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
    expect(await locationNotesPage.getCharCounterText()).toContain(NOTE_COUNTER_EMPTY);
    expect(await locationNotesPage.isAddButtonVisible()).toBe(true);
    expect(await locationNotesPage.isProgressBarVisible()).toBe(true);
    expect(await locationNotesPage.getDeleteButtonCount()).toBe(0);
  });

 // After discard, state = 1 empty row at index 0. Use row 0 directly.

  test('TC-LOC-NTS-002: Type text in the note box and verify counter updates', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
 // Row 0 already exists from default state
    await locationNotesPage.fillNote(0, NOTE_TEXT_SHORT);
    expect(await locationNotesPage.getCharCount()).toBe(25);
    expect(await locationNotesPage.getCharCounterText()).toContain('25/4000');
    expect(await locationNotesPage.isSaveEnabled()).toBe(true);
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-003: Add second note row and verify Delete button behavior', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_ROW1);
    expect(await locationNotesPage.getDeleteButtonCount()).toBeGreaterThan(0);
    await locationNotesPage.clickAdd();
    expect(await locationNotesPage.getNoteRowCount()).toBe(2);
    expect(await locationNotesPage.getDeleteButtonCount()).toBe(2);
    expect(await locationNotesPage.getCharCount()).toBe(11); // 10 + 1 delimiter
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-004: Multi-row counter includes delimiter per row boundary', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_HELLO);
    expect(await locationNotesPage.getCharCount()).toBe(5);
    await locationNotesPage.clickAdd();
    expect(await locationNotesPage.getCharCount()).toBe(6); // +1 delimiter
    await locationNotesPage.fillNote(1, NOTE_WORLD);
    expect(await locationNotesPage.getCharCount()).toBe(11); // 5+1+5
    await locationNotesPage.clickAdd();
    expect(await locationNotesPage.getCharCount()).toBe(12); // +1 delimiter
    await locationNotesPage.fillNote(2, NOTE_END);
    expect(await locationNotesPage.getCharCount()).toBe(15); // 5+1+5+1+3
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-005: Delete a row and verify counter decreases', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_ROW1);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(1, NOTE_ROW2);
    expect(await locationNotesPage.getCharCount()).toBe(22); // 10+1+11
    await locationNotesPage.deleteRow(1);
    expect(await locationNotesPage.getCharCount()).toBe(10);
    expect(await locationNotesPage.getDeleteButtonCount()).toBe(1);
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-006: Progress bar updates proportionally with character usage', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    expect(await locationNotesPage.isProgressBarVisible()).toBe(true);
    await locationNotesPage.fillNote(0, NOTE_40_CHARS);
    expect(await locationNotesPage.isProgressBarVisible()).toBe(true);
    await locationNotesPage.fillNote(0, NOTE_2000_CHARS);
    expect(await locationNotesPage.getCharCount()).toBe(2000);
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-007: Verify 4000 character limit (soft enforcement)', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_4000_CHARS);
    expect(await locationNotesPage.getCharCount()).toBe(4000);
    expect(await locationNotesPage.getCharCounterText()).toContain(NOTE_COUNTER_FULL);
 // Paste 4001 chars — bypasses soft limit
    await locationNotesPage.pasteIntoNote(0, NOTE_4001_CHARS);
    expect(await locationNotesPage.getCharCount()).toBe(4001);
 // Verify no maxlength attribute
    expect(await locationNotesPage.getTextareaMaxlength(0)).toBeNull();
    await locationNotesPage.discardChangesViaReload();
  });


  test('TC-LOC-NTS-008: Save notes via left-panel Save button', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_SAVED);
    expect(await locationNotesPage.getCharCount()).toBe(18);
    await locationNotesPage.clickSaveButton();
    const { heading, body } = await locationNotesPage.getSaveDialogContent();
    expect(heading).toContain(SAVE_CHANGES_DIALOG.heading);
    expect(body).toContain(SAVE_CHANGES_DIALOG.body);
    await locationNotesPage.confirmSaveDialog();
    expect(await locationNotesPage.isSaveEnabled()).toBe(false);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-009: Notes persist after page reload', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.fillNote(0, NOTE_PERSISTENT);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_PERSISTENT);
    expect(await locationNotesPage.getCharCount()).toBeGreaterThanOrEqual(15);
    await locationNotesPage.ensureEmptyState();
  });


  test('TC-LOC-NTS-010: Tab switch preserves unsaved notes', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_TEMPORARY);
    expect(await locationNotesPage.getCharCount()).toBe(14);
    await locationNotesPage.switchToTab('tabCurrency');
    await locationNotesPage.clickNotesTab();
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_TEMPORARY);
    expect(await locationNotesPage.getCharCounterText()).toContain('14/4000');
    await locationNotesPage.discardChangesViaReload();
  });

  test("TC-LOC-NTS-011: Navigating away with unsaved changes shows the browser's leave-page warning", async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_UNSAVED);
    expect(await locationNotesPage.isSaveEnabled()).toBe(true);
    const dialogAppeared = await locationNotesPage.navigateAwayWithUnsavedChanges('/');
    expect(dialogAppeared).toBe(true);
 // Dialog was dismissed — we're still on Notes tab. Discard via reload.
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-012: Delete all notes and save empty state', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_ROW1);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.ensureEmptyState();
 // Reload: default state = 1 empty row (DB is empty)
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
  });


  for (const tc of SPECIAL_CONTENT_TESTS) {
    test(`TC-LOC-NTS-${tc.tcId}: ${tc.name}`, async ({ locationNotesPage, dependencyGate }) => {
      dependencyGate(['TC-LOC-NTS-001']);
      test.setTimeout(60_000);
 // Ensure clean state before each iteration — prior test's cleanup may have
 // left saved notes in DB (e.g. if saveAndConfirm succeeded but ensureEmptyState failed).
      await locationNotesPage.ensureEmptyState();
      await locationNotesPage.fillNote(0, tc.text);
      await locationNotesPage.saveAndConfirm();
      await locationNotesPage.reloadAndNavigateToNotesTab();
      expect(await locationNotesPage.getNoteValue(0)).toBe(tc.text);
      await locationNotesPage.ensureEmptyState();
    });
  }


  test('TC-LOC-NTS-014: Add multiple rows and verify sequential positions', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.prepareEmptyRow();
    await locationNotesPage.clickAdd();
    await locationNotesPage.clickAdd();
    expect(await locationNotesPage.getNoteRowCount()).toBe(3);
    await locationNotesPage.fillNote(0, NOTE_ROW_A);
    await locationNotesPage.fillNote(1, NOTE_ROW_B);
    await locationNotesPage.fillNote(2, NOTE_ROW_C);
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_ROW_A);
    expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_ROW_B);
    expect(await locationNotesPage.getNoteValue(2)).toBe(NOTE_ROW_C);
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-015: Delete middle row and verify remaining rows shift', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_ROW_A);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(1, NOTE_ROW_B);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(2, NOTE_ROW_C);
    expect(await locationNotesPage.getCharCount()).toBe(17); // 5+1+5+1+5
    await locationNotesPage.deleteRow(1); // delete "Row B"
    expect(await locationNotesPage.getNoteRowCount()).toBe(2);
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_ROW_A);
    expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_ROW_C);
    expect(await locationNotesPage.getCharCount()).toBe(11); // 5+1+5
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-016: Row created via Add shows Delete, and typing keeps the row', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
 // Defensive per-test baseline reset. Prior-session DB pollution (e.g., from a preceding test
 // that errored before its own ensureEmptyState cleanup ran) leaves saved rows whose Delete
 // buttons inflate the count assertion below. Resetting here guarantees an empty DB regardless
 // of upstream state.
    await locationNotesPage.ensureEmptyState();
 // After save-empty cycles, state is "No Notes Available". prepareEmptyRow clicks Add.
 // Empty single row = no Delete button (appears only with content or 2+ rows).
    await locationNotesPage.prepareEmptyRow();
    expect(await locationNotesPage.getDeleteButtonCount()).toBe(0);
    expect(await locationNotesPage.getCharCount()).toBe(0);
    await locationNotesPage.fillNote(0, KEYBOARD_TEST.singleChar);
    expect(await locationNotesPage.getDeleteButtonCount()).toBeGreaterThan(0);
    await locationNotesPage.discardChangesViaReload();
  });

  test('TC-LOC-NTS-017: Delete last remaining row restores No Notes Available', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.fillNote(0, NOTE_ROW1);
    expect(await locationNotesPage.getDeleteButtonCount()).toBeGreaterThan(0);
    await locationNotesPage.deleteRow(0);
 // After deleting typed row → "No Notes Available" appears
    expect(await locationNotesPage.isEmptyStateVisible()).toBe(true);
    expect(await locationNotesPage.getCharCount()).toBe(0);
    expect(await locationNotesPage.isAddButtonVisible()).toBe(true);
    await locationNotesPage.discardChangesViaReload();
  });


  test('TC-LOC-NTS-021: Paste exceeds 4000 char limit - counter shows overage', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.pasteIntoNote(0, NOTE_4001_CHARS);
    expect(await locationNotesPage.getCharCount()).toBe(4001);
    expect(await locationNotesPage.getCharCounterText()).toContain('4001/4000');
    await locationNotesPage.discardChangesViaReload();
  });


  test('TC-LOC-NTS-022: Accessibility - keyboard navigation', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    await locationNotesPage.prepareEmptyRow();
    const textarea = locationNotesPage.getNoteTextarea(0);
    await textarea.waitFor({ state: 'visible', timeout: 5_000 });
    await textarea.focus();
    await textarea.type(KEYBOARD_TEST.text);
    expect(await locationNotesPage.getNoteValue(0)).toContain(KEYBOARD_TEST.text);
    expect(await locationNotesPage.isProgressBarVisible()).toBe(true);
    await locationNotesPage.discardChangesViaReload();
  });


  test('TC-LOC-NTS-023: Full lifecycle - add, save, reload, delete, save', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.fillNote(0, NOTE_LIFECYCLE);
    expect(await locationNotesPage.getCharCount()).toBe(20);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_LIFECYCLE);
    expect(await locationNotesPage.getCharCount()).toBeGreaterThanOrEqual(20);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
  });


  test('TC-LOC-NTS-024: Multi-row persistence - 3 rows save+reload+verify', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_ROW_ALPHA);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(1, NOTE_ROW_BETA);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(2, NOTE_ROW_GAMMA);
    expect(await locationNotesPage.getNoteRowCount()).toBe(3);
    expect(await locationNotesPage.getCharCount()).toBe(28); // 9+1+8+1+9
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
 // Verify persistence via per-row content (strict row count is unstable under the
 // auto-empty placeholder behavior documented in the test cases; per-row content
 // assertions below cover the persistence contract without the flake risk).
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_ROW_ALPHA);
    expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_ROW_BETA);
    expect(await locationNotesPage.getNoteValue(2)).toBe(NOTE_ROW_GAMMA);
    expect(await locationNotesPage.getCharCount()).toBe(28);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-025: Boundary persistence - 4000 chars save+reload', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_4000_CHARS);
    expect(await locationNotesPage.getCharCount()).toBe(4000);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getCharCount()).toBe(4000);
    const value = await locationNotesPage.getNoteValue(0);
    expect(value.length).toBe(4000);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-026: Partial deletion persistence - delete middle row, save, verify remaining', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_KEEP_FIRST);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(1, NOTE_DELETE_ME);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(2, NOTE_KEEP_LAST);
    expect(await locationNotesPage.getNoteRowCount()).toBe(3);
    await locationNotesPage.deleteRow(1);
    expect(await locationNotesPage.getNoteRowCount()).toBe(2);
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_KEEP_FIRST);
    expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_KEEP_LAST);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteRowCount()).toBe(2);
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_KEEP_FIRST);
    expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_KEEP_LAST);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-027: Cancel save dialog - verify changes NOT persisted', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_CANCEL_TEST);
    expect(await locationNotesPage.isSaveEnabled()).toBe(true);
    await locationNotesPage.clickSaveButton();
    await locationNotesPage.cancelSaveDialog();
    expect(await locationNotesPage.isSaveEnabled()).toBe(true); // still unsaved
 // Reload (discards unsaved changes) + verify note is NOT present
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
  });

 // Live-verified 2026-05-12: sequential save, edit-existing, save-empty, overage persistence, delete-persist

  test('TC-LOC-NTS-028: Sequential save - add second note with reload between saves, both persist', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_SEQ_A);
    await locationNotesPage.saveAndConfirm();
 // Reload required: Playwright .fill() does NOT trigger Angular change detection after the
 // form's markAsPristine() runs post-save. Real user typing works fine — this is an
 // automation-tool limitation, not an app bug (manually verified live 2026-05-14).
 // Prior runs showed the Save button did not enable within 5s.
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_SEQ_A);
    await locationNotesPage.clickAdd();
    await locationNotesPage.fillNote(1, NOTE_SEQ_B);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteRowCount()).toBe(2);
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_SEQ_A);
    expect(await locationNotesPage.getNoteValue(1)).toBe(NOTE_SEQ_B);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-029: Edit existing saved note - overwritten text persists', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_ORIGINAL);
    await locationNotesPage.saveAndConfirm();
 // Reload required: Playwright .fill() does NOT trigger Angular change detection after the
 // form's markAsPristine() runs post-save. Real user typing works fine — this is an
 // automation-tool limitation, not an app bug (manually verified live 2026-05-14).
 // Prior runs showed the Save button did not enable within 5s.
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_ORIGINAL);
    await locationNotesPage.fillNote(0, NOTE_EDITED);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_EDITED);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-030: Save empty row - persists as empty note box, not No Notes Available', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
 // Add empty row (don't type anything) — Save enables from form-dirty on Add
    await locationNotesPage.prepareEmptyRow();
    expect(await locationNotesPage.isSaveEnabled()).toBe(true);
    await locationNotesPage.saveAndConfirm();
 // Reload + verify: 1 empty textarea persisted (NOT "No Notes Available")
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteRowCount()).toBe(1);
    expect(await locationNotesPage.getNoteValue(0)).toBe('');
    expect(await locationNotesPage.getCharCount()).toBe(0);
    expect(await locationNotesPage.isEmptyStateVisible()).toBe(false);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-031: Overage content persists - 4001 chars save+reload without truncation', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
 // Paste 4001 chars — exceeds soft 4000-char counter limit (textarea has no maxlength attribute)
    await locationNotesPage.pasteIntoNote(0, NOTE_4001_CHARS);
    expect(await locationNotesPage.getCharCount()).toBe(4001);
    expect(await locationNotesPage.getCharCounterText()).toContain('(0 Left)');
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
 // Verify all 4001 chars survived — no server-side truncation
    expect(await locationNotesPage.getCharCount()).toBe(4001);
    const value = await locationNotesPage.getNoteValue(0);
    expect(value.length).toBe(4001);
    await locationNotesPage.ensureEmptyState();
  });

  test('TC-LOC-NTS-032: Delete row persists without explicit note box clear', async ({ locationNotesPage, dependencyGate }) => {
    dependencyGate(['TC-LOC-NTS-001']);
    test.setTimeout(60_000);
    await locationNotesPage.ensureEmptyState();
    await locationNotesPage.fillNote(0, NOTE_DELETE_CHECK);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.getNoteValue(0)).toBe(NOTE_DELETE_CHECK);
 // Delete row WITHOUT clearing textarea first (BUG-LOC-NTS-001 regression check)
    await locationNotesPage.deleteRow(0);
    expect(await locationNotesPage.isEmptyStateVisible()).toBe(true);
    await locationNotesPage.saveAndConfirm();
    await locationNotesPage.reloadAndNavigateToNotesTab();
    expect(await locationNotesPage.isDefaultEmptyState()).toBe(true);
  });

});
