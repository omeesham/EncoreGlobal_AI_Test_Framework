import { Locator } from '@playwright/test';
import { LocalOfficeSettingsPage } from './local-office-settings.page';
import { LocalOfficeHistorySelectors, LocalOfficeSettingsSelectors, getTsSelector } from '../../selectors';
import { step } from '../../fixtures/step-decorator';

export class LocalOfficeHistoryPage extends LocalOfficeSettingsPage {

  protected getElement(elementName: string): Locator {
    const selector = (LocalOfficeHistorySelectors as Record<string, string>)[elementName]
      ?? (LocalOfficeSettingsSelectors as Record<string, string>)[elementName]
      ?? getTsSelector(elementName);
    if (!selector) throw new Error(`Selector '${elementName}' not found in Local Office History, Settings, or global selectors`);
    return this.page.locator(selector);
  }

  @step('Navigate to history tab')
  async navigateToHistoryTab(): Promise<void> {
    const tab = this.getElement('tabHistory');
    const isSelected = await tab.getAttribute('aria-selected').catch(() => null);
    if (isSelected !== 'true') {
      await tab.click();
      await this.waitForAngularStable();
      await this.dismissAlertDialogIfVisible();
    }
    await this.getElement('tblHistory').waitFor({ state: 'visible', timeout: 15_000 });
  }

  @step('Get history column header count')
  async getHistoryColumnHeaderCount(): Promise<number> {
    return this.getElement('tblHistory').locator('th').count();
  }

  @step('Is history table empty')
  async isHistoryTableEmpty(): Promise<boolean> {
    const text = (await this.getElement('tblHistory').textContent() || '').trim();
    return text.includes('No results.');
  }

  @step('Get history sort button count')
  async getHistorySortButtonCount(): Promise<number> {
    return this.getElement('tblHistory').locator('th button').count();
  }

  @step('Get history column headers')
  async getHistoryColumnHeaders(): Promise<string[]> {
    const table = this.getElement('tblHistory');
    return (await table.locator('th').allTextContents()).map(t => t.trim());
  }

 // Booleans render as lucide-check SVGs, so textContent is "" for both true and false —
 // an empty cell must be re-checked against innerHTML.
  @step('Get history column by header')
  async getHistoryColumnByHeader(rowIndex: number, headerText: string): Promise<string> {
    const headers = await this.getHistoryColumnHeaders();
    const colIndex = headers.indexOf(headerText);
    if (colIndex === -1) throw new Error(`Column "${headerText}" not found in Local Office history table`);

    const cell = this.getElement('tblHistory').locator('tbody tr').nth(rowIndex).locator('td').nth(colIndex);
    const text = (await cell.textContent() || '').trim();

    if (text === '') {
      const html = await cell.innerHTML();
      if (html.includes('lucide-check')) return '✔';
    }
    return text;
  }

  @step('Get history row values')
  async getHistoryRowValues(rowIndex: number, headerTexts: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const header of headerTexts) {
      result[header] = await this.getHistoryColumnByHeader(rowIndex, header);
    }
    return result;
  }

  @step('Sort history by modified on desc')
  async sortHistoryByModifiedOnDesc(): Promise<void> {
    const headers = await this.getHistoryColumnHeaders();
    const colIndex = headers.indexOf('Modified On');
    if (colIndex === -1) throw new Error('Column "Modified On" not found in Local Office history table');

    const th = this.getElement('tblHistory').locator('th').nth(colIndex);
    const sortBtn = th.locator('button');
    if (await sortBtn.count() === 0) throw new Error('"Modified On" column has no sort button');

    const ariaSort = await th.getAttribute('aria-sort').catch(() => null);
    if (ariaSort === 'descending') return;
    await sortBtn.click();
    const menu = this.page.locator('[role="menu"]');
    await menu.waitFor({ state: 'visible', timeout: 5_000 });
    await menu.locator('[role="menuitem"]:has-text("Sort descending")').click();
    await this.waitForAngularStable();
  }

  @step('Is history tab read only')
  async isHistoryTabReadOnly(): Promise<boolean> {
    const panel = this.getElement('tabContentHistory');
    // Count inside tblHistory, not the panel: the paginator's page-number input is a sibling of
    // the table, and counting it would make a read-only tab look editable.
    const inputs = await this.getElement('tblHistory').locator('input:not([type="hidden"]), textarea').count();
    const saveBtn = await panel.locator('button:has-text("Save")').count();
    return inputs === 0 && saveBtn === 0;
  }

  @step('Get history pagination text')
  async getHistoryPaginationText(): Promise<string> {
    const panel = this.getElement('tabContentHistory');
    const text = await panel.locator('text=/\\d+ \\/ \\d+/').textContent().catch(() => '');
    return (text || '').trim();
  }

  @step('Get history pagination button count')
  async getHistoryPaginationButtonCount(): Promise<number> {
    const panel = this.getElement('tabContentHistory');
    return panel.locator('button[aria-label*="page"], button[aria-label*="Page"]').count();
  }
}
