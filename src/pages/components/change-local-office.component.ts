import { Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { Log } from '../../utils/logger';
import {
  BTN_ADD,
  BTN_DRAWER_CANCEL,
  BTN_DRAWER_UPDATE,
  BTN_SELECT_LOCATION,
  PANEL_LOCATIONS,
} from '../../selectors/discount-optimization/discount-optimization';

/**
 * Component for the Change Local Office drawer.
 *
 * Tab 1's Add button opens a right-side aside panel (not a dialog) with three controls:
 * - A "Select a Location" launcher that opens a nested location picker. The picker has no
 *   selectable rows on the current office — there is nothing to pick here.
 * - A Cancel button that closes the drawer without saving.
 * - An Update button that confirms the selection. It is disabled when the current office is
 *   already the selected location, because no change has been made.
 */
export class ChangeLocalOfficeComponent {
  constructor(private readonly page: Page) {}

  /** Opens the Change Local Office panel by clicking the Tab 1 Add button. */
  @step('Open the Change Local Office panel')
  async open(): Promise<void> {
    await this.page.locator(BTN_ADD).first().click();
    await this.page.locator(BTN_DRAWER_CANCEL).first().waitFor({ state: 'visible', timeout: 15_000 });
    Log.info('Change Local Office panel opened');
  }

  /** Cancels and closes the Change Local Office panel. */
  @step('Cancel the Change Local Office panel')
  async cancel(): Promise<void> {
    await this.page.locator(BTN_DRAWER_CANCEL).first().click();
    await this.page.locator(BTN_DRAWER_CANCEL).first().waitFor({ state: 'hidden', timeout: 5_000 });
    Log.info('Change Local Office panel cancelled');
  }

  /**
   * Opens the location picker inside the drawer.
   *
   * Note: the picker has no selectable locations on the current office.
   * There is nothing to pick — this method opens the picker only.
   */
  @step('Open the location picker')
  async openLocationPicker(): Promise<void> {
    await this.page.locator(BTN_SELECT_LOCATION).first().click();
    Log.info('Location picker opened (no selectable locations on the current office)');
  }

  /** Returns whether the Update (confirm) button is disabled. */
  @step('Check whether Confirm is disabled')
  async isConfirmDisabled(): Promise<boolean> {
    const disabled = await this.page.locator(BTN_DRAWER_UPDATE).first().isDisabled();
    Log.info(`Update button disabled: ${disabled}`);
    return disabled;
  }

  /** Returns whether the Tab 1 Add button is visible and enabled. */
  @step('Check the Add button is available')
  async isAddAvailable(): Promise<boolean> {
    const btn = this.page.locator(`${PANEL_LOCATIONS} button:text-is("Add")`).first();
    const visible = await btn.isVisible();
    const enabled = await btn.isEnabled();
    Log.info(`Add button visible=${visible} enabled=${enabled}`);
    return visible && enabled;
  }
}
