import { LocationSettingsSelectors } from '../../selectors';

type SelectorKey = keyof typeof LocationSettingsSelectors;

export const CHECKED_DEFAULTS: SelectorKey[] = [
  'chkApplyLDW',
  'chkTickerCalc',
  'chkEnableSetStrikeLaborMinutes',
  'chkApplySetStrikeLaborMinutes',
  'chkCompanyRemitTax',
  'chkCommReceiver',
  'chkIntercompany',
  'chkAllowDPCD',
  'chkCreditMemoApprovalRequired',
  'chkEnableDiscountReason',
  'chkEnableProposal',
  'chkEnableJobCosting',
  'chkServiceCharge',   // enabled+checked on Navigator Cloud (was disabled+unchecked on legacy navigator2.training.psav.com baseline)
];

export const UNCHECKED_DEFAULTS: SelectorKey[] = [
 // chkCalculateLDWonNetAmount excluded -- managed exclusively by TC-021/029 (check+save+restore cycle)
 // to avoid batch assertion failures when prior runs leave DB in dirty state.
  'chkApplyCablesConsumablesFee',
  'chkAllowETS',
  'chkAllowResortTax',
  'chkShowServiceChargeAsAdministrativeFee',
  'chkCalculateServiceChargeOnNetAmount',
  'chkInternetAssetReservation',
  'chkExcludeImpliedDiscount',
  'chkPromptForApproval',
  'chkAllowProductionQuote',
  'chkWarehouseBilling',
  'chkEnableIDCBilling',
  'chkSkipBilling',
  'chkSeparateMasterBillCommissionInvoice',
  'chkShowSubRental',
  'chkInventoryOnly',
  'chkCalculateCommissionTax',
  'chkCanCreateExternalCustomerLink',
  'chkOffsiteEventLocation',
  'chkExhibitShowRate',
  'chkEnableMultidayPricing',
];

export const DISABLED_CHECKBOXES: SelectorKey[] = [
  'chkSuppressDayRateDiscount',
  'chkCompassIntegration',
  'chkDisplayTax',
  'chkEnableJobCosting',      // disabled+checked for office 1604
  'chkUseESignature',         // disabled+checked
  'chkEnableProductGroup',    // disabled+unchecked
  'chkEnableDiscountGuidance', // disabled+checked
];

export const DISABLED_CHECKBOX_STATES: Record<string, boolean> = {
  chkSuppressDayRateDiscount: false, // always disabled, unchecked
  chkCompassIntegration: true,       // disabled for existing location, checked
  chkDisplayTax: true,               // disabled when Company Remit Tax checked
  chkEnableJobCosting: true,         // disabled+checked for office 1604
  chkUseESignature: true,            // : disabled+checked for office 1604
  chkEnableProductGroup: false,      // : disabled+unchecked for office 1604
  chkEnableDiscountGuidance: true,   // : disabled+checked for office 1604
};

export interface BoundaryCase {
  label: string;
  value: string;
  valid: boolean;
  errorContains?: string;
  restoreValue: string;
  restoreEnableKey?: SelectorKey;
  pending?: string;
}

export const LDW_BOUNDARIES: BoundaryCase[] = [
 // Input is a decimal 0.1-1.0; blur multiplies by 100 and displays "X.XX%".
 // restoreValue '0.04' is below that range — a grandfathered DB value the server still accepts.
  { label: 'valid min (10%)',           value: '0.10',  valid: true,  restoreValue: '0.04' },
  { label: 'valid mid (50%)',           value: '0.50',  valid: true,  restoreValue: '0.04' },
  { label: 'valid near max (99%)',      value: '0.99',  valid: true,  restoreValue: '0.04' },
  { label: 'valid max (100%)',          value: '1.00',  valid: true,  restoreValue: '0.04' },
 // Client validates on blur, so nothing reaches the DB. 0 and 0.01-0.09 are omitted: the client
 // accepts them and the server rejects them silently, with no signal to assert on.
  { label: 'invalid negative (-0.01)',  value: '-0.01', valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
  { label: 'invalid far below (-0.05)', value: '-0.05', valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
  { label: 'invalid above max (1.01)', value: '1.01',  valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
  { label: 'invalid far above (1.5)',  value: '1.5',   valid: false, errorContains: 'Number must be', restoreValue: '0.04' },
];

export interface DependencyCase {
  label: string;
  trigger: SelectorKey;
  triggerAction: 'check' | 'uncheck';
  target: SelectorKey;
  targetType: 'spin' | 'checkbox';
  expectedDisabled: boolean;
  expectedChecked?: boolean;
  restore: { key: SelectorKey; action: 'check' | 'uncheck' }[];
  spinRestore?: { key: SelectorKey; value: string };
  pending?: string;
}

export const SIMPLE_DEPENDENCIES: DependencyCase[] = [
  {
    label: 'Apply LDW -> LDW Percentage',
    trigger: 'chkApplyLDW', triggerAction: 'uncheck',
    target: 'spinLDWPercentage', targetType: 'spin',
    expectedDisabled: true,
    restore: [{ key: 'chkApplyLDW', action: 'check' }],
    spinRestore: { key: 'spinLDWPercentage', value: '0.04' }, // uncheck resets spin to 0; restore to '0.04' (decimal = 4%) so subsequent saves don't leave LDW%=0
  },
 // chkApplyCablesConsumablesFee, chkAllowETS and chkAllowResortTax are all ENABLED for 1604,
 // so they have no dependency to model here and are covered by standalone tests instead.
  {
    label: 'Skip Billing -> Oracle Product disabled',
    trigger: 'chkSkipBilling', triggerAction: 'check',
    target: 'txtOracleProduct', targetType: 'spin', // using spin for generic disabled check
    expectedDisabled: true,
    restore: [{ key: 'chkSkipBilling', action: 'uncheck' }],
    pending: 'Tested standalone — Skip Billing requires save+reload, not immediate toggle. See TC-LOC-LI-SKIP-BILLING in spec.',
  },
  {
    label: 'Comm Receiver -> Allow DPCD',
    trigger: 'chkCommReceiver', triggerAction: 'uncheck',
    target: 'chkAllowDPCD', targetType: 'checkbox',
    expectedDisabled: true, expectedChecked: false,
    restore: [
      { key: 'chkCommReceiver', action: 'check' },
      { key: 'chkAllowDPCD', action: 'check' },
    ],
  },
  {
    label: 'Comm Receiver -> Show SubRental',
    trigger: 'chkCommReceiver', triggerAction: 'uncheck',
    target: 'chkShowSubRental', targetType: 'checkbox',
    expectedDisabled: true,
    restore: [
      { key: 'chkCommReceiver', action: 'check' },
      { key: 'chkAllowDPCD', action: 'check' },
    ],
  },
  {
    label: 'Company Remit Tax -> Display Tax',
    trigger: 'chkCompanyRemitTax', triggerAction: 'uncheck',
    target: 'chkDisplayTax', targetType: 'checkbox',
    expectedDisabled: false,
    restore: [{ key: 'chkCompanyRemitTax', action: 'check' }],
  },
  {
    label: 'Intercompany -> Enable IDC Billing',
    trigger: 'chkIntercompany', triggerAction: 'uncheck',
    target: 'chkEnableIDCBilling', targetType: 'checkbox',
    expectedDisabled: true, expectedChecked: false,
    restore: [{ key: 'chkIntercompany', action: 'check' }],
  },
];

export const ACTIVE_DEPENDENCIES = SIMPLE_DEPENDENCIES.filter(d => !d.pending);

export const LEFT_PANEL_EXPECTED = {
  office: '1604',
  payToAddress: 'Encore',
  eCommerceActive: true,
  enableProductionsOrders: true,
} as const;

export interface MaxLengthCase {
  key: SelectorKey;
  maxLength: number;
  restoreValue: string;
}

export const TEXT_FIELD_CONSTRAINTS: MaxLengthCase[] = [
  { key: 'txtOracleProduct', maxLength: 25, restoreValue: '0000' },
  { key: 'txtOracleDepartment', maxLength: 25, restoreValue: '900' },
];

export interface CheckboxLabelCase {
  key: string;
  expected: string;
}

export const LOCAL_INFO_TEST_VALUES = {
  billingType: 'Master',
  billingTypeDirect: 'Direct',
  oracleProductTest: 'PROD001',
  oracleProductDefault: '0000',
  oracleDeptTest: 'DEPT001',
  oracleProductShort: 'CHG',
  oracleDeptDefault: '900',
  specialChars: 'TEST@#$%&*()',
} as const;

export const CHECKBOX_LABEL_CASES: CheckboxLabelCase[] = [
  { key: 'chkApplyLDW',          expected: 'Apply LDW' },
  { key: 'chkSkipBilling',       expected: 'Skip Billing' },
  { key: 'chkWarehouseBilling',  expected: 'Warehouse Billing' },
  { key: 'chkCommReceiver',      expected: 'Comm Receiver' },
  { key: 'chkAllowDPCD',             expected: 'Allow DPCD' },
  { key: 'chkEnableMultidayPricing', expected: 'Enable Multiday Pricing' },
];
