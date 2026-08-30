import { Page, Locator, Request, Response } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { serviceChargeText as sct } from '../../selectors/service-charge-text/service-charge-text';
import { SCT_FILTER_LANGUAGES } from '../../data/service-charge-text/service-charge-text';

// Service Charge Text setup page: one row per language entry, wording edited in a rich text
// panel. Save follows data validity, not whether a row was added or touched.
export class ServiceChargeTextPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('ServiceChargeTextPage initialized');
  }

  /** Opens the page for an office and waits for the grid to replace the loading placeholder. */
  @step('Open the Service Charge Text page for an office')
  async open(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}locations/${officeNo}/settings/service-charge-text`);
    await this.waitForGrid();
  }

  // Load gate for the whole page. Visibility alone is not enough — the table stays mounted
  // across a filter change and only its rows swap, so this polls until the row count settles.
  @step('Wait for the Service Charge Text grid to appear')
  async waitForGrid(timeout = 45_000): Promise<void> {
    await this.page.locator(sct.table).first().waitFor({ state: 'visible', timeout });
    // Poll until row count stabilises — two identical consecutive counts mean the render is done.
    const deadline = Date.now() + timeout;
    let prev = -1;
    while (Date.now() < deadline) {
      const current = await this.page.locator(sct.bodyRows).count();
      if (current === prev) break;
      prev = current;
      await this.page.waitForTimeout(300);
    }
    await this.waitForAngularStable();
  }

  /** Exposes Angular zone stability wait for callers that need to wait after an action. */
  @step('Wait for the page to finish updating')
  async waitForStable(timeout = 10_000): Promise<void> {
    await this.waitForAngularStable(timeout);
  }

  // Probes the beforeunload guard with a synthetic event instead of navigating.
  // A disabled Save button does NOT mean the dirty flag has cleared.
  @step('Wait until it is safe to navigate away from the page')
  async waitForNavigationSafe(timeout = 10_000): Promise<boolean> {
    try {
      await this.page.waitForFunction(() => {
        const e = new Event('beforeunload', { cancelable: true });
        Object.defineProperty(e, 'returnValue', { writable: true, value: '' });
        window.dispatchEvent(e);
        return !e.defaultPrevented && !(e as any).returnValue;
      }, undefined, { timeout, polling: 250 });
      return true;
    } catch {
      return false;
    }
  }

  /** Reloads the page and waits for the grid. Discards anything not yet saved. */
  @step('Reload the page and wait for the grid')
  async reloadAndWait(officeNo: string = '1604'): Promise<void> {
    await this.open(officeNo);
  }

  // ---------------------------------------------------------------- reading state

  /** Number of data rows currently shown in the grid. */
  @step('Get the number of rows in the grid')
  async getRowCount(): Promise<number> {
    return this.page.locator(sct.bodyRows).count();
  }

  /** Column header text, in display order. */
  @step('Read the column header text in display order')
  async getColumnHeaders(): Promise<string[]> {
    const raw = await this.page.locator(sct.headers).allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  /** Whether Save is currently unavailable. Waits for the button to attach before checking. */
  @step('Check whether the Save button is unavailable')
  async isSaveDisabled(timeout = 5_000): Promise<boolean> {
    const btn = this.page.locator(sct.save).first();
    await btn.waitFor({ state: 'attached', timeout });
    const disabledAttr = await btn.isDisabled();
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    return disabledAttr || ariaDisabled === 'true';
  }

  /** Waits until Save becomes available, then reports whether it did. */
  @step('Wait until the Save button becomes available')
  async waitForSaveAvailable(timeout = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (!(await this.isSaveDisabled(Math.min(1_000, Math.max(deadline - Date.now(), 1))))) return true;
      } catch {
        // Button transiently absent (mid-rerender) — retry within budget
      }
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  /** Waits until Save becomes unavailable, then reports whether it did. */
  @step('Wait until the Save button becomes unavailable')
  async waitForSaveUnavailable(timeout = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await this.isSaveDisabled(Math.min(1_000, Math.max(deadline - Date.now(), 1)))) return true;
      } catch {
        // Button transiently absent (mid-rerender) — retry within budget
      }
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  /** Current Service Charge Name of a row. */
  @step('Read the Service Charge Name of a row')
  async getRowName(row: number): Promise<string> {
    return this.page.locator(sct.rowName(row)).inputValue();
  }

  /** Every Service Charge Name currently in the grid. */
  @step('Read all Service Charge Names from the grid')
  async getAllNames(): Promise<string[]> {
    return this.page.locator(sct.allNames).evaluateAll((els) =>
      els.map((e) => (e as HTMLInputElement).value)
    );
  }

  /** Index of the last row, for working with a row that was just added. */
  @step('Get the index of the last row in the grid')
  async getLastRowIndex(): Promise<number> {
    return (await this.page.locator(sct.allNames).count()) - 1;
  }

  // ---------------------------------------------------------------- editing

  /** Types a Service Charge Name into a row and moves focus away. */
  @step('Type a Service Charge Name into a row and move focus away')
  async setRowName(row: number, value: string): Promise<void> {
    await this.fillAndBlur(sct.rowName(row), value);
  }

  /** Types a Service Charge Display Name into a row and moves focus away. */
  @step('Type a Service Charge Display Name into a row and move focus away')
  async setRowDisplayName(row: number, value: string): Promise<void> {
    await this.fillAndBlur(sct.rowDisplayName(row), value);
  }

  /** Types a Report Column Name into a row and moves focus away. */
  @step('Type a Report Column Name into a row and move focus away')
  async setRowReportColumn(row: number, value: string): Promise<void> {
    await this.fillAndBlur(sct.rowReportColumn(row), value);
  }

  /** Fills all three required text fields of a row. */
  @step('Fill all three required fields on a row')
  async completeRow(
    row: number,
    values: { name: string; displayName: string; reportColumn: string }
  ): Promise<void> {
    await this.setRowName(row, values.name);
    await this.setRowDisplayName(row, values.displayName);
    await this.setRowReportColumn(row, values.reportColumn);
  }

  /** Adds an empty row at the end of the grid. */
  @step('Add an empty row to the grid')
  async addRow(): Promise<void> {
    await this.page.locator(sct.addRow).first().click();
    await this.page.waitForTimeout(500);
  }

  // ---------------------------------------------------------------- language selection

  /** Opens the page level language filter and returns the options it offers. */
  @step('Open the language filter and return its options')
  async getFilterLanguages(): Promise<string[]> {
    await this.page.locator(sct.languageFilterTrigger).first().click();
    await this.page.waitForTimeout(600);
    const opts = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
    return opts.map((o) => o.replace(/\s+/g, ' ').trim()).filter((o) => o.length > 0);
  }

  /** The language the page level filter is currently set to. */
  @step('Read the language the filter is currently set to')
  async getSelectedFilterLanguage(): Promise<string> {
    const raw = await this.page.locator(sct.languageFilterTrigger).first().textContent();
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  // Angular zone stability is not a completion signal here — the zone is equally stable before
  // the request starts — so this waits on a content postcondition and throws with diagnostics.
  @step('Choose a language from the page filter and wait for the grid')
  async selectFilterLanguage(language: string, timeout = 30_000): Promise<void> {
    const current = await this.getSelectedFilterLanguage();
    if (current.includes(language)) {
      return;
    }

    // Snapshot pre-filter state so postconditions can distinguish "finished" from "not started".
    const prevCount = await this.getRowCount();
    const prevLang = prevCount > 0 ? await this.getRowLanguage(0) : null;

    // Supplementary completion signal for "All": with a single-language dataset the content
    // looks unchanged, so the GET round-trip is the only proof the filter applied.
    let getResponseArrived = false;
    this.page.waitForResponse(
      (resp: Response) =>
        resp.url().includes('service-charge-texts') && resp.request().method() === 'GET',
      { timeout: Math.min(timeout, 15_000) }
    ).then(() => { getResponseArrived = true; }).catch(() => {/* no GET issued — client-side filter */});

    await this.page.locator(sct.languageFilterTrigger).first().click();
    await this.page.waitForTimeout(600);
    await this.page.getByRole('option', { name: language, exact: true }).first().click();

    // When the page has unsaved changes the app shows a confirmation dialog instead of
    // updating the grid. Detect that within a short window; the caller handles dismissal.
    const dialogVisible = await this.page
      .locator('[role="dialog"], [role="alertdialog"]')
      .first()
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);

    if (dialogVisible) {
      return;
    }

    const deadline = Date.now() + timeout;

    if (language !== 'All') {
      // Single-language postcondition: every visible row's language must match the selection.
      let consecutiveZeroPolls = 0;
      while (Date.now() < deadline) {
        await this.waitForAngularStable();
        const count = await this.getRowCount();
        if (count === 0) {
          // Two consecutive zero readings distinguish "filter matched nothing" from a transient
          // teardown mid-swap — Angular rebuilds within one poll cycle.
          consecutiveZeroPolls++;
          if (consecutiveZeroPolls >= 2) return;
          await this.page.waitForTimeout(300);
          continue;
        }
        consecutiveZeroPolls = 0;
        let allMatch = true;
        for (let r = 0; r < count; r++) {
          const lang = await this.tryGetRowLanguage(r);
          if (lang === null || lang !== language) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return;
        await this.page.waitForTimeout(300);
      }
      // Timeout — loud failure with diagnostics.
      const finalCount = await this.getRowCount();
      const observed: string[] = [];
      for (let r = 0; r < Math.min(finalCount, 5); r++) {
        observed.push(await this.getRowLanguage(r));
      }
      throw new Error(
        `Language filter "${language}" did not apply within ${timeout}ms. ` +
        `Rows: ${finalCount}. Observed languages: [${observed.join(', ')}]`
      );
    } else {
      // "All" postcondition: the grid must differ from the previous single-language view.
      while (Date.now() < deadline) {
        await this.waitForAngularStable();
        const count = await this.getRowCount();
        // Row count changed from the previous filter — new data has landed.
        if (count !== prevCount) return;
        // Same count but a row language differs — multi-language data is now visible.
        if (count > 0 && prevLang !== null) {
          for (let r = 0; r < Math.min(count, 10); r++) {
            const lang = await this.tryGetRowLanguage(r);
            if (lang === null) break; // Row vanished — grid still settling, retry outer loop.
            if (lang !== prevLang) return;
          }
        }
        // GET response arrived and Angular is stable — data landed even if it looks identical.
        if (getResponseArrived) return;
        // Previous filter had zero rows — Angular stability is sufficient.
        if (prevCount === 0) return;
        await this.page.waitForTimeout(300);
      }
      // Timeout — loud failure with diagnostics.
      const finalCount = await this.getRowCount();
      const observed: string[] = [];
      for (let r = 0; r < Math.min(finalCount, 5); r++) {
        observed.push(await this.getRowLanguage(r));
      }
      throw new Error(
        `Filter "All" did not visibly apply within ${timeout}ms. ` +
        `Row count: ${finalCount} (was ${prevCount}). ` +
        `Observed languages: [${observed.join(', ')}]`
      );
    }
  }

  // Waits for the row count to hold steady across consecutive polls; throws if it never does.
  // Needed after any action that swaps the result set without replacing the table.
  @step('Wait until the row count stops changing')
  async waitForRowCountStable(timeout = 15_000): Promise<number> {
    const deadline = Date.now() + timeout;
    let last = -1;
    let stableFor = 0;
    while (Date.now() < deadline) {
      const current = await this.getRowCount();
      stableFor = current === last ? stableFor + 1 : 0;
      last = current;
      if (stableFor >= 3) return current;
      await this.page.waitForTimeout(300);
    }
    throw new Error(
      `Row count never stabilised within ${timeout}ms (last observed: ${last})`,
    );
  }

  /** Opens the language list belonging to a single row and returns its options. */
  @step('Open a row language list and return its options')
  async getRowLanguages(row: number): Promise<string[]> {
    await this.page.locator(sct.rowLanguageTrigger(row)).first().click();
    await this.page.waitForTimeout(600);
    const opts = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
    return opts.map((o) => o.replace(/\s+/g, ' ').trim()).filter((o) => o.length > 0);
  }

  // ---------------------------------------------------------------- rich text editor

  /** Clicks a row's wording cell, which loads that row into the rich text panel. */
  @step('Click a row wording cell to open the rich text panel')
  async openEditorForRow(row: number): Promise<void> {
    await this.page.locator(sct.rowHtmlCell(row)).first().click();
    await this.page.locator(sct.editorContent).first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Whether the rich text panel is present and editable. */
  @step('Check whether the rich text panel is open and editable')
  async isEditorAvailable(): Promise<boolean> {
    const editor = this.page.locator(sct.editorContent).first();
    if ((await editor.count()) === 0) return false;
    if (!(await editor.isVisible().catch(() => false))) return false;
    return (await editor.getAttribute('contenteditable')) === 'true';
  }

  /** Text currently shown in the rich text panel. */
  @step('Read the visible text in the rich text panel')
  async getEditorText(): Promise<string> {
    const editor = this.page.locator(sct.editorContent).first();
    if ((await editor.count()) === 0) return '';
    return (await editor.textContent())?.replace(/\s+/g, ' ').trim() || '';
  }

  // ---------------------------------------------------------------- validation feedback

  // An empty result is meaningful, not a failure: the page can refuse a duplicate name
  // without showing any explanation, and a test asserts exactly that.
  @step('Read any visible validation messages on the page')
  async getValidationMessages(): Promise<string[]> {
    const out = await this.page
      .locator('[aria-invalid="true"], [role="alert"], .text-destructive')
      .evaluateAll((els) => els.map((e) => (e.textContent || '').trim()).filter((t) => t.length > 0));
    return out;
  }

  /** Whether a row's Service Charge Name value is visually cut off inside its cell. */
  @step('Check whether a row name is visually cut off')
  async isRowNameClipped(row: number): Promise<boolean> {
    return this.page
      .locator(sct.rowName(row))
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth);
  }

  /** Whether the browser has marked a row's Service Charge Name input as invalid (aria-invalid="true"). */
  @step('Check whether a row name is marked as invalid')
  async isRowNameInvalid(row: number): Promise<boolean> {
    const val = await this.page.locator(sct.rowName(row)).first().getAttribute('aria-invalid');
    return val === 'true';
  }

  /** The maximum length the browser enforces on a row's Service Charge Name, if any. */
  @step('Read the maximum allowed length of a row name field')
  async getRowNameMaxLength(row: number): Promise<string | null> {
    return this.page.locator(sct.rowName(row)).first().getAttribute('maxlength');
  }

  // ---------------------------------------------------------------- row lookup and reading

  /** Row index of the first row with this Service Charge Name; throws listing current names. */
  @step('Find the row with the given Service Charge Name')
  async findRowByName(name: string): Promise<number> {
    const names = await this.getAllNames();
    const index = names.indexOf(name);
    if (index === -1) {
      throw new Error(
        `Service Charge Name "${name}" was not found in the grid. ` +
        `Current names (${names.length}): ${names.slice(0, 10).join(', ')}${names.length > 10 ? '…' : ''}`
      );
    }
    return index;
  }

  /** Reads a row's three editable metadata fields — use it to capture state before an edit. */
  @step('Read all three editable fields of a row')
  async getRowValues(row: number): Promise<{ name: string; displayName: string; reportColumn: string }> {
    const name = await this.page.locator(sct.rowName(row)).inputValue();
    const displayName = await this.page.locator(sct.rowDisplayName(row)).inputValue();
    const reportColumn = await this.page.locator(sct.rowReportColumn(row)).inputValue();
    return { name, displayName, reportColumn };
  }

  // ---------------------------------------------------------------- save and request capture

  // The completion signal is the PUT response, not a fixed delay, so a slow server is fine.
  // Returns whether Save went back to disabled afterwards.
  @step('Click Save and wait for the request to complete')
  async saveAndWait(timeout = 15_000): Promise<boolean> {
    const saveRequest = this.page.waitForResponse(
      (resp: Response) => resp.url().includes('service-charge-texts') && resp.request().method() === 'PUT',
      { timeout }
    );
    await this.page.locator(sct.save).first().click();
    await saveRequest;
    return this.waitForSaveUnavailable(5_000);
  }

  /** Runs an action and returns the PUT save request's parsed body plus the response status. */
  @step('Run an action and capture what the page sends to the server')
  async captureSaveRequest(
    action: () => Promise<void>,
    timeout = 15_000
  ): Promise<{ body: unknown; status: number }> {
    let capturedRequest: Request | null = null;
    const responsePromise = this.page.waitForResponse(
      (resp: Response) => {
        if (resp.url().includes('service-charge-texts') && resp.request().method() === 'PUT') {
          capturedRequest = resp.request();
          return true;
        }
        return false;
      },
      { timeout }
    );
    await action();
    const response = await responsePromise;
    let body: unknown = null;
    if (capturedRequest) {
      try {
        body = (capturedRequest as Request).postDataJSON();
      } catch {
        body = null;
      }
    }
    return { body, status: response.status() };
  }

  // Counts PUTs to the save endpoint during an action. The graceMs window after Save re-disables
  // is deliberate: a stray duplicate request can arrive just after the button flips.
  @step('Count how many save requests are sent during an action')
  async countSaveRequests(
    action: () => Promise<void>,
    timeout = 10_000,
    graceMs = 500
  ): Promise<number> {
    let count = 0;
    const handler = (request: Request) => {
      if (request.url().includes('service-charge-texts') && request.method() === 'PUT') {
        count++;
      }
    };
    this.page.on('request', handler);
    try {
      await action();
      // Save returning to disabled is the DOM signal that the PUT round-trip finished.
      await this.waitForSaveUnavailable(timeout);
      // Keep the listener alive so a late duplicate request is still counted.
      await this.page.waitForTimeout(graceMs);
    } finally {
      this.page.off('request', handler);
    }
    return count;
  }

  // ---------------------------------------------------------------- safe mutation cycle

  // Edits one field of an existing row, saves, asserts, then restores and saves again in a
  // finally block so live data is left as found even when the assertion throws.
  @step('Edit a field, save, run an assertion, then restore the original value')
  async editSaveAssertRestore(
    anchorName: string,
    field: 'name' | 'displayName' | 'reportColumn',
    newValue: string,
    assertFn: (row: number) => Promise<void>
  ): Promise<void> {
    const row = await this.findRowByName(anchorName);
    const original = await this.getRowValues(row);
    const originalValue = original[field];

    await this.setField(row, field, newValue);
    await this.saveAndWait();

    try {
      await assertFn(row);
    } finally {
      // Restore the original value so shared test data is left clean for other tests.
      const restoredRow = await this.findRowByName(field === 'name' ? newValue : anchorName);
      await this.setField(restoredRow, field, originalValue);
      await this.saveAndWait();
    }
  }

  // ---------------------------------------------------------------- unsaved-changes modal

  // Whether the unsaved-changes modal is visible. It also appears on a language filter change,
  // not only on navigation away.
  @step('Check whether the unsaved changes modal is open')
  async isUnsavedModalOpen(): Promise<boolean> {
    return this.page.locator('[role="dialog"]').first().isVisible().catch(() => false);
  }

  /** Unsaved-changes modal text on one line, or '' when the modal is not open. */
  @step('Read the message shown in the unsaved changes modal')
  async getUnsavedModalMessage(): Promise<string> {
    const dialog = this.page.locator('[role="dialog"], [role="alertdialog"]').first();
    if (!(await dialog.isVisible().catch(() => false))) return '';
    return ((await dialog.textContent()) || '').replace(/\s+/g, ' ').trim();
  }

  /** Clicks Stay on the unsaved-changes modal and waits for it to close. */
  @step('Click Stay to keep unsaved changes on the page')
  async stayOnPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Stay', exact: true }).first().click();
    await this.page.locator('[role="dialog"], [role="alertdialog"]').first().waitFor({ state: 'hidden', timeout: 5_000 });
  }

  // Clicks Discard, then waits for the modal to close and the grid to reload with the new
  // language's data before returning.
  @step('Click Discard to abandon unsaved changes and leave the page')
  async discardAndLeave(): Promise<void> {
    const responseSettled = this.page.waitForResponse(
      (resp: Response) =>
        resp.url().includes('service-charge-texts') && resp.request().method() === 'GET',
      { timeout: 30_000 }
    );
    await this.page.getByRole('button', { name: 'Discard', exact: true }).first().click();
    await this.page.locator('[role="dialog"], [role="alertdialog"]').first().waitFor({ state: 'hidden', timeout: 5_000 });
    await responseSettled;
    await this.waitForGrid();
  }

  // ---------------------------------------------------------------- beforeunload handling

  // Auto-accepts the native beforeunload dialog for the duration of the action, so navigating
  // away with unsaved edits does not hang the test.
  @step('Run an action while automatically accepting any page leave prompt')
  async runWithBeforeunloadAccepted(action: () => Promise<void>): Promise<void> {
    const handler = async (dialog: { type(): string; accept(): Promise<void> }) => {
      if (dialog.type() === 'beforeunload') {
        await dialog.accept().catch(() => {/* already handled */});
      }
    };
    this.page.on('dialog', handler);
    try {
      await action();
    } finally {
      this.page.off('dialog', handler);
    }
  }

  /** Each column header's scope attribute in display order; null where the attribute is absent. */
  @step('Read the scope attribute of each column header')
  async getHeaderScopeValues(): Promise<(string | null)[]> {
    const headers = await this.page.locator(sct.headers).all();
    return Promise.all(headers.map((th) => th.getAttribute('scope')));
  }

  // ---------------------------------------------------------------- per-row language

  // Returns null when the row vanished mid-poll. The short timeout keeps one missing row from
  // eating the caller's whole budget under the 10 s default.
  private async tryGetRowLanguage(row: number, perRowTimeout = 2_000): Promise<string | null> {
    try {
      const raw = await this.page
        .locator(sct.rowLanguageTrigger(row))
        .first()
        .textContent({ timeout: perRowTimeout });
      return (raw || '').replace(/\s+/g, ' ').trim();
    } catch {
      // Row vanished (grid shrank) or element detached — not an error, grid is still settling.
      return null;
    }
  }

  /** Reads the current language displayed on a row's language trigger button. */
  @step('Read the language displayed on a row')
  async getRowLanguage(row: number): Promise<string> {
    const raw = await this.page.locator(sct.rowLanguageTrigger(row)).first().textContent();
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  /** Selects a language from a row's per-row language dropdown. */
  @step('Choose a language from a row language dropdown')
  async selectRowLanguage(row: number, language: string): Promise<void> {
    await this.page.locator(sct.rowLanguageTrigger(row)).first().click();
    await this.page.waitForTimeout(600);
    const option = this.page.getByRole('option', { name: language, exact: true }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- rich text mutation

  /** Clears the rich text editor and types new content. The editor must already be open. */
  @step('Clear the rich text panel and type new content')
  async setEditorText(text: string): Promise<void> {
    const editor = this.page.locator(sct.editorContent).first();
    await editor.click();
    await editor.evaluate((el) => {
      (el as HTMLElement).innerHTML = '';
    });
    // CDP insertText commits through ProseMirror in one shot; page.keyboard.type costs
    // ~208 ms per character here.
    const cdp = await this.page.context().newCDPSession(this.page);
    await cdp.send('Input.insertText', { text });
    await cdp.detach();
    await this.page.waitForTimeout(300);
  }

  /** Reads the visible text inside a row's Service Charge Text cell without opening the editor. */
  @step('Read the text inside a row wording cell')
  async getRowHtmlCellText(row: number): Promise<string> {
    const raw = await this.page.locator(sct.rowHtmlCell(row)).first().textContent();
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------- tab-order walk

  // Tabs from a row's first editable field, recording each newly focused element's data-testid
  // (null when it has none), so tests can assert the grid's keyboard order.
  @step('Walk the tab order from a row and record focused elements')
  async walkTabOrder(startRow: number, tabCount: number): Promise<(string | null)[]> {
    await this.page.locator(sct.rowName(startRow)).first().focus();
    const result: (string | null)[] = [];
    for (let i = 0; i < tabCount; i++) {
      await this.page.keyboard.press('Tab');
      const testId = await this.page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? el.getAttribute('data-testid') : null;
      });
      result.push(testId);
    }
    return result;
  }

  // ---------------------------------------------------------------- internals

  /** Sets one of the three editable metadata fields on a row, identified by field name. */
  private async setField(
    row: number,
    field: 'name' | 'displayName' | 'reportColumn',
    value: string
  ): Promise<void> {
    if (field === 'name') await this.setRowName(row, value);
    else if (field === 'displayName') await this.setRowDisplayName(row, value);
    else await this.setRowReportColumn(row, value);
  }

  /** Fills a field and moves focus away so any per field checks run. */
  private async fillAndBlur(selector: string, value: string): Promise<void> {
    const field: Locator = this.page.locator(selector).first();
    await field.click();
    await field.fill(value);
    await this.page.keyboard.press('Tab');
    await this.page.waitForTimeout(400);
  }

  // ---------------------------------------------------------------- sentinel residue recovery

  // Renames any leftover sentinel row so the next run can reuse the name without colliding
  // within its language. Returns the language the residue was found in, or null.
  @step('Clear any leftover sentinel residue from a previous failed run')
  async clearSentinelResidue(
    sentinelName: string,
    recoveredName: string,
    officeNo: string = '1604',
  ): Promise<string | null> {
    // Sweep each single-language filter (skip 'All' — it shows duplicates across languages
    // and doesn't tell us which language the row is filed under).
    const perLanguageFilters = SCT_FILTER_LANGUAGES.filter((lang) => lang !== 'All');

    for (const lang of perLanguageFilters) {
      await this.selectFilterLanguage(lang);
      await this.waitForRowCountStable();
      const names = await this.getAllNames();
      const idx = names.indexOf(sentinelName);
      if (idx === -1) continue;

      Log.info(`Sentinel residue "${sentinelName}" found under "${lang}" at row ${idx} — renaming to "${recoveredName}"`);

      // Rename the residue row so it no longer collides with the sentinel the test will create.
      await this.setRowName(idx, recoveredName);
      const saveReady = await this.waitForSaveAvailable(10_000);
      if (!saveReady) {
        // If save won't enable (e.g. recoveredName also collides), try a timestamped fallback.
        const fallback = `${recoveredName} ${Date.now()}`;
        Log.info(`Save not available with "${recoveredName}" — trying fallback "${fallback}"`);
        await this.setRowName(idx, fallback);
        await this.waitForSaveAvailable(10_000);
      }
      await this.saveAndWait();

      // Verify persistence after reload — read the value back after saving to prove it persisted.
      await this.reloadAndWait(officeNo);
      await this.selectFilterLanguage(lang);
      await this.waitForRowCountStable();
      const refreshedNames = await this.getAllNames();
      if (refreshedNames.includes(sentinelName)) {
        throw new Error(
          `Sentinel residue "${sentinelName}" persisted under "${lang}" after rename+save+reload. ` +
          `The recovery failed — manual intervention required.`,
        );
      }
      Log.info(`Sentinel residue cleared successfully under "${lang}"`);
      return lang;
    }

    Log.info(`No sentinel residue "${sentinelName}" found in any language — clean slate`);
    return null;
  }
}
