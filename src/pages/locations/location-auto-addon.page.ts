import { Page, Locator } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { BasePage } from '../base.page';
import { Log } from '../../utils/logger';
import { IConfig } from '../../types';
import { CheckboxState } from '../components/location-form-helpers.component';
export class LocationAutoAddonPage extends BasePage {
  constructor(page: Page, config?: IConfig) {
    super(page, config);
    Log.info('LocationAutoAddonPage initialized');
  }

  @step('Navigate to auto addon tab')
  async navigateToAutoAddonTab(officeNo: string = '1604'): Promise<void> {
    await this.navigateToSubTab('tabAutoAddon', 'chkAutoAddonEncoreMusic', officeNo);
  }

  @step('Is on auto addon tab')
  async isOnAutoAddonTab(): Promise<boolean> {
    const tab = this.getElement('tabAutoAddon');
    if ((await tab.count()) === 0) return false;
    return (await tab.getAttribute('aria-selected').catch(() => null)) === 'true';
  }

  @step('Navigate fresh')
  async navigateFresh(officeNo: string = '1604'): Promise<void> {
    const baseUrl = this.config?.base_url || '';
    await this.safeNavigateTo('about:blank');
    await this.navigateTo(`${baseUrl}locations/${officeNo}/settings/location`);
    await this.waitForAngularStable();
    await this.navigateToAutoAddonTab(officeNo);
  }

  @step('Get checkbox state')
  async getCheckboxState(key: string): Promise<CheckboxState> {
    return this.getRadixCheckboxState(key);
  }

  @step('Is checkbox checked')
  async isCheckboxChecked(key: string): Promise<boolean> {
    const state = await this.getRadixCheckboxState(key);
    return state.checked;
  }

 /**
 * Blind toggle — flips the checkbox from its current state. Use this when a test intentionally
 * flips the state and asserts the result; use checkCheckbox/uncheckCheckbox (idempotent) when a
 * specific target state is needed. The cascade-risk of a cleanup toggle going the wrong direction
 * is mitigated by the per-test ensureDefaultState baseline.
 */
  @step('Toggle checkbox')
  async toggleCheckbox(key: string): Promise<void> {
 // Extended timeout: form inputs are temporarily disabled during save API processing
    await this.getElement(key).click({ timeout: 30_000 });
  }

  @step('Check checkbox')
  async checkCheckbox(key: string): Promise<void> {
    await this.setRadixCheckbox(key, true);
  }

  @step('Uncheck checkbox')
  async uncheckCheckbox(key: string): Promise<void> {
    await this.setRadixCheckbox(key, false);
  }

  @step('Get checkbox count')
  async getCheckboxCount(): Promise<number> {
    return this.getElement('chkAutoAddonAll').count();
  }

 /**
 * Wired into beforeEach so EVERY test starts from a known state. A first-test-only baseline rots
 * under per-test retries (a retry re-runs beforeEach but not the first test body).
 *
 * Bounded retry (max 3) because clickSave() returns {success:true} even when Save is disabled,
 * so a silent no-op (the set didn't dirty the form) never throws. The post-reload re-read is the
 * load-bearing check.
 */
  @step('Ensure default state')
  async ensureDefaultState(
    defaults: ReadonlyArray<{ key: string; name: string; checked: boolean }>,
    officeNo: string = '1604',
  ): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let dirty = false;
      for (const item of defaults) {
        if ((await this.isCheckboxChecked(item.key)) !== item.checked) {
          if (item.checked) { await this.checkCheckbox(item.key); }
          else { await this.uncheckCheckbox(item.key); }
          dirty = true;
        }
      }
      if (!dirty) { return; } // already at defaults — nothing to restore
      await this.clickSave();
      await this.navigateFresh(officeNo);
      let allMatch = true;
      for (const item of defaults) {
        if ((await this.isCheckboxChecked(item.key)) !== item.checked) { allMatch = false; break; }
      }
      if (allMatch) { return; }
    }
    throw new Error(
      `ensureDefaultState: Auto Add-On checkboxes not at defaults after ${maxAttempts} attempts`,
    );
  }

  private get saveButton(): Locator {
    return this.getElement('btnSave');
  }

  @step('Is save enabled')
  async isSaveEnabled(): Promise<boolean> {
    return !(await this.saveButton.isDisabled());
  }

 /**
 * Custom save — intentionally NOT deduped to the base `clickSaveWithDialog` helper:
 * this tab's Save Changes dialog confirms with "Ok" (`btnSaveChangesOk`), whereas base defaults to
 * the "Save" variant (`btnSaveChangesConfirm`); and this method adds a post-save form-re-enable wait
 * (the checkboxes are disabled during save processing). Behavior is not identical → kept separate.
 */
  @step('Click save')
  async clickSave(): Promise<{ success: boolean; saved?: boolean; networkError?: string }> {
    const saveBtn = this.saveButton;
    if (await saveBtn.isDisabled()) {
      Log.info('Save button disabled -- no save performed');
      return { success: true, saved: false };
    }
    await saveBtn.click();
    const dialog = this.getElement('dlgSaveChanges');
    const dialogVisible = await dialog.waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true).catch(() => false);
    if (dialogVisible) {
      await this.getElement('btnSaveChangesOk').click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    }
    await this.waitForAngularStable();
 // Wait for the form to re-enable after the save API completes — the first checkbox is
 // disabled during save processing. Poll the actual disabled->enabled transition (no fixed sleep) via
 // waitForFunction (not a fixed-sleep loop). Best-effort: downstream actions auto-wait for
 // actionability via their own 30s click timeout, so a missed re-enable never silently passes.
    await this.page.waitForFunction(() => {
      const el = document.querySelector(
        '[data-testid="location-settings-checkbox-auto-add-on-false_encore music"]',
      ) as HTMLButtonElement | null;
      return !!el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    }, undefined, { timeout: 15_000 }).catch(() => {});
    return { success: true, saved: true };
  }

  @step('Is save dialog visible')
  async isSaveDialogVisible(): Promise<boolean> {
    return this.getElement('dlgSaveChanges').isVisible();
  }

  @step('Get save dialog heading')
  async getSaveDialogHeading(): Promise<string> {
    return (await this.getElement('dlgSaveChanges').locator('h2').textContent())?.trim() || '';
  }

  @step('Get save dialog body')
  async getSaveDialogBody(): Promise<string> {
    return (await this.getElement('dlgSaveChanges').locator('p').textContent())?.trim() || '';
  }

  @step('Click save button')
  async clickSaveButton(): Promise<void> {
    await this.saveButton.click();
  }

  @step('Click save cancel')
  async clickSaveCancel(): Promise<void> {
    await this.getElement('btnSaveChangesCancel').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Click save ok')
  async clickSaveOk(): Promise<void> {
    await this.getElement('btnSaveChangesOk').click();
    await this.getElement('dlgSaveChanges').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
 // Wait for save API to complete — form inputs are disabled during save processing
    await this.waitForAngularStable();
 // Wait for form to re-enable (first checkbox becomes interactive)
    await this.getElement('chkAutoAddonEncoreMusic').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  }

  @step('Wait for toast')
  async waitForToast(): Promise<boolean> {
    return this.getElement('toastLocalInfoUpdated')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true).catch(() => false);
  }

  @step('Click sidebar home')
  async clickSidebarHome(): Promise<void> {
    const homeLink = this.page.getByRole('link', { name: 'Home' });
    if (!await homeLink.isVisible().catch(() => false)) {
 // Sidebar collapsed in narrow viewport (headless chrome viewport:null) — expand it
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      await homeLink.waitFor({ state: 'visible', timeout: 5_000 });
    }
 // Suppress the app's beforeunload handler to prevent the fixture from auto-accepting it.
 // This lets the React routing guard show its in-app "Unsaved changes" alertdialog instead.
    await this.page.evaluate(() => {
      window.onbeforeunload = null;
      window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true);
    });
    await homeLink.click();
    // These page-scoped changes (widened viewport, suppressed beforeunload) are intentional and are
    // not restored here: the widened viewport is harmless for later tests, and the beforeunload
    // suppression is reset automatically when the next test's beforeEach reloads the page.
  }

  @step('Is unsaved dialog visible')
  async isUnsavedDialogVisible(): Promise<boolean> {
    return this.getElement('autoAddonDlgUnsavedChanges')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true).catch(() => false);
  }

  @step('Get unsaved dialog heading')
  async getUnsavedDialogHeading(): Promise<string> {
    return (await this.getElement('autoAddonDlgUnsavedChanges').locator('h2').textContent())?.trim() || '';
  }

  @step('Get unsaved dialog body')
  async getUnsavedDialogBody(): Promise<string> {
    return (await this.getElement('autoAddonDlgUnsavedChanges').locator('p').textContent())?.trim() || '';
  }

  @step('Click unsaved stay')
  async clickUnsavedStay(): Promise<void> {
    await this.getElement('btnUnsavedChangesStay').click();
    await this.getElement('autoAddonDlgUnsavedChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Click unsaved discard')
  async clickUnsavedDiscard(): Promise<void> {
    await this.getElement('btnUnsavedChangesDiscard').click();
    await this.getElement('autoAddonDlgUnsavedChanges').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  @step('Click local information tab')
  async clickLocalInformationTab(): Promise<void> {
    await this.getElement('tabLocalInformation').click();
    await this.waitForAngularStable();
  }
}
