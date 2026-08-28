import { Locator, Page, expect } from '@playwright/test';
import { statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { step } from '../../fixtures/step-decorator';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { DiscountMatrixBasePage } from './discount-matrix.page';
import { discountMatrixShared as S } from '../../selectors/discount-matrix/shared';
import { regionWeeklyPeaks as R } from '../../selectors/discount-matrix/region-weekly-peaks';
import { DM_OFFICE } from '../../data/discount-matrix/discount-matrix';

/** One grid row: week number, start date, and the three classification states in column order Non-Peak / Standard / Peak. */
export interface WeekRow {
  week: string;
  startDate: string;
  checks: boolean[];
}

/**
 * Region Weekly Peaks tab of the Discount Matrix page.
 *
 * Two-stage load (measured 2026-08-25): at tab click the grid instantly renders 52 placeholder
 * rows with ZERO checkboxes and a footer of `Count: 0`; real data lands ~40s later as 156
 * checkboxes and `Count: 52`. Every ready gate here therefore waits for classification
 * checkboxes to exist and placeholders to clear — row count cannot tell the states apart.
 */
export class RegionWeeklyPeaksPage extends DiscountMatrixBasePage {
  /** Tab click → usable data is ~40s on a warm page and much longer on a cold one. */
  protected static readonly RWP_READY_TIMEOUT = 240_000;

  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('RegionWeeklyPeaksPage initialized');
  }

  /** The tab's own panel — every colliding button name is resolved inside it. */
  panel(): Locator {
    return this.page.locator(S.pnlRegionWeekly);
  }

  // ---------------------------------------------------------------- open & readiness

  /** Clicks the Region Weekly Peaks tab and waits for real data. */
  @step('Open the Region Weekly Peaks tab')
  async openTab(): Promise<void> {
    await this.clickTab(S.TAB_REGION_WEEKLY_PEAKS);
    await this.waitForRwpReady();
  }

  /**
   * Clicks the tab WITHOUT waiting for data — used by the case that observes the loading
   * state itself (placeholders present, footer still `Count: 0`).
   */
  @step('Open the Region Weekly Peaks tab without waiting for data')
  async openTabRaw(): Promise<void> {
    await this.clickTab(S.TAB_REGION_WEEKLY_PEAKS);
    await this.panel().waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Waits until real data has arrived: classification checkboxes exist and placeholders are gone. */
  @step('Wait for the weekly grid to finish loading')
  async waitForRwpReady(timeout: number = RegionWeeklyPeaksPage.RWP_READY_TIMEOUT): Promise<void> {
    await this.panel().waitFor({ state: 'visible', timeout: 30_000 });
    await expect
      .poll(async () => this.panel().locator(R.chkAny).count(), { timeout })
      .toBeGreaterThan(0);
    await expect(this.page.locator(S.skeleton)).toHaveCount(0, { timeout: 60_000 });
    await this.waitForAngularStable();
  }

  /**
   * Per-test baseline guard: page open on the office, Region Weekly Peaks active with real
   * data, panel Save disabled (pristine). Any violation triggers a reload + reopen — the only
   * reliable cleaner.
   */
  @step('Make sure the weekly grid is loaded with no unsaved changes')
  async ensureCleanRwp(office: string = DM_OFFICE): Promise<void> {
    let pristine = false;
    const onPage = this.page.url().includes('/settings/discount-matrix');
    if (onPage && (await this.getActiveTabName()) === S.TAB_REGION_WEEKLY_PEAKS) {
      const dataReady =
        (await this.panel().locator(R.chkAny).count()) > 0 &&
        (await this.page.locator(S.skeleton).count()) === 0;
      if (dataReady) {
        pristine = !(await this.toolbarButton(R.BTN_SAVE).isEnabled().catch(() => false));
      }
    }
    if (!pristine) {
      Log.info('[baseline] weekly grid not pristine — reloading');
      await this.open(office);
      await this.openTab();
    }
  }

  // ---------------------------------------------------------------- selectors & toolbar

  yearDropdown(): Locator {
    return this.page.locator(R.drpYear);
  }

  regionDropdown(): Locator {
    return this.page.locator(R.drpRegion);
  }

  /** Current visible Year / Region selections. */
  @step('Read the Year and Region selections')
  async readSelections(): Promise<{ year: string; region: string }> {
    const year = ((await this.yearDropdown().textContent().catch(() => '')) ?? '').trim();
    const region = ((await this.regionDropdown().textContent().catch(() => '')) ?? '').trim();
    return { year, region };
  }

  /** Full option list of the Year selector (opens and Escape-closes the list; no mutation). */
  @step('Read the year options')
  async readYearOptions(): Promise<string[]> {
    return this.readListboxOptions(this.yearDropdown());
  }

  /** Full option list of the Region selector (opens and Escape-closes the list; no mutation). */
  @step('Read the region options')
  async readRegionOptions(): Promise<string[]> {
    return this.readListboxOptions(this.regionDropdown());
  }

  /** Selects a year and waits for the grid to reload with real data. */
  @step('Choose a year')
  async selectYear(year: string): Promise<void> {
    await this.selectListboxOption(this.yearDropdown(), year);
    await this.waitForGridReload();
  }

  /** Selects a region and waits for the grid to reload with real data. */
  @step('Choose a region')
  async selectRegion(region: string): Promise<void> {
    await this.selectListboxOption(this.regionDropdown(), region);
    await this.waitForGridReload();
  }

  /** Opens the Region list and closes it with Escape without choosing (dirty-state probe). */
  @step('Open and dismiss the region list')
  async openAndDismissRegion(): Promise<void> {
    const listbox = await this.openListbox(this.regionDropdown());
    await this.page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }

  /**
   * Waits for a selector-driven reload: the swap may briefly re-paint placeholders and always
   * ends with checkboxes present again.
   */
  @step('Wait for the weekly grid to reload')
  async waitForGridReload(timeout: number = RegionWeeklyPeaksPage.RWP_READY_TIMEOUT): Promise<void> {
    await expect
      .poll(async () => this.panel().locator(R.chkAny).count(), { timeout })
      .toBeGreaterThan(0);
    await expect(this.page.locator(S.skeleton)).toHaveCount(0, { timeout: 60_000 });
    await this.waitForAngularStable();
  }

  /** A toolbar button by its exact name, scoped to this panel (names collide across tabs). */
  toolbarButton(name: string): Locator {
    return this.panel().getByRole('button', { name, exact: true });
  }

  /** Enabled-state of all five toolbar buttons, keyed by name — one pass, no repeated lookups. */
  @step('Read the toolbar button states')
  async readToolbarDisabled(): Promise<Record<string, boolean>> {
    const names = [R.BTN_ADD_YEAR, R.BTN_EXPORT, R.BTN_IMPORT, R.BTN_CANCEL, R.BTN_SAVE];
    const out: Record<string, boolean> = {};
    for (const name of names) {
      out[name] = await this.toolbarButton(name).isDisabled().catch(() => true);
    }
    return out;
  }

  // ---------------------------------------------------------------- grid reads (single-pass)

  /**
   * Reads the whole grid in ONE browser call: week number, start date, and the three
   * classification states per row. Never per-row round-trips — at 52 rows a per-row reader
   * takes tens of seconds and starves every poll built on top of it.
   */
  @step('Read the weekly grid')
  async readWeekRows(): Promise<WeekRow[]> {
    return this.panel().locator(R.rowAny).evaluateAll((rows) =>
      rows.map((r) => {
        const cells = Array.from(r.querySelectorAll('td'));
        const boxes = Array.from(r.querySelectorAll('[role="checkbox"]'));
        return {
          week: (cells[0]?.textContent ?? '').trim(),
          startDate: (cells[1]?.textContent ?? '').trim(),
          checks: boxes.map((b) => b.getAttribute('aria-checked') === 'true'),
        };
      }),
    );
  }

  /** Grid column header texts, left to right, in one call. */
  @step('Read the grid column headers')
  async readColumnHeaders(): Promise<string[]> {
    const headers = await this.panel().locator(R.colHeaderAny).allTextContents();
    return headers.map((h) => h.trim()).filter((h) => h.length > 0);
  }

  /** The footer count number (e.g. 52 from `Count: 52`), or null when no footer is rendered. */
  @step('Read the footer count')
  async readFooterCount(): Promise<number | null> {
    const el = this.panel().locator(R.lblCount).first();
    if ((await el.count()) === 0) return null;
    const m = ((await el.textContent()) ?? '').match(/Count:\s*(\d+)/);
    return m && m[1] ? parseInt(m[1], 10) : null;
  }

  /** Count of classification checkboxes currently rendered (0 while the grid is still loading). */
  @step('Count the classification boxes')
  async checkboxCount(): Promise<number> {
    return this.panel().locator(R.chkAny).count();
  }

  /** Count of skeleton placeholders currently painted anywhere on the page. */
  @step('Count the loading placeholders')
  async skeletonCount(): Promise<number> {
    return this.page.locator(S.skeleton).count();
  }

  // ---------------------------------------------------------------- classification edits

  /** A week's row, anchored by the exact text of its Week cell — never by row index. */
  weekRowLocator(week: string): Locator {
    return this.panel().locator(`tbody tr:has(td:first-child:text-is("${week}"))`);
  }

  /** The three classification boxes of one week, in column order Non-Peak / Standard / Peak. */
  private weekChecks(week: string): Locator {
    return this.weekRowLocator(week).locator(R.chkAny);
  }

  /** Which of the three boxes are ticked for a week, read in one call. */
  @step('Read a week’s classification')
  async readWeekChecks(week: string): Promise<boolean[]> {
    return this.weekChecks(week).evaluateAll((boxes) =>
      boxes.map((b) => b.getAttribute('aria-checked') === 'true'),
    );
  }

  /** Clicks one of a week's three classification boxes (0 = Non-Peak, 1 = Standard, 2 = Peak). */
  @step('Click a week’s classification box')
  async clickWeekCheck(week: string, columnIndex: number): Promise<void> {
    await this.weekChecks(week).nth(columnIndex).click();
    await this.waitForAngularStable(5_000).catch(() => {});
  }

  /** Polls the panel Save button until it reaches the wanted enabled-state. */
  @step('Wait for the panel Save state')
  async waitForPanelSaveEnabled(enabled: boolean, timeout: number = 10_000): Promise<boolean> {
    return expect
      .poll(async () => this.toolbarButton(R.BTN_SAVE).isEnabled().catch(() => false), { timeout })
      .toBe(enabled)
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Clicks the panel Save and confirms a dialog if one appears (same defensive shape as the
   * criteria Save). The save travels as its own POST on the page route, but the same route
   * also runs the page's serial rotation of sync POSTs (each 8-40s, back to back), so the
   * save can sit queued for ~18s before it even dispatches. Waiting for just "a POST to
   * complete" can therefore release on a rotation member while the save is still queued —
   * and a navigation at that point kills the queued save with nothing persisted (measured
   * from the run traces, 2026-08-26). This waits until every page-route POST dispatched
   * after the Save click has completed; 90s bounds the measured worst case (~18s queue +
   * ~40s run). The wait paces the return only; persistence is always proven by
   * reload-and-read.
   */
  @step('Save the weekly grid')
  async clickPanelSave(): Promise<void> {
    const isPageRoutePost = (req: { method(): string; url(): string }): boolean =>
      req.method() === 'POST' && req.url().includes('/settings/discount-matrix');
    const dispatchedAfterClick = new Set<object>();
    const completedAfterClick = new Set<object>();
    const onRequest = (req: { method(): string; url(): string }): void => {
      if (isPageRoutePost(req)) dispatchedAfterClick.add(req);
    };
    const onFinished = (req: { method(): string; url(): string }): void => {
      if (dispatchedAfterClick.has(req)) completedAfterClick.add(req);
    };
    this.page.on('request', onRequest);
    this.page.on('requestfinished', onFinished);
    try {
      await this.toolbarButton(R.BTN_SAVE).click();
      const dlg = this.page.locator(S.dlgAnyAlert);
      const appeared = await dlg.waitFor({ state: 'visible', timeout: 4_000 })
        .then(() => true).catch(() => false);
      if (appeared) {
        Log.info('save confirmation dialog appeared — confirming');
        await dlg.locator('button:text-is("Ok"), button:text-is("Save"), button:text-is("Yes")')
          .first()
          .click();
        await dlg.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
      }
      await this.waitForAngularStable();
      const deadline = Date.now() + 90_000;
      const saveSettled = (): boolean =>
        completedAfterClick.size > 0 && completedAfterClick.size === dispatchedAfterClick.size;
      while (!saveSettled() && Date.now() < deadline) {
        const resp = await this.page
          .waitForResponse((r) => isPageRoutePost(r.request()), {
            timeout: Math.max(1_000, deadline - Date.now()),
          })
          .catch(() => null);
        if (resp && dispatchedAfterClick.has(resp.request())) {
          completedAfterClick.add(resp.request());
        }
      }
      if (!saveSettled()) {
        Log.warn('no post-click page-route POST completed within 90s of Save — verify persistence by reload');
      }
      // The save can also sit in an app-internal queue BEFORE it becomes a network request,
      // where no network observer can see it — and navigating then kills it (measured from
      // the run traces, 2026-08-26: the leave-page prompt fired at the reload and the queued
      // save aborted). The app's own pending-changes flag is the truthful commit signal, and
      // it is probeable without navigating: dispatch a synthetic cancelable beforeunload and
      // read whether a handler cancelled it. Wait until the flag clears.
      await this.page
        .waitForFunction(
          () => {
            const probe = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(probe);
            return !probe.defaultPrevented;
          },
          undefined,
          { timeout: 90_000, polling: 1_000 },
        )
        .catch(() => {
          Log.warn('the pending-changes flag is still set after the save wait — verify persistence by reload');
        });
    } finally {
      this.page.off('request', onRequest);
      this.page.off('requestfinished', onFinished);
    }
  }

  /**
   * Persists a week's classification and PROVES it landed: click the column, save, reload,
   * re-open the tab, read back — with bounded retry. This is the restore path for any test
   * that saved a classification; a conditional "save if it enabled in time" restore can
   * silently skip and leak the test's value to the shared server.
   */
  @step('Persist a week classification and verify it landed')
  async persistWeekClassification(week: string, columnIndex: number, office: string = DM_OFFICE): Promise<void> {
    const atTarget = async (): Promise<boolean> => {
      const checks = await this.readWeekChecks(week);
      return checks[columnIndex] === true && checks.filter(Boolean).length === 1;
    };
    await this.saveAndVerifyPersisted({
      label: `week ${week} classification column ${columnIndex}`,
      isAtTarget: atTarget,
      applyMutation: async () => {
        await this.clickWeekCheck(week, columnIndex);
        // The tick must be visible in the grid before the save serializes: under load the
        // grid state can lag the click, and a save built from the stale state returns
        // success having changed nothing (measured from the run traces, 2026-08-26).
        await expect
          .poll(async () => (await this.readWeekChecks(week))[columnIndex], { timeout: 30_000 })
          .toBe(true);
      },
      save: async () => {
        if (!(await this.waitForPanelSaveEnabled(true, 30_000))) {
          throw new Error('panel Save did not enable after the classification was re-set');
        }
        await this.clickPanelSave();
      },
      reload: async () => {
        await this.discardReload(office);
        await this.openTab();
      },
    });
  }

  /**
   * Clears every classification from a week and PROVES the cleared state survived a reload.
   * Counterpart of persistWeekClassification for tests that must leave a week unclassified.
   */
  @step('Clear a week’s classification and verify it landed')
  async clearWeekClassificationPersisted(week: string, office: string = DM_OFFICE): Promise<void> {
    await this.saveAndVerifyPersisted({
      label: `week ${week} cleared classification`,
      isAtTarget: async () => (await this.readWeekChecks(week)).every((c) => !c),
      applyMutation: async () => {
        const checks = await this.readWeekChecks(week);
        for (let i = 0; i < checks.length; i++) {
          if (checks[i]) await this.clickWeekCheck(week, i);
        }
        // Every uncheck must be visible before the save serializes — a save built from a
        // stale grid state returns success having changed nothing.
        await expect
          .poll(async () => (await this.readWeekChecks(week)).every((c) => !c), { timeout: 30_000 })
          .toBe(true);
      },
      save: async () => {
        if (!(await this.waitForPanelSaveEnabled(true, 30_000))) {
          throw new Error('panel Save did not enable after the classification was cleared');
        }
        await this.clickPanelSave();
      },
      reload: async () => {
        await this.discardReload(office);
        await this.openTab();
      },
    });
  }

  // ---------------------------------------------------------------- year creation & file transfer

  /** The Create Year window (opened by the Add Year button). */
  createYearDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: R.CREATE_YEAR_TITLE }).first();
  }

  /** Opens the Create Year window. */
  @step('Open the Create Year window')
  async openCreateYear(): Promise<void> {
    await this.toolbarButton(R.BTN_ADD_YEAR).click();
    await this.createYearDialog().waitFor({ state: 'visible', timeout: 15_000 });
  }

  /**
   * Waits for the Create Year window to finish its own load. The window opens with every
   * control disabled while it fetches; enablement of the year selector is the ready signal.
   * Slow by a known, tracked performance issue — hence the generous ceiling.
   */
  @step('Wait for the Create Year window to finish loading')
  async waitForCreateYearReady(timeout: number = 240_000): Promise<void> {
    await expect
      .poll(async () => this.page.locator(R.drpCreateYear).isEnabled().catch(() => false), { timeout })
      .toBe(true);
  }

  /** Reads the years the Create Year window offers. */
  @step('Read the years offered for creation')
  async readOfferedYears(): Promise<string[]> {
    await this.page.locator(R.drpCreateYear).click();
    const options = (await this.page.getByRole('option').allTextContents()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return options;
  }

  /** Whether the window's "Initialize with previous year" box is ticked. */
  @step('Read the initialize-with-previous-year box')
  async initPrevYearChecked(): Promise<boolean> {
    return this.page.locator(R.chkInitPrevYear).isChecked();
  }

  /** Dismisses the Create Year window without creating anything. */
  @step('Cancel the Create Year window')
  async cancelCreateYear(): Promise<void> {
    await this.createYearDialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await this.createYearDialog().waitFor({ state: 'hidden', timeout: 15_000 });
  }

  /**
   * Selects the given year in the Create Year window and creates it. Creation is server-side
   * and slow (same tracked performance issue) — the window closing is the completion signal.
   */
  @step('Create a year')
  async createYear(year: string, timeout: number = 300_000): Promise<void> {
    await this.page.locator(R.drpCreateYear).click();
    await this.page.getByRole('option', { name: year, exact: true }).click();
    await this.createYearDialog().getByRole('button', { name: R.CREATE_YEAR_TITLE, exact: true }).click();
    await this.createYearDialog().waitFor({ state: 'hidden', timeout });
  }

  /** The numerically largest year currently offered by the Year selector. */
  @step('Read the newest year in the selector')
  async newestYear(): Promise<string> {
    const years = (await this.readYearOptions()).map(Number).sort((a, b) => b - a);
    if (years.length === 0) throw new Error('the Year selector offered no years');
    return String(years[0]);
  }

  /**
   * Clicks Export and returns the downloaded file's name, size, and a copy saved under a
   * real `.xlsx` name. The saved copy is what Import must be fed: the app silently ignores
   * an uploaded file that does not carry the workbook extension, and the download's raw
   * temporary file carries no extension at all — feeding that one back produces a no-op
   * with no message (measured 2026-08-26: the same workbook applied in ~41s once saved
   * under its proper name).
   */
  @step('Export the selected year')
  async exportDownload(): Promise<{ filename: string; path: string; bytes: number }> {
    const downloadPromise = this.page.waitForEvent('download', { timeout: 60_000 });
    await this.toolbarButton(R.BTN_EXPORT).click();
    const download = await downloadPromise;
    const savedPath = join(tmpdir(), `region-weekly-peak-export-${Date.now()}.xlsx`);
    await download.saveAs(savedPath);
    return {
      filename: download.suggestedFilename(),
      path: savedPath,
      bytes: statSync(savedPath).size,
    };
  }

  /** Clicks Import and feeds the given workbook into the file chooser it opens. */
  @step('Import a peak-classification file')
  async importFile(filePath: string): Promise<void> {
    const chooserPromise = this.page.waitForEvent('filechooser', { timeout: 30_000 });
    await this.toolbarButton(R.BTN_IMPORT).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(filePath);
  }
}
