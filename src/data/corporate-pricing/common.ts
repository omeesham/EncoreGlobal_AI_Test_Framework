export const CORPORATE_PRICING_ROUTES = {
  searchPath: (office = '1604'): string =>
    `/locations/${office}/settings/corporate-pricing`,
  detailsPath: (office: string, pricebookId: string): string =>
    `/locations/${office}/settings/corporate-pricing/details/${pricebookId}`,
  newPricebookPath: (office: string, type: 'equipment' | 'labor'): string =>
    `/locations/${office}/settings/corporate-pricing/add?type=${type}`,
  overridePath: (office = '1604'): string =>
    `/locations/${office}/settings/corporate-pricing/pg-override`,
} as const;

export const CORPORATE_PRICING_FIXTURES = {
  detailFixture: {
    name: '2021-PB6',
    guid: '91acb5ca-20e2-ce8e-a9ab-8c370925fd65',
    recordStatus: 'Inactive' as const,
  },
  strategyFixture: {
    name: '2022-NP Tier 1',
    guid: '5f2a4088-9268-b033-4925-a48146afb1cb',
    recordStatus: 'Active' as const,
  },
} as const;

export const CORPORATE_PRICING_COMMON = {
  office: '1604',
} as const;
