import { Page, Locator, Response, Request } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { termsConditions as tc } from '../../selectors/terms-conditions/terms-conditions';
import {
  TNC_FIXTURE_ROW_NAME,
  TNC_DEFAULT_LANGUAGE,
  TNC_FILTER_LANGUAGES,
} from '../../data/terms-conditions/terms-conditions';

const TNC_DESTRUCTIVE_BORDER_COLOR = 'oklch(0.577 0.245 27.325)';

/**
 * Terms and Conditions setup page.
 *
 * The page lists T&C entries per language. Each row has a language selector, a name field,
 * and three rich-text columns (Left, Right, Bottom) edited via a shared Tiptap panel that
 * is rebuilt on every cell switch.
 *
 * Critical behaviours encoded here:
 * - The editor DOM node is rebuilt on every cell switch; locators are never cached across cells.
 * - ProseMirror ignores fill(); all rich-text input uses real keyboard events.
 * - Row lookup is content-anchored (by name), never by index alone.
 * - Save is gated by dirty AND validity; button-disabled does NOT prove the server accepted the save.
 * - No delete affordance exists; cleanup restores values in place.
 * - No save confirmation dialog; the shared save-changes dialog does not apply on this page.
 *
 * Modelled on: service-charge-text.page.ts (sibling pattern).
 */
export class TermsConditionsPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('TermsConditionsPage initialized');
  }

  // ---------------------------------------------------------------- navigation & ready

  /** Opens the page for an office and waits for the grid to appear. */
  @step('Open the Terms and Conditions page for an office')
  async open(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}locations/${officeNo}/settings/terms-conditions`);
    await this.waitForGrid();
  }

  /** Waits for the real grid to appear (page-ready gate). Uses a generous timeout
   *  because the page skeleton can take up to 60s to resolve.
   *
   *  Waits on the TABLE first, then Save. Save alone is not a sufficient gate — it can
   *  render before the grid body is populated, which would let a test read an empty grid
   *  and pass. The table is the content gate; Save confirms the toolbar is wired up.
   *
   *  Row-count stability is required beyond visibility: the table stays mounted during a
   *  language-filter change and only its rows swap. Waiting for visible returns instantly
   *  against the previous result set. Polling until the count stops changing is the only
   *  signal that the current result set has fully rendered. */
  @step('Wait for the Terms and Conditions grid to appear')
  async waitForGrid(timeout = 60_000): Promise<void> {
    await this.page.locator(tc.table).first().waitFor({ state: 'visible', timeout });
    await this.page.locator(tc.save).first().waitFor({ state: 'visible', timeout });
    // Poll until row count stabilises — two identical consecutive counts mean the render is done.
    const deadline = Date.now() + timeout;
    let prev = -1;
    while (Date.now() < deadline) {
      const current = await this.page.locator(tc.bodyRows).count();
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

  /** Reloads the page and waits for the grid. Discards anything not yet saved. */
  @step('Reload the page and wait for the grid')
  async reloadAndWait(officeNo: string = '1604'): Promise<void> {
    await this.open(officeNo);
  }

  // ---------------------------------------------------------------- save state

  /** Whether Save is currently unavailable. Waits for the button to attach before checking. */
  @step('Check whether the Save button is disabled')
  async isSaveDisabled(timeout = 5_000): Promise<boolean> {
    const btn = this.page.locator(tc.save).first();
    await btn.waitFor({ state: 'attached', timeout });
    const disabledAttr = await btn.isDisabled();
    const ariaDisabled = await btn.getAttribute('aria-disabled');
    return disabledAttr || ariaDisabled === 'true';
  }

  /** Whether Save is currently enabled (dirty + valid). Waits for the button to attach. */
  @step('Check whether the Save button is enabled')
  async isSaveEnabled(timeout = 5_000): Promise<boolean> {
    return !(await this.isSaveDisabled(timeout));
  }

  /** Waits until Save becomes available, then reports whether it did. */
  @step('Wait until the Save button becomes enabled')
  async waitUntilSaveEnabled(timeout = 10_000): Promise<boolean> {
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
  @step('Wait until the Save button becomes disabled')
  async waitUntilSaveDisabled(timeout = 10_000): Promise<boolean> {
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

  // ---------------------------------------------------------------- row counting & lookup

  /**
   * Reads a row's language with a short timeout. Returns `null` if the row has vanished
   * (grid shrank mid-poll). The bounded read prevents a single missing row from consuming
   * the entire helper budget — 2 000 ms is long enough for a present element to resolve
   * but short enough that a vanished row costs one retry cycle, not the full 10 s default.
   */
  private async tryGetRowLanguage(row: number, perRowTimeout = 2_000): Promise<string | null> {
    try {
      const raw = await this.page
        .locator(tc.rowLanguageTrigger(row))
        .first()
        .textContent({ timeout: perRowTimeout });
      return (raw || '').replace(/\s+/g, ' ').trim();
    } catch {
      // Row vanished (grid shrank) or element detached — not an error, grid is still settling.
      return null;
    }
  }

  /** Number of data rows currently shown in the grid (excludes the trailing add-row). */
  @step('Get the number of rows in the grid')
  async getRowCount(): Promise<number> {
    const total = await this.page.locator(tc.bodyRows).count();
    if (total === 0) return 0;
    // The trailing add-row has no language trigger element — exclude it from the data count.
    const lastHasLang = await this.page
      .locator(tc.rowLanguageTrigger(total - 1))
      .first()
      .count() > 0;
    return lastHasLang ? total : total - 1;
  }

  /** Every Terms & Conditions Name currently in the grid. */
  @step('Read all Terms and Conditions names from the grid')
  async getAllNames(): Promise<string[]> {
    return this.page.locator(tc.allNames).evaluateAll((els) =>
      els.map((e) => (e as HTMLInputElement).value)
    );
  }

  /**
   * Returns the row index of the first row whose Name matches the given value.
   * Content-anchored lookup — never uses position alone.
   * Throws if no row has that name.
   *
   * WARNING: The returned index is invalidated by any operation that re-sorts the grid:
   * save, filter change, name edit, or add row. After any such operation, re-resolve
   * via findRowByName before using a position index for further reads or writes.
   */
  @step('Find the row with the given Terms and Conditions name')
  async findRowByName(name: string): Promise<number> {
    const names = await this.getAllNames();
    const index = names.indexOf(name);
    if (index === -1) {
      throw new Error(
        `Terms & Conditions Name "${name}" was not found in the grid. ` +
        `Current names (${names.length}): ${names.slice(0, 10).join(', ')}${names.length > 10 ? '…' : ''}`
      );
    }
    return index;
  }

  /** Index of the last row (for working with a row that was just added).
   *  Invalidated by save, filter change, name edit, or add row — re-resolve after. */
  @step('Get the index of the last row in the grid')
  async getLastRowIndex(): Promise<number> {
    return (await this.page.locator(tc.allNames).count()) - 1;
  }

  // ---------------------------------------------------------------- reading row state

  /** Current Name value of a row. */
  @step('Read the name of a row')
  async getRowName(row: number): Promise<string> {
    return this.page.locator(tc.rowName(row)).inputValue();
  }

  /** Current language displayed on a row's language trigger. */
  @step('Read the language displayed on a row')
  async getRowLanguage(row: number): Promise<string> {
    const raw = await this.page.locator(tc.rowLanguageTrigger(row)).first().textContent();
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------- name validation state

  /**
   * Returns the validation state for a row's Name input.
   * - ariaInvalid: true when the input has aria-invalid="true"
   * - borderColor: the computed CSS border color after validation has rendered
   * - hasRedBorder: true only when the input's border color matches the destructive design token
   */
  @step('Check the validation state of a row name field')
  async getNameValidationState(row: number): Promise<{ ariaInvalid: boolean; borderColor: string; hasRedBorder: boolean }> {
    const input = this.page.locator(tc.rowName(row)).first();
    const ariaInvalid = (await input.getAttribute('aria-invalid')) === 'true';
    const borderColor = await input.evaluate((el) => window.getComputedStyle(el).borderColor);
    return { ariaInvalid, borderColor, hasRedBorder: borderColor === TNC_DESTRUCTIVE_BORDER_COLOR };
  }

  // ---------------------------------------------------------------- editing name

  /** Types a Name into a row's input and moves focus away so validation triggers. */
  @step('Type a name into a row and move focus away')
  async setRowName(row: number, value: string): Promise<void> {
    await this.fillAndBlur(tc.rowName(row), value);
  }

  /** Clears a row's Name field (select all + delete) and tabs away. */
  @step('Clear the name field on a row')
  async clearRowName(row: number): Promise<void> {
    const input = this.page.locator(tc.rowName(row)).first();
    await input.click();
    await input.fill('');
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- language selection

  /** Opens the page-level language filter and returns the options it offers. */
  @step('Open the language filter and return its options')
  async getFilterLanguages(): Promise<string[]> {
    await this.page.locator(tc.languageFilterTrigger).first().click();
    await this.page.getByRole('option').first().waitFor({ state: 'visible', timeout: 5_000 });
    const opts = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    await this.waitForAngularStable();
    return opts.map((o) => o.replace(/\s+/g, ' ').trim()).filter((o) => o.length > 0);
  }

  /** The language the page-level filter is currently set to. */
  @step('Read the language the filter is currently set to')
  async getSelectedFilterLanguage(): Promise<string> {
    const raw = await this.page.locator(tc.languageFilterTrigger).first().textContent();
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Selects a language in the page-level filter and waits for the grid to reflect it.
   *
   * **Postcondition (single language):** every visible row's language matches the selection.
   * A grid that has not started updating is perfectly stable — row-count stability alone
   * cannot distinguish "finished" from "not started". The content check does.
   *
   * **Postcondition ("All"):** the grid must differ from the previous single-language view.
   * When the dataset contains only one language, content checks alone cannot distinguish
   * "All" from the previous view — the network round-trip (GET completing) or
   * Angular declared the zone stable — covering that rare case.
   *
   * **Failure is loud.** If the postcondition is not met within the budget, the method throws
   * naming the requested language, the observed row count, and the observed languages.
   */
  @step('Choose a language from the page filter')
  async selectFilterLanguage(language: string, timeout = 30_000): Promise<void> {
    const current = await this.getSelectedFilterLanguage();
    if (current.includes(language)) return;

    // Snapshot pre-filter state so postconditions can distinguish "finished" from "not started".
    const prevCount = await this.getRowCount();
    const prevLang = prevCount > 0 ? await this.getRowLanguage(0) : null;

    // Track the GET response as a supplementary completion signal for the "All" filter.
    let getResponseArrived = false;
    this.page.waitForResponse(
      (resp: Response) =>
        resp.url().includes('terms-conditions-texts') && resp.request().method() === 'GET',
      { timeout: Math.min(timeout, 15_000) }
    ).then(() => { getResponseArrived = true; }).catch(() => {/* no GET issued — client-side filter */});

    await this.page.locator(tc.languageFilterTrigger).first().click();
    await this.page.getByRole('option', { name: language, exact: true }).first()
      .waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.getByRole('option', { name: language, exact: true }).first().click();

    // Detect if the unsaved-changes dialog appeared instead of applying the filter.
    const dialogVisible = await this.page
      .locator('[role="dialog"], [role="alertdialog"]')
      .first()
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);

    if (dialogVisible) return;

    const deadline = Date.now() + timeout;

    if (language !== 'All') {
      // Single-language postcondition: every visible row that carries a language element
      // must match the selection. Rows without a language element (the trailing add-row)
      // are excluded — they cannot participate in a language postcondition.
      let consecutiveZeroPolls = 0;
      while (Date.now() < deadline) {
        await this.waitForAngularStable();
        const count = await this.getRowCount();
        if (count === 0) {
          // Require 2 consecutive zero-count readings to distinguish "filter matched nothing"
          // from a transient grid teardown mid-transition. A single zero glimpse during DOM
          // swap is not evidence the filter finished — Angular rebuilds within one poll cycle.
          consecutiveZeroPolls++;
          if (consecutiveZeroPolls >= 2) return;
          await this.page.waitForTimeout(300);
          continue;
        }
        consecutiveZeroPolls = 0;
        let allMatch = true;
        let matchingDataRows = 0;
        for (let r = 0; r < count; r++) {
          const elementExists = await this.page
            .locator(tc.rowLanguageTrigger(r))
            .first()
            .count() > 0;
          if (!elementExists) {
            // Row has no language element in the DOM (trailing add-row). Skip it —
            // it is not a data row and cannot participate in the language postcondition.
            continue;
          }
          const lang = await this.tryGetRowLanguage(r);
          if (lang === null) {
            // Element exists but read timed out — grid is still settling. Retry.
            allMatch = false;
            break;
          }
          if (lang !== language) {
            // Genuine mismatch on a data row — grid has not finished filtering.
            allMatch = false;
            break;
          }
          matchingDataRows++;
        }
        // At least one data row must match before declaring success — otherwise an empty
        // grid with only the add-row would trivially satisfy the postcondition.
        if (allMatch && matchingDataRows > 0) return;
        await this.page.waitForTimeout(300);
      }
      // Timeout — loud failure with full per-row diagnostics.
      const finalCount = await this.getRowCount();
      const rowDetails: string[] = [];
      for (let r = 0; r < finalCount; r++) {
        const lang = await this.tryGetRowLanguage(r);
        const elementExists = await this.page
          .locator(tc.rowLanguageTrigger(r))
          .first()
          .count() > 0;
        const display = lang === null ? '<null>' : lang === '' ? '<empty>' : lang;
        const detail = `  [${r}] lang=${display} dom=${elementExists}`;
        rowDetails.push(detail);

      }
      throw new Error(
        `Language filter "${language}" did not apply within ${timeout}ms. ` +
        `Rows: ${finalCount}. Per-row detail:\n${rowDetails.join('\n')}`
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

  /** Opens a row's language dropdown and returns its options. */
  @step('Open a row language dropdown and return its options')
  async getRowLanguages(row: number): Promise<string[]> {
    await this.page.locator(tc.rowLanguageTrigger(row)).first().click();
    await this.page.getByRole('option').first().waitFor({ state: 'visible', timeout: 5_000 });
    const opts = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    await this.waitForAngularStable();
    return opts.map((o) => o.replace(/\s+/g, ' ').trim()).filter((o) => o.length > 0);
  }

  /**
   * Selects a language from a row's per-row language dropdown.
   * Uses the Radix dropdown interaction pattern with retry for large option lists.
   */
  @step('Choose a language from a row language dropdown')
  async selectRowLanguage(row: number, language: string): Promise<void> {
    await this.page.locator(tc.rowLanguageTrigger(row)).first().click();
    const option = this.page.getByRole('option', { name: language, exact: true }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- add row

  /** Adds an empty row at the end of the grid. Waits for it to appear. */
  @step('Add an empty row to the grid')
  async addRow(): Promise<void> {
    const countBefore = await this.page.locator(tc.allNames).count();
    await this.page.locator(tc.addRow).first().click();
    // Wait for the new row to appear in the DOM.
    await this.page.locator(tc.allNames).nth(countBefore).waitFor({ state: 'visible', timeout: 10_000 });
  }

  // ---------------------------------------------------------------- rich-text editor

  /**
   * Opens the editor for a specific column of a row.
   * The editor panel is REBUILT on every cell switch — this method always re-queries.
   * @param column Which HTML column to open: 'left', 'right', or 'bottom'.
   */
  @step('Open the rich text editor for a row column')
  async openEditor(row: number, column: 'left' | 'right' | 'bottom'): Promise<void> {
    const cellSelector = column === 'left'
      ? tc.rowHtmlCellLeft(row)
      : column === 'right'
        ? tc.rowHtmlCellRight(row)
        : tc.rowHtmlCellBottom(row);
    await this.page.locator(cellSelector).first().click();
    await this.page.locator(tc.editorContent).first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Whether the rich text editor panel is currently visible and editable. */
  @step('Check whether the rich text editor is open and editable')
  async isEditorVisible(): Promise<boolean> {
    const editor = this.page.locator(tc.editorContent).first();
    if ((await editor.count()) === 0) return false;
    if (!(await editor.isVisible().catch(() => false))) return false;
    return (await editor.getAttribute('contenteditable')) === 'true';
  }

  /**
   * Reads the visible text currently in the rich text editor.
   * Always re-queries the editor locator (never cached).
   */
  @step('Read the visible text in the rich text editor')
  async getEditorText(): Promise<string> {
    const editor = this.page.locator(tc.editorContent).first();
    if ((await editor.count()) === 0) return '';
    return (await editor.textContent())?.replace(/\s+/g, ' ').trim() || '';
  }

  /** Reads the editor text exactly as the DOM stores it, preserving whitespace. */
  @step('Read raw text in the rich text editor')
  async getEditorRawText(): Promise<string> {
    const editor = this.page.locator(tc.editorContent).first();
    if ((await editor.count()) === 0) return '';
    return (await editor.textContent()) || '';
  }

  /** Reads the inner HTML of the editor. Useful for asserting encoding behaviour. */
  @step('Read the HTML content of the rich text editor')
  async getEditorHtml(): Promise<string> {
    const editor = this.page.locator(tc.editorContent).first();
    return (await editor.innerHTML()) || '';
  }

  /**
   * Types text into the currently open editor using real keyboard input.
   * ProseMirror ignores fill() and execCommand — this is the only reliable method.
   * The editor must already be open (call openEditor first).
   */
  @step('Type text into the open rich text editor')
  async typeInEditor(text: string): Promise<void> {
    const editor = this.page.locator(tc.editorContent).first();
    await editor.click();
    await this.page.keyboard.type(text);
    await this.waitForAngularStable();
  }

  /**
   * Clears the editor content and types new text.
   * The editor must already be open.
   */
  @step('Clear the editor and type new text')
  async setEditorText(text: string): Promise<void> {
    const editor = this.page.locator(tc.editorContent).first();
    await editor.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Delete');
    await this.page.keyboard.type(text);
    await this.waitForAngularStable();
  }

  /**
   * Selects all text in the currently open editor.
   * The editor must already be open.
   */
  @step('Select all text in the open rich text editor')
  async selectAllEditorText(): Promise<void> {
    // Re-query — the editor panel is rebuilt on every cell switch.
    const editor = this.page.locator(tc.editorContent).first();
    await editor.click();
    await this.page.keyboard.press('Control+a');
    await this.waitForAngularStable();
  }

  /**
   * Clicks the Bold toolbar button in the currently open editor.
   * Re-queries the toolbar locator on every call — the editor panel is rebuilt on every
   * cell switch so a cached handle would go stale.
   */
  @step('Click the Bold button in the editor toolbar')
  async clickBold(): Promise<void> {
    // Re-query every time; the toolbar is part of the rebuilt panel.
    await this.page.locator(tc.rteBold).first().click();
    await this.waitForAngularStable();
  }

  /** Clears the editor content without typing new text. */
  @step('Clear all content from the rich text editor')
  async clearEditor(): Promise<void> {
    const editor = this.page.locator(tc.editorContent).first();
    await editor.click();
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.press('Delete');
    await this.waitForAngularStable();
  }

  /**
   * Reads the HTML cell preview text for a specific column of a row without opening the editor.
   * Useful for verifying rendered content in the grid.
   */
  @step('Read the preview text of a grid cell without opening the editor')
  async getCellPreviewText(row: number, column: 'left' | 'right' | 'bottom'): Promise<string> {
    const selector = column === 'left'
      ? tc.rowHtmlCellLeft(row)
      : column === 'right'
        ? tc.rowHtmlCellRight(row)
        : tc.rowHtmlCellBottom(row);
    const raw = await this.page.locator(selector).first().textContent();
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------- save

  /**
   * Clicks Save and waits for the PUT round-trip to complete.
   *
   * This method CANNOT confirm whether the save succeeded — the UI disables Save
   * identically on success AND on server error. Use saveAndCaptureResponse
   * when a test needs to distinguish success from failure.
   */
  @step('Click Save and wait for the request to complete')
  async save(timeout = 15_000): Promise<void> {
    const saveResponse = this.page.waitForResponse(
      (resp: Response) => resp.url().includes('terms-conditions-texts') && resp.request().method() === 'PUT',
      { timeout }
    );
    await this.page.locator(tc.save).first().click();
    await saveResponse;
    await this.waitUntilSaveDisabled(5_000);
  }

  /**
   * Clicks Save and returns the HTTP status, request payload, and response body.
   *
   * Use this when a test needs to verify the server actually accepted the change.
   * Button-disabled does NOT imply success: the UI disables Save identically
   * whether the server returns 2xx or 500. This method exposes the actual network exchange
   * so specs can assert on it.
   *
   * - requestBody: the bulk PUT payload (proves every row was sent in the bulk PUT).
   * - responseBody: the server's reply (carries any 500 message from a failed save).
   */
  @step('Click Save and capture the HTTP response')
  async saveAndCaptureResponse(timeout = 15_000): Promise<{ status: number; requestBody: unknown; responseBody: unknown }> {
    let capturedRequest: Request | null = null;
    const responsePromise = this.page.waitForResponse(
      (resp: Response) => {
        if (resp.url().includes('terms-conditions-texts') && resp.request().method() === 'PUT') {
          capturedRequest = resp.request();
          return true;
        }
        return false;
      },
      { timeout }
    );
    await this.page.locator(tc.save).first().click();
    const response = await responsePromise;

    let requestBody: unknown = null;
    if (capturedRequest) {
      try {
        requestBody = (capturedRequest as Request).postDataJSON();
      } catch {
        requestBody = null;
      }
    }

    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      try {
        responseBody = await response.text();
      } catch {
        responseBody = null;
      }
    }

    return { status: response.status(), requestBody, responseBody };
  }

  // ---------------------------------------------------------------- unsaved-changes dialog

  /** Whether the unsaved-changes dialog is currently visible. */
  @step('Check whether the unsaved changes dialog is open')
  async isUnsavedDialogOpen(): Promise<boolean> {
    return this.page.locator('[role="alertdialog"]').first().isVisible().catch(() => false);
  }

  /** Text content of the unsaved-changes dialog, collapsed to a single line. */
  @step('Read the message shown in the unsaved changes dialog')
  async getUnsavedDialogMessage(): Promise<string> {
    const dialog = this.page.locator('[role="alertdialog"]').first();
    if (!(await dialog.isVisible().catch(() => false))) return '';
    return ((await dialog.textContent()) || '').replace(/\s+/g, ' ').trim();
  }

  /** Clicks Stay on the unsaved-changes dialog. */
  @step('Click Stay to keep unsaved changes on the page')
  async clickStay(): Promise<void> {
    await this.page.getByRole('button', { name: 'Stay', exact: true }).first().click();
    await this.page.locator('[role="alertdialog"]').first()
      .waitFor({ state: 'hidden', timeout: 5_000 });
  }

  /** Clicks Discard on the unsaved-changes dialog and waits for grid reload. */
  @step('Click Discard to abandon unsaved changes')
  async clickDiscard(): Promise<void> {
    await this.page.getByRole('button', { name: 'Discard', exact: true }).first().click();
    await this.page.locator('[role="alertdialog"]').first()
      .waitFor({ state: 'hidden', timeout: 5_000 });
    await this.waitForAngularStable();
  }

  // ---------------------------------------------------------------- column headers

  /** Column header text, in display order. */
  @step('Read the column header text in display order')
  async getColumnHeaders(): Promise<string[]> {
    const raw = await this.page.locator(tc.headers).allTextContents();
    return raw.map((h) => h.replace(/\s+/g, ' ').trim()).filter((h) => h.length > 0);
  }

  // ---------------------------------------------------------------- fixture row

  /**
   * Returns the row index of the automation-owned fixture row, creating it if absent.
   *
   * Lookup-or-create with cross-language recovery:
   * 1. Checks the default-language view first (fast path — the common case).
   * 2. If missing there, sweeps every per-language filter to find a re-languaged row.
   *    Name uniqueness is enforced cross-language (see TC-TNC-CORE-059), so
   *    creating a duplicate would fail — the only correct recovery is to move the existing
   *    row back to the default language.
   * 3. If the row exists under a non-default language, changes its language back to the
   *    default, saves, and verifies persistence after reload.
   * 4. Only when the row is genuinely absent from every language does the create path run.
   *
   * The fixture name is stable across runs (no clock or random component) so a failed
   * cleanup never strands an unsearchable row.
   */
  @step('Ensure the automation fixture row exists in the grid')
  async ensureFixtureRow(officeNo: string = '1604'): Promise<number> {
    // Step 1 — check the default language view (fast path).
    const currentLang = await this.getSelectedFilterLanguage();
    if (!currentLang.includes(TNC_DEFAULT_LANGUAGE)) {
      await this.selectFilterLanguage(TNC_DEFAULT_LANGUAGE);
      await this.waitForGrid();
    }

    const defaultNames = await this.getAllNames();
    const defaultIndex = defaultNames.indexOf(TNC_FIXTURE_ROW_NAME);
    if (defaultIndex !== -1) {
      Log.info(`Fixture row "${TNC_FIXTURE_ROW_NAME}" found at index ${defaultIndex}`);
      return defaultIndex;
    }

    // Step 2 — not in the default view; sweep per-language filters for a re-languaged row.
    // Skip 'All' (would match any language but doesn't tell us which one the row is filed
    // under) and skip the default language (already checked).
    let foundInLanguage: string | null = null;
    const perLanguageFilters = TNC_FILTER_LANGUAGES.filter(
      (lang) => lang !== 'All' && lang !== TNC_DEFAULT_LANGUAGE,
    );

    for (const lang of perLanguageFilters) {
      await this.selectFilterLanguage(lang);
      await this.waitForGrid();
      const names = await this.getAllNames();
      if (names.includes(TNC_FIXTURE_ROW_NAME)) {
        foundInLanguage = lang;
        Log.info(`Fixture row "${TNC_FIXTURE_ROW_NAME}" found under "${lang}" — will restore to "${TNC_DEFAULT_LANGUAGE}"`);
        break;
      }
    }

    if (foundInLanguage) {
      // Step 3 — move the row back to the default language, save, and verify persistence.
      return this.restoreFixtureLanguage(officeNo, foundInLanguage);
    }

    // Step 4 — genuinely absent; create it.
    Log.info(`Fixture row "${TNC_FIXTURE_ROW_NAME}" not found in any language — creating`);
    await this.selectFilterLanguage(TNC_DEFAULT_LANGUAGE);
    await this.waitForGrid();
    return this.createFixtureRow(officeNo);
  }

  /**
   * Restores a re-languaged fixture row back to the default language, saves, and verifies
   * persistence. Called only when the row was found under a non-default language filter.
   */
  @step('Restore the fixture row to the default language')
  private async restoreFixtureLanguage(officeNo: string, currentLanguage: string): Promise<number> {
    // Ensure we are viewing the language the row is filed under.
    const selectedLang = await this.getSelectedFilterLanguage();
    if (!selectedLang.includes(currentLanguage)) {
      await this.selectFilterLanguage(currentLanguage);
      await this.waitForGrid();
    }

    const rowIndex = await this.findRowByName(TNC_FIXTURE_ROW_NAME);
    await this.selectRowLanguage(rowIndex, TNC_DEFAULT_LANGUAGE);

    const saveReady = await this.waitUntilSaveEnabled(10_000);
    if (!saveReady) {
      throw new Error(
        `Save did not become enabled after restoring fixture row "${TNC_FIXTURE_ROW_NAME}" ` +
        `from "${currentLanguage}" to "${TNC_DEFAULT_LANGUAGE}".`,
      );
    }

    const { status } = await this.saveAndCaptureResponse();
    if (status < 200 || status >= 300) {
      throw new Error(
        `Server returned HTTP ${status} when saving language restore for fixture row "${TNC_FIXTURE_ROW_NAME}".`,
      );
    }

    // Verify persistence after reload — read the value back after saving to prove it persisted.
    await this.saveAndVerifyPersisted({
      label: `fixture row "${TNC_FIXTURE_ROW_NAME}" language restore`,
      isAtTarget: async () => {
        const names = await this.getAllNames();
        return names.includes(TNC_FIXTURE_ROW_NAME);
      },
      applyMutation: async () => {
        // Row was already language-changed and saved above; re-apply if persistence
        // verification failed (the row might have reverted to the wrong language).
        const lang = await this.getSelectedFilterLanguage();
        if (lang.includes(TNC_DEFAULT_LANGUAGE)) {
          // We are on the default view but the row is missing — it reverted.
          // Switch to the old language, re-apply the change.
          await this.selectFilterLanguage(currentLanguage);
          await this.waitForGrid();
        }
        const idx = await this.findRowByName(TNC_FIXTURE_ROW_NAME);
        await this.selectRowLanguage(idx, TNC_DEFAULT_LANGUAGE);
      },
      save: async () => {
        const ready = await this.waitUntilSaveEnabled(5_000);
        if (!ready) return;
        await this.save();
      },
      reload: async () => {
        await this.reloadAndWait(officeNo);
        const lang = await this.getSelectedFilterLanguage();
        if (!lang.includes(TNC_DEFAULT_LANGUAGE)) {
          await this.selectFilterLanguage(TNC_DEFAULT_LANGUAGE);
          await this.waitForGrid();
        }
      },
    });

    const confirmedIndex = await this.findRowByName(TNC_FIXTURE_ROW_NAME);
    Log.info(`Fixture row "${TNC_FIXTURE_ROW_NAME}" restored to "${TNC_DEFAULT_LANGUAGE}" at index ${confirmedIndex}`);
    return confirmedIndex;
  }

  /** Creates the fixture row from scratch (only when genuinely absent from all languages). */
  @step('Create the automation fixture row')
  private async createFixtureRow(officeNo: string): Promise<number> {
    await this.addRow();
    const newIndex = await this.getLastRowIndex();

    await this.setRowName(newIndex, TNC_FIXTURE_ROW_NAME);

    const rowLang = await this.getRowLanguage(newIndex);
    if (!rowLang.includes(TNC_DEFAULT_LANGUAGE)) {
      await this.selectRowLanguage(newIndex, TNC_DEFAULT_LANGUAGE);
    }

    const saveReady = await this.waitUntilSaveEnabled(10_000);
    if (!saveReady) {
      throw new Error(
        `Save did not become enabled after creating fixture row "${TNC_FIXTURE_ROW_NAME}". ` +
        'The row may have a validation error (duplicate name, empty name, etc.).',
      );
    }

    const { status } = await this.saveAndCaptureResponse();
    if (status < 200 || status >= 300) {
      throw new Error(
        `Server returned HTTP ${status} when saving fixture row "${TNC_FIXTURE_ROW_NAME}".`,
      );
    }

    // Verify persistence after reload — read the value back after saving to prove it persisted.
    await this.saveAndVerifyPersisted({
      label: `fixture row "${TNC_FIXTURE_ROW_NAME}"`,
      isAtTarget: async () => {
        const refreshedNames = await this.getAllNames();
        return refreshedNames.includes(TNC_FIXTURE_ROW_NAME);
      },
      applyMutation: async () => {
        await this.addRow();
        const idx = await this.getLastRowIndex();
        await this.setRowName(idx, TNC_FIXTURE_ROW_NAME);
        const lang = await this.getRowLanguage(idx);
        if (!lang.includes(TNC_DEFAULT_LANGUAGE)) {
          await this.selectRowLanguage(idx, TNC_DEFAULT_LANGUAGE);
        }
      },
      save: async () => {
        const ready = await this.waitUntilSaveEnabled(5_000);
        if (!ready) return;
        await this.save();
      },
      reload: async () => {
        await this.reloadAndWait(officeNo);
        const lang = await this.getSelectedFilterLanguage();
        if (!lang.includes(TNC_DEFAULT_LANGUAGE)) {
          await this.selectFilterLanguage(TNC_DEFAULT_LANGUAGE);
          await this.waitForGrid();
        }
      },
    });

    const confirmedIndex = await this.findRowByName(TNC_FIXTURE_ROW_NAME);
    Log.info(`Fixture row "${TNC_FIXTURE_ROW_NAME}" confirmed at index ${confirmedIndex}`);
    return confirmedIndex;
  }

  // ---------------------------------------------------------------- private helpers

  /** Fills a plain-text input field and moves focus away so validation triggers. */
  private async fillAndBlur(selector: string, value: string): Promise<void> {
    const field: Locator = this.page.locator(selector).first();
    await field.click();
    await field.fill(value);
    await this.page.keyboard.press('Tab');
    await this.waitForAngularStable();
  }
}
