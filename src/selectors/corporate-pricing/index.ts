import { CorporatePricingSearchSelectors } from './search';
import { CorporatePricingDetailsSelectors } from './details';
import { CorporatePricingStrategySelectors } from './strategy';
import { CorporatePricingDetailGridSelectors } from './pricing-detail';
import { CorporatePricingOverrideSelectors } from './override';
import { CorporatePricingNewPricebookSelectors } from './new-pricebook';

export { CorporatePricingSearchSelectors } from './search';
export { CorporatePricingDetailsSelectors } from './details';
export { CorporatePricingStrategySelectors } from './strategy';
export { CorporatePricingDetailGridSelectors } from './pricing-detail';
export { CorporatePricingOverrideSelectors } from './override';
export { CorporatePricingNewPricebookSelectors } from './new-pricebook';

export const CorporatePricingSelectors = {
  ...CorporatePricingSearchSelectors,
  ...CorporatePricingDetailsSelectors,
  ...CorporatePricingStrategySelectors,
  ...CorporatePricingDetailGridSelectors,
  ...CorporatePricingOverrideSelectors,
  ...CorporatePricingNewPricebookSelectors,
} as const;
