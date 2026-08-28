export const CURRENCY_COLUMN_HEADERS = ['Currency Code', 'Selected', 'Is Default', 'Merchant'];

export const UNSELECTED_CURRENCY_STATES = [
  { tcId: '003', currency: 'CAD', selectedKey: 'chkCADSelected', isDefaultKey: 'chkCADIsDefault' },
  { tcId: '004', currency: 'MXN', selectedKey: 'chkMXNSelected', isDefaultKey: 'chkMXNIsDefault' },
] as const;

export const MERCHANT_DATA = {
  usd: { id: '316370', display: '316370 - PSAV US/USD' },
  bahamas: { id: '316426', display: '316426 - Encore Bahamas/USD' },
  canada: { id: '316446', display: '316446 - PSAV Canada/CAD' },
} as const;

export const ALTERNATE_USD_MERCHANT = MERCHANT_DATA.bahamas;

export const DEFAULT_CURRENCY = 'USD';
