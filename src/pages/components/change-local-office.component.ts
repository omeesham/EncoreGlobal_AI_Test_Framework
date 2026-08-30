import { Page } from '@playwright/test';
import { step } from '../../fixtures/step-decorator';
import { Log } from '../../utils/logger';
import {
  BTN_ADD,
  DRAWER_CONTAINER,
  BTN_DRAWER_CANCEL,
} from '../../selectors/discount-optimization/discount-optimization';

// "Change Local Office" drawer behind the Add button on the Discount Optimization Locations tab.
// It is an `aside` drawer, not a `[role="dialog"]` modal.
export class ChangeLocalOfficeComponent {
  constructor(private readonly page: Page) {}

  /** Whether the Add button that opens this drawer is present and visible. */
  @step('Check whether the Add button is available')
  async isAddAvailable(): Promise<boolean> {
    return this.page.locator(BTN_ADD).first().isVisible().catch(() => false);
  }

  /** Clicks Add and waits for the Change Local Office drawer to open. */
  @step('Open the Change Local Office drawer')
  async open(): Promise<void> {
    await this.page.locator(BTN_ADD).first().click();
    await this.page.locator(DRAWER_CONTAINER).first().waitFor({ state: 'visible', timeout: 10_000 });
    Log.info('Change Local Office drawer opened');
  }

  /** Clicks the drawer's Cancel button and waits for the drawer to close. */
  @step('Cancel the Change Local Office drawer')
  async cancel(): Promise<void> {
    await this.page.locator(BTN_DRAWER_CANCEL).first().click();
    await this.page.locator(DRAWER_CONTAINER).first().waitFor({ state: 'hidden', timeout: 5_000 });
    Log.info('Change Local Office drawer cancelled');
  }
}
