import { MicrosoftLoginSelectors } from './auth/login';
import { SetupLeftPanelBasicInformationSelectors } from './locations/left-panel-basic-information';
import { SetupLocalInfoSelectors } from './locations/local-info';
import { SetupCurrencySelectors } from './locations/currency';
import { SetupPricingSelectors } from './locations/pricing';
import { SetupAccountAddressSelectors } from './locations/account-address';
import { SetupSharedSelectors } from './locations/shared';
import { SetupSharedSetupLocationsSelectors } from './locations/shared-setup-locations';
import { SetupNotesSelectors } from './locations/notes';
import { SetupLegalSelectors } from './locations/legal';
import { SetupAutoAddonSelectors } from './locations/auto-addon';
import { SetupHistorySelectors } from './locations/history';
import { LocalOfficeSettingsSelectors } from './local-office/local-office-settings';
import { LocalOfficeHistorySelectors } from './local-office/local-office-history';
import { LocalOfficeEctSelectors } from './local-office/local-office-ect';
import {
  CorporatePricingSelectors,
  CorporatePricingSearchSelectors,
  CorporatePricingDetailsSelectors,
  CorporatePricingStrategySelectors,
  CorporatePricingDetailGridSelectors,
  CorporatePricingNewPricebookSelectors,
} from './corporate-pricing';
import { CorporatePricingOverrideSelectors } from './corporate-override/override';

export { MicrosoftLoginSelectors } from './auth/login';
export { DynamicSelectors } from './auth/dynamic';
export { SetupLeftPanelBasicInformationSelectors } from './locations/left-panel-basic-information';
export { SetupLocalInfoSelectors } from './locations/local-info';
export { SetupCurrencySelectors } from './locations/currency';
export { SetupPricingSelectors } from './locations/pricing';
export { SetupAccountAddressSelectors } from './locations/account-address';
export { SetupSharedSelectors } from './locations/shared';
export { SetupSharedSetupLocationsSelectors } from './locations/shared-setup-locations';
export { SetupNotesSelectors } from './locations/notes';
export { SetupLegalSelectors } from './locations/legal';
export { SetupAutoAddonSelectors } from './locations/auto-addon';
export { SetupHistorySelectors } from './locations/history';
export { LocalOfficeSettingsSelectors } from './local-office/local-office-settings';
export { LocalOfficeHistorySelectors } from './local-office/local-office-history';
export { LocalOfficeEctSelectors } from './local-office/local-office-ect';
export { CorporatePricingSelectors } from './corporate-pricing';

export const LocationSettingsSelectors = {
  ...SetupLeftPanelBasicInformationSelectors,
  ...SetupLocalInfoSelectors,
  ...SetupCurrencySelectors,
  ...SetupPricingSelectors,
  ...SetupAccountAddressSelectors,
  ...SetupSharedSelectors,
  ...SetupSharedSetupLocationsSelectors,
  ...SetupNotesSelectors,
  ...SetupLegalSelectors,
  ...SetupAutoAddonSelectors,
  ...SetupHistorySelectors,
} as const;

function buildAllSelectors(...objects: Record<string, string>[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const obj of objects) {
    for (const [key, value] of Object.entries(obj)) {
      if (merged[key]) throw new Error(`Selector collision: "${key}" defined in multiple groups`);
      merged[key] = value;
    }
  }
  return merged;
}

// Pass each Location Settings partition individually for intra-LS collision detection.
// NOTE: LocalOfficeSettingsSelectors deliberately EXCLUDED from ALL_SELECTORS.
// It has keys (btnSave, tabBasicInformation) that collide with Location Settings
// but point to DIFFERENT elements on a DIFFERENT page. Including it would throw.
// Local Office pages access their selectors via LocalOfficeSettingsSelectors directly.
export const ALL_SELECTORS = buildAllSelectors(
  MicrosoftLoginSelectors,
  SetupLeftPanelBasicInformationSelectors,
  SetupLocalInfoSelectors,
  SetupCurrencySelectors,
  SetupPricingSelectors,
  SetupAccountAddressSelectors,
  SetupSharedSelectors,
  SetupSharedSetupLocationsSelectors,
  SetupNotesSelectors,
  SetupLegalSelectors,
  SetupAutoAddonSelectors,
  SetupHistorySelectors,
);

// Validate LOS selectors don't collide with non-Location modules.
// (LOS is allowed to "collide" with Location Settings — different pages, same button names)
// HIS + ECT namespaces are namespace-prefixed (drpHistoryType, fldVenueFixedCosts, etc.)
// and share zero keys with Settings — included here to verify same property.
void buildAllSelectors(
  MicrosoftLoginSelectors,
  LocalOfficeSettingsSelectors,
  LocalOfficeHistorySelectors,
  LocalOfficeEctSelectors,
);

// Corporate Pricing — deliberately EXCLUDED from ALL_SELECTORS: CP page objects resolve
// CorporatePricingSelectors.* directly via this.page.locator(...), never through
// getTsSelector/ALL_SELECTORS, so merging CP in would add nothing.
// This check verifies the 6 CP screen partitions don't collide with EACH OTHER (intra-module).
void buildAllSelectors(
  CorporatePricingSearchSelectors,
  CorporatePricingDetailsSelectors,
  CorporatePricingStrategySelectors,
  CorporatePricingDetailGridSelectors,
  CorporatePricingOverrideSelectors,
  CorporatePricingNewPricebookSelectors,
);
// Reference the merged namespace so the import is used even though CP is excluded from ALL_SELECTORS.
void CorporatePricingSelectors;

export function getTsSelector(elementName: string): string | null {
  return ALL_SELECTORS[elementName] ?? null;
}
