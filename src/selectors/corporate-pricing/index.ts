import { CorporatePricingSearchSelectors } from './search';
import { CorporatePricingDetailsSelectors } from './details';
import { CorporatePricingStrategySelectors } from './strategy';
import { CorporatePricingDetailGridSelectors } from './pricing-detail';
import { CorporatePricingNewPricebookSelectors } from './new-pricebook';

export { CorporatePricingSearchSelectors } from './search';
export { CorporatePricingDetailsSelectors } from './details';
export { CorporatePricingStrategySelectors } from './strategy';
export { CorporatePricingDetailGridSelectors } from './pricing-detail';
export { CorporatePricingNewPricebookSelectors } from './new-pricebook';

export const CorporatePricingSelectors = {
  ...CorporatePricingSearchSelectors,
  ...CorporatePricingDetailsSelectors,
  ...CorporatePricingStrategySelectors,
  ...CorporatePricingDetailGridSelectors,
  ...CorporatePricingNewPricebookSelectors,
} as const;
