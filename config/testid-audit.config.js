const BASE_URL = process.env.BASE_URL || 'https://cloudapps-e2e.encoreglobal.com/navigator/';

/**
 * Joins a path onto BASE_URL as an absolute URL, keeping a {office} placeholder
 * readable — URL() percent-encodes the braces, and the audit substitutes the
 * office by looking for the literal token.
 */
const url = (relativePath) => new URL(String(relativePath).replace(/^\/+/, ''), BASE_URL)
  .toString()
  .replace(/%7B/gi, '{')
  .replace(/%7D/gi, '}');

module.exports = {
  baseUrl: BASE_URL,
  // Canonical verification locations - every module is checked on all three.
  offices: {
    '1606': 'USA',
    '2359': 'Canada',
    '7147': 'Mexico'
  },
  defaultModule: 'locations',
  outputDir: 'reports/testid-audit',
  modules: {
    locations: {
      label: 'Location Settings',
      baseUrl: BASE_URL,
      pages: [
        '/navigator/locations/{office}/home',
        '/navigator/locations/{office}/settings/location'
      ],
      include: [
        'src/pages/locations/**/*.ts',
        'src/selectors/locations/**/*.ts',
        'tests/locations/**/*.ts'
      ],
      targets: {
        'location-settings': {
          submodule: 'location-settings',
          page: url('locations/{office}/settings/location'),
          scopeSelector: 'main',
          output: 'reports/testid-audit-locations'
        }
      }
    },
    itemsearch: {
      label: 'Item Search',
      baseUrl: BASE_URL,
      pages: [
        '/navigator/locations/{office}/products',
        '/navigator/locations/{office}/products/product-groups'
      ],
      include: [
        'src/pages/item-search/**/*.ts',
        'src/selectors/item-search/**/*.ts',
        'tests/itemsearch_products_productgroups/**/*.ts'
      ],
    },
    localOffice: {
      label: 'Local Office',
      baseUrl: BASE_URL,
      pages: [
        '/navigator/locations/{office}/settings/local-office'
      ],
      include: [
        'src/pages/local-office/**/*.ts',
        'src/selectors/local-office/**/*.ts',
        'tests/local-office/**/*.ts'
      ],
      targets: {
        'local-office-settings': {
          submodule: 'local-office-settings',
          page: url('locations/{office}/settings/local-office'),
          scopeSelector: 'main',
          output: 'reports/testid-audit-local-office'
        }
      }
    }
  }
};
