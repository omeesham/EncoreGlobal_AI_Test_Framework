import { test, expect } from '../../src/fixtures/pages.fixture';
import { HISTORY_COMBOBOX } from '../../src/data/local-office/local-office-history';
import { OFFICE_NO } from '../../src/data/common';

test.describe('Local Office Settings — History Tab @local-office-history', () => {

  // Per-test navigation guard.
  // Re-navigates only when retry-recycle landed on /home.
  test.beforeEach(async ({ localOfficeHistoryPage }) => {
    const url = localOfficeHistoryPage.getCurrentUrl();
    if (!url.includes('settings/local-office')) {
      await localOfficeHistoryPage.reloadBasicInfo(OFFICE_NO);
      await localOfficeHistoryPage.navigateToHistoryTab();
    }
  });

  test('TC-LOS-HIS-001: History tab — type selector and table visible', async ({ localOfficeHistoryPage, dependencyGate }) => {
    dependencyGate([]);
    test.setTimeout(60_000);
    await localOfficeHistoryPage.navigateToBasicInfoTab(OFFICE_NO);
    await localOfficeHistoryPage.navigateToHistoryTab();
    expect(await localOfficeHistoryPage.isTabSelected('tabHistory'), 'History tab should be active').toBe(true);
    expect(await localOfficeHistoryPage.isElementVisible('drpHistoryType'), 'History type selector should be visible').toBe(true);
    expect(await localOfficeHistoryPage.getComboboxValue('drpHistoryType')).toContain(HISTORY_COMBOBOX.default);
    expect(await localOfficeHistoryPage.isElementVisible('tblHistory')).toBe(true);
  });

  test('TC-LOS-HIS-002: History table has column headers', async ({ localOfficeHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOS-HIS-001']);
    const columnCount = await localOfficeHistoryPage.getHistoryColumnHeaderCount();
    expect(columnCount, 'History table should show column headers').toBeGreaterThan(0);
  });

 // HIS-003: Office 1604 always has history records — verify table has data (original empty-state test was unreproducible).
  test('TC-LOS-HIS-003: History table has data for office 1604', async ({ localOfficeHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOS-HIS-001']);
    expect(await localOfficeHistoryPage.isHistoryTableEmpty(), 'History table should contain data rows').toBe(false);
  });

  test('TC-LOS-HIS-004: History type selector — 2 options', async ({ localOfficeHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOS-HIS-001']);
    const options = await localOfficeHistoryPage.getComboboxOptionsList('drpHistoryType');
    expect(options).toHaveLength(2);
    expect(options).toEqual(
      expect.arrayContaining([...HISTORY_COMBOBOX.options]),
    );
  });

  test('TC-LOS-HIS-005: Pagination controls present', async ({ localOfficeHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOS-HIS-001']);
    const navBtnCount = await localOfficeHistoryPage.getHistoryPaginationButtonCount();
    expect(navBtnCount).toBeGreaterThan(0);
  });

  // Re-enabled 2026-06-02: isHistoryTabReadOnly() now scopes the editable-field count to tblHistory
  // (the data <table>); the paginator "Current page number" <input> lives OUTSIDE it (live walk
  // 2026-06-02). The data table is genuinely input-free.
  test('TC-LOS-HIS-006: History tab is read-only — no Save, no editable fields', async ({ localOfficeHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOS-HIS-001']);
    expect(await localOfficeHistoryPage.isHistoryTabReadOnly()).toBe(true);
  });

  test('TC-LOS-HIS-007: Sort buttons present', async ({ localOfficeHistoryPage, dependencyGate }) => {
    dependencyGate(['TC-LOS-HIS-001']);
    const sortButtonCount = await localOfficeHistoryPage.getHistorySortButtonCount();
    expect(sortButtonCount).toBeGreaterThan(0);
  });

});
