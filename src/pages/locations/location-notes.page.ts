import { Page, expect } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';

export class LocationNotesPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationNotesPage initialized');
  }

  @step('Navigate to notes tab')
  async navigateToNotesTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabNotes', 'sectionNotes', officeNo);
  }

  @step('Is on notes tab')
  async isOnNotesTab(): Promise<boolean> {
    // Use the tab trigger's aria-selected instead of count()>0
    // on a child anchor. Radix mounts inactive panels for some tabs (forceMount-equivalent);
    // the trigger's aria-selected is the only reliable cross-tab signal.
    const tab = this.getElement('tabNotes');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Click notes tab')
  async clickNotesTab(): Promise<void> {
    await this.clickWithRetry('tabNotes');
    await this.getElement('sectionNotes').waitFor({ state: 'visible', timeout: 15_000 });
    // Race content vs empty-state so we don't return on
    // the wrapper alone while the inner Notes data is still hydrating.
    // Dropped trailing .catch(Log.warn) so race-lost
    // timeouts fail loudly at the click step (where the symptom is) instead of being swallowed
    // and surfacing later as misattributed assertion failures.
    await Promise.race([
      this.getElement('txtNoteInputAll').first().waitFor({ state: 'visible', timeout: 15_000 }),
      this.getElement('lblNoNotesAvailable').waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
  }

  @step('Reload and navigate to notes tab')
  async reloadAndNavigateToNotesTab(): Promise<void> {
    const handler = async (d: import('@playwright/test').Dialog) => {
      try { await d.accept(); } catch { /* dialog may already be handled */ }
    };
    this.page.on('dialog', handler);
    try {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    } finally {
      this.page.removeListener('dialog', handler);
    }
    // Let Angular finish binding the reloaded model before (and after) re-entering the tab —
    // without this a fast re-read can race the post-reload hydration and return stale values
    // (mirrors the Currency tab reload, which stabilizes on both sides of the tab click).
    await this.waitForAngularStable();
    await this.clickNotesTab();
    await this.waitForAngularStable();
  }

  @step('Click add')
  async clickAdd(): Promise<void> {
    await this.clickWithRetry('btnNotesAdd');
  }

  @step('Fill note')
  async fillNote(row: number, text: string): Promise<void> {
    if (row === 0) {
      const count = await this.getElement('txtNoteInputAll').count();
      if (count === 0) {
        await this.clickAdd();
      }
    }
    const textarea = this.getElement('txtNoteInputAll').nth(row);
    await textarea.waitFor({ state: 'visible', timeout: 5_000 });
    if (text.includes('\n')) {
      await this.pasteIntoNote(row, text);
      return;
    }
    await textarea.fill(text);
    await textarea.press('Tab');
    Log.info(`[OK] Filled note row ${row} with ${text.length} chars`);
  }

 /**
 * Bypasses the JS keyboard handler for pasting long content.
 * Dispatches input+change events to trigger Angular model update.
 */
  @step('Paste into note')
  async pasteIntoNote(row: number, text: string): Promise<void> {
    if (row === 0) {
      const count = await this.getElement('txtNoteInputAll').count();
      if (count === 0) {
        await this.clickAdd();
      }
    }
    const textarea = this.getElement('txtNoteInputAll').nth(row);
    await textarea.focus();
    await textarea.evaluate((el: HTMLTextAreaElement, t: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;
      setter?.call(el, t);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, text);
    await textarea.press('Tab');
    Log.info(`[OK] Pasted ${text.length} chars into note row ${row}`);
  }

  @step('Append to note')
  async appendToNote(row: number, suffix: string): Promise<void> {
    const textarea = this.getElement('txtNoteInputAll').nth(row);
    await textarea.focus();
    await textarea.evaluate((el: HTMLTextAreaElement, s: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(el, el.value + s);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, suffix);
    await textarea.press('Tab');
  }

  @step('Prepend to note')
  async prependToNote(row: number, prefix: string): Promise<void> {
    const textarea = this.getElement('txtNoteInputAll').nth(row);
    await textarea.focus();
    await textarea.evaluate((el: HTMLTextAreaElement, p: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(el, p + el.value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, prefix);
    await textarea.press('Tab');
  }

  @step('Replace slice in note')
  async replaceSliceInNote(row: number, start: number, end: number, newText: string): Promise<void> {
    const textarea = this.getElement('txtNoteInputAll').nth(row);
    await textarea.focus();
    await textarea.evaluate((el: HTMLTextAreaElement, args: { s: number; e: number; n: string }) => {
      const v = el.value;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(el, v.slice(0, args.s) + args.n + v.slice(args.e));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { s: start, e: end, n: newText });
    await textarea.press('Tab');
  }

  @step('Clear note')
  async clearNote(row: number): Promise<void> {
    const textarea = this.getElement('txtNoteInputAll').nth(row);
    await textarea.focus();
    await textarea.evaluate((el: HTMLTextAreaElement) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await textarea.press('Tab');
  }

  @step('Prepare empty row')
  async prepareEmptyRow(): Promise<void> {
    const count = await this.getElement('txtNoteInputAll').count();
    if (count === 0) {
      await this.clickAdd();
    }
  }

  @step('Delete row')
  async deleteRow(row: number): Promise<void> {
    const deleteBtn = this.getElement('btnNotesDelete').nth(row);
    await deleteBtn.click();
    Log.info(`[OK] Deleted note row ${row}`);
  }

  @step('Delete all rows')
  async deleteAllRows(): Promise<void> {
    let count = await this.getElement('btnNotesDelete').count();
    while (count > 0) {
      const prev = count;
      await this.getElement('btnNotesDelete').first().click();
      await expect.poll(
        () => this.getElement('btnNotesDelete').count(),
        { timeout: 5_000 },
      ).toBeLessThan(prev);
      count = await this.getElement('btnNotesDelete').count();
    }
    Log.info('[OK] All note rows deleted');
  }

  @step('Is empty state visible')
  async isEmptyStateVisible(): Promise<boolean> {
    return this.getElement('lblNoNotesAvailable').isVisible();
  }

  @step('Get note value')
  async getNoteValue(row: number): Promise<string> {
    const el = this.getElement('txtNoteInputAll').nth(row);
    await el.waitFor({ state: 'visible', timeout: 15_000 });
    return el.inputValue();
  }

  @step('Get note row count')
  async getNoteRowCount(): Promise<number> {
    return this.getElement('txtNoteInputAll').count();
  }

  @step('Get char counter text')
  async getCharCounterText(): Promise<string> {
    return (await this.getElement('lblNotesCharCounter').textContent()) ?? '';
  }

  @step('Get char count')
  async getCharCount(): Promise<number> {
    const text = await this.getCharCounterText();
    const match = text.match(/(\d+)\/4000/);
    return match && match[1] ? parseInt(match[1], 10) : -1;
  }

  @step('Get delete button count')
  async getDeleteButtonCount(): Promise<number> {
    return this.getElement('btnNotesDelete').count();
  }

  @step('Is add button visible')
  async isAddButtonVisible(): Promise<boolean> {
    return this.getElement('btnNotesAdd').isVisible();
  }

  @step('Is progress bar visible')
  async isProgressBarVisible(): Promise<boolean> {
    return this.getElement('barNotesProgress').isVisible();
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    return this.getElement('btnSaveNotes').isEnabled();
  }

  getNoteTextarea(row: number): import('@playwright/test').Locator {
    return this.getElement('txtNoteInputAll').nth(row);
  }

  @step('Get textarea maxlength')
  async getTextareaMaxlength(row: number): Promise<string | null> {
    return this.getElement('txtNoteInputAll').nth(row).getAttribute('maxlength');
  }

  @step('Save and confirm')
  async saveAndConfirm(): Promise<void> {
    await this.getElement('btnSaveNotes').waitFor({ state: 'visible', timeout: 5_000 });
 // Wait for Angular to enable Save (may take a tick after fill+Tab).
 // Propagate timeout — if Save never enables, the subsequent click would fail anyway
 // and the original timeout gives a clearer signal than a downstream click error.
    await this.page.waitForFunction(
      (sel: string) => {
        const btn = document.querySelector(sel);
        return btn && !(btn as HTMLButtonElement).disabled;
      },
      this.getLocator('btnSaveNotes'),
      { timeout: 5_000 }
    );
    // Arm a wait for the actual Notes save response BEFORE clicking. The Save button flipping
    // back to disabled is only a UI signal — Angular can disable it before the save request has
    // finished on the server. A fast follow-up reload then cancels the in-flight save, and the
    // reloaded page reads back stale (pre-save) data. Match the backend save endpoint (PUT), not
    // the page URL — server-render/hydration POSTs hit the page path and must never be mistaken
    // for the save.
    const saveResponse = this.page.waitForResponse(
      (r) =>
        r.url().includes('/navigator/api/location/update-properties') &&
        r.request().method() !== 'GET',
      { timeout: 15_000 },
    );
    const result = await this.clickSaveWithDialog('btnSaveNotes');
    if (!result.success) {
      Log.error(`[ERR] Save failed: ${result.networkError}`);
    }
    // Wait for the save request to actually land (successful status + body fully read) before
    // returning, so a caller's reload cannot cancel an in-flight save. Fail loudly on a missing
    // or non-2xx response rather than silently passing on stale data.
    const response = await saveResponse;
    if (!response.ok()) {
      throw new Error(
        `[Notes] Save request did not succeed: ${response.status()} ${response.statusText()} (${response.url()})`,
      );
    }
    await response.finished();
 // Wait for Save button to become disabled — confirms save API response was received
 // and the form is pristine. Without this, immediate page.reload can race with the
 // server processing the save, causing reload to fetch pre-save (stale) data.
 // Timeout propagates so callers fail loudly on stale-read race instead of passing
 // with stale data after a swallowed warning.
    await this.page.waitForFunction(
      (sel: string) => {
        const btn = document.querySelector(sel);
        return btn && (btn as HTMLButtonElement).disabled;
      },
      this.getLocator('btnSaveNotes'),
      { timeout: 10_000 },
    );
  }

  @step('Click save button')
  async clickSaveButton(): Promise<void> {
    await this.clickWithRetry('btnSaveNotes');
  }

  @step('Get save dialog content')
  async getSaveDialogContent(): Promise<{ heading: string; body: string }> {
    const dialog = this.getElement('dlgSaveChanges');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    const heading = await dialog.locator('h2, [role="heading"]').first().textContent() ?? '';
    const body = await dialog.locator('p, div:not(:has(button)):not(:has(h2))').first().textContent() ?? '';
    return { heading: heading.trim(), body: body.trim() };
  }

  @step('Confirm save dialog')
  async confirmSaveDialog(): Promise<void> {
    await this.getElement('btnSaveChangesConfirm').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('Cancel save dialog')
  async cancelSaveDialog(): Promise<void> {
    await this.getElement('btnSaveChangesCancel').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('Ensure empty state')
  async ensureEmptyState(): Promise<void> {
    // save-verify-exempt: verifies inline — after the save + reload below it re-reads
    // isDefaultEmptyState() and self-heals once if the delete did not persist, instead of
    // routing through the shared persist-and-verify helper.
    await this.page.waitForTimeout(500);
    const deleteCount = await this.getElement('btnNotesDelete').count();
    if (deleteCount > 0) {
      await this.deleteAllRows();
 // Poll for Save-enable instead of fixed 500ms sleep — races Angular's dirty flag
 // when deletion completes before change detection runs. .catch falls through to the
 // reload fallback below if Angular doesn't update (post-markAsPristine session).
      await this.page.waitForFunction(
        (sel: string) => {
          const btn = document.querySelector(sel);
          return btn && !(btn as HTMLButtonElement).disabled;
        },
        this.getLocator('btnSaveNotes'),
        { timeout: 2_000 },
      ).catch(() => {
        Log.info('[INFO] Save did not enable within 2s after delete — will reload for fresh form state');
      });

 // Angular app behavior: after save marks form pristine, deleting notes in the SAME
 // session does NOT re-enable Save (dirty flag not set). Reload to get fresh form state
 // from DB, then re-delete on the fresh form (which properly marks dirty → Save enables).
      if (!(await this.isSaveEnabled())) {
        Log.info('[INFO] Save disabled after delete — reloading for fresh form state');
        await this.reloadAndNavigateToNotesTab();
        const retryDelCount = await this.getElement('btnNotesDelete').count();
        if (retryDelCount > 0) {
          await this.deleteAllRows();
          await this.page.waitForTimeout(500);
        }
      }
    }
    if (await this.isSaveEnabled()) {
      await this.saveAndConfirm();
    }
 // Always reload after cleanup to reset Angular form controller
    await this.reloadAndNavigateToNotesTab();

 // Final verification: never claim "DB clean" without confirming it. If the cleanup didn't
 // land (Angular dirty-state race), retry the delete+save+reload once before returning.
    if (!(await this.isDefaultEmptyState())) {
      Log.warn('[WARN] Notes not empty after cleanup — retrying once (Angular dirty-state race)');
      if ((await this.getElement('btnNotesDelete').count()) > 0) {
        await this.deleteAllRows();
      }
      if (await this.isSaveEnabled()) {
        await this.saveAndConfirm();
      }
      await this.reloadAndNavigateToNotesTab();
    }
    Log.info('[OK] Notes ensured empty (DB clean)');
  }

  @step('Is default empty state')
  async isDefaultEmptyState(): Promise<boolean> {
    const noNotesVisible = await this.isEmptyStateVisible();
    const rowCount = await this.getElement('txtNoteInputAll').count();
    const charCount = await this.getCharCount();
    const deleteCount = await this.getElement('btnNotesDelete').count();
 // Case 1: "No Notes Available" state (0 textareas)
    if (noNotesVisible && rowCount === 0 && charCount === 0) return true;
 // Case 2: 1 empty textarea row (first-ever load)
    if (!noNotesVisible && rowCount === 1 && charCount === 0 && deleteCount === 0) return true;
    return false;
  }

  @step('Discard changes via reload')
  async discardChangesViaReload(): Promise<void> {
    await this.reloadAndNavigateToNotesTab();
  }

  @step('Navigate away with unsaved changes')
  async navigateAwayWithUnsavedChanges(_url: string): Promise<boolean> {
    let dialogAppeared = false;
    const handler = async (dialog: import('@playwright/test').Dialog) => {
      dialogAppeared = true;
      try { await dialog.dismiss(); } catch { /* dialog may already be handled */ }
    };
 // Suppress fixture's auto-accept handler so this test controls the dialog
    (this.page as unknown as Record<string, unknown>).__skipBeforeunloadAutoAccept = true;
    this.page.on('dialog', handler);
    try {
      await this.page.evaluate(() => {
        window.location.href = '/';
      }).catch(() => {
 // Navigation blocked by dialog dismissal — expected
      });
      await this.page.waitForTimeout(1_000);
    } finally {
      this.page.removeListener('dialog', handler);
      (this.page as unknown as Record<string, unknown>).__skipBeforeunloadAutoAccept = false;
    }
    return dialogAppeared;
  }

  @step('Switch to tab')
  async switchToTab(tabKey: string): Promise<void> {
    await this.clickWithRetry(tabKey);
    await this.waitForAngularStable();
  }
}
