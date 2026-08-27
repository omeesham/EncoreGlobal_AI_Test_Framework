export const AUTO_ADDON_DEFAULTS = [
  { key: 'chkAutoAddonEncoreMusic', name: 'Encore Music', checked: true },
  { key: 'chkAutoAddonWirelessPresenter', name: 'Wireless Presenter', checked: true },
  { key: 'chkAutoAddonExpressContentDesignSession', name: 'Express Content Design Session', checked: false },
  { key: 'chkAutoAddonWordly', name: 'Wordly', checked: true },
  { key: 'chkAutoAddonLabor', name: 'Labor', checked: true },
] as const;

export const UNCHECK_PERSISTENCE_CASES = [
  { key: 'chkAutoAddonWordly', name: 'Wordly', tc: 'TC-LOC-AAO-016' },
  { key: 'chkAutoAddonLabor', name: 'Labor', tc: 'TC-LOC-AAO-017' },
] as const;
