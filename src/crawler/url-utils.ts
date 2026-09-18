/**
 * URL handling for the crawl frontier.
 *
 * Two jobs, and they pull in opposite directions:
 *
 *   normalizeUrl()  decides whether two URLs are THE SAME PAGE, for loop prevention. It folds
 *                   record ids away, so /locations/1604/settings and /locations/1751/settings are
 *                   one entry — otherwise an application with a thousand records is an infinite
 *                   crawl wearing a finite disguise.
 *   moduleOfUrl()   decides what to CALL that page in the bug report.
 *
 * Both are deliberately conservative about what counts as an id: a path segment that is all
 * digits, a GUID, or a long opaque token. A segment like "local-office" is a route name and is
 * kept, because collapsing it would merge screens that genuinely differ.
 */

import type { ResolvedCrawlerConfig } from './types';

/** Query parameters that change between loads without changing the page. */
const VOLATILE_PARAMS = [
  't', 'ts', 'timestamp', '_', 'cachebust', 'cb', 'v', 'rand', 'nonce',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A long hex/base-ish blob with no vowels reads as a token, not a route name. */
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{16,}$/;

export function isIdSegment(segment: string): boolean {
  if (segment === '') return false;
  if (/^\d+$/.test(segment)) return true;
  if (GUID.test(segment)) return true;
  // A route name almost always contains a vowel or a hyphen; an opaque key usually does not.
  if (OPAQUE_TOKEN.test(segment) && !/[aeiou]/i.test(segment)) return true;
  return false;
}

/**
 * The identity a page is remembered by. Same normalized URL == already visited.
 *
 * Hash fragments are dropped, but only after checking whether the application routes on them:
 * a `#/path` fragment is a route in a hash-router app and is kept as part of the path.
 */
export function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  const hashIsRoute = url.hash.startsWith('#/');
  const pathSource = hashIsRoute ? `${url.pathname}${url.hash.slice(1)}` : url.pathname;
  const segments = pathSource
    .split('/')
    .filter(Boolean)
    .map((segment) => (isIdSegment(segment) ? ':id' : segment.toLowerCase()));

  for (const param of VOLATILE_PARAMS) url.searchParams.delete(param);
  const query = [...url.searchParams.keys()].sort();
  // Parameter NAMES are kept and values dropped: ?tab=notes and ?tab=legal are the same screen
  // shape, and crawling every value of every filter is the other way to loop forever.
  const search = query.length ? `?${query.join('&')}` : '';

  return `${url.origin.toLowerCase()}/${segments.join('/')}${search}`;
}

/** Absolute, hash- and trailing-slash-normalized — what actually gets navigated to. */
export function canonicalUrl(rawUrl: string, base: string): string | null {
  try {
    const url = new URL(rawUrl, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hash.startsWith('#/')) url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The screen's name in the report — the route with its record ids removed, title-cased.
 *
 * `/navigator/locations/1604/settings/local-office` becomes
 * `Locations > Settings > Local Office`, which is what a reader recognises and what groups the
 * bug list into something a team can divide up.
 */
export function moduleOfUrl(rawUrl: string, startUrl: string): string {
  let url: URL;
  let base: URL | null = null;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'Unknown';
  }
  try {
    base = new URL(startUrl);
  } catch {
    base = null;
  }

  const hashIsRoute = url.hash.startsWith('#/');
  const full = `${url.pathname}${hashIsRoute ? url.hash.slice(1) : ''}`.split('/').filter(Boolean);
  // The application's own mount path ("/navigator") is on every URL and names nothing.
  const basePrefix = base ? base.pathname.split('/').filter(Boolean) : [];
  let segments = full;
  for (const prefix of basePrefix) {
    if (segments[0] === prefix) segments = segments.slice(1);
    else break;
  }

  let named = segments.filter((segment) => !isIdSegment(segment));
  if (named.length === 0) {
    // Stripping left nothing, which happens whenever the crawl starts deep: the start path IS the
    // whole URL, so every segment is "the mount path". Falling back to the URL's own last named
    // segment names that screen "Local Office" instead of naming every screen "Home".
    named = full.filter((segment) => !isIdSegment(segment)).slice(-1);
  }
  if (named.length === 0) return 'Home';
  return named
    .slice(0, 4)
    .map((segment) =>
      segment
        // A route's file extension names nothing — "page2.html" is the screen "Page2".
        .replace(/\.(html?|aspx?|php|jsp|xhtml)$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b[a-z]/g, (c) => c.toUpperCase()),
    )
    .join(' > ');
}

export type CrawlableVerdict = { crawlable: true } | { crawlable: false; reason: string };

/** Origin allow-list, then explicit include list, then the exclude list. Order matters: an
 *  exclude must be able to veto something the include list matched. */
export function isCrawlable(rawUrl: string, config: ResolvedCrawlerConfig): CrawlableVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { crawlable: false, reason: 'not a valid absolute URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { crawlable: false, reason: `unsupported protocol "${url.protocol}"` };
  }
  if (!config.allowedOrigins.includes(url.origin)) {
    return { crawlable: false, reason: `outside the allowed origins (${url.origin})` };
  }
  if (config.includeUrlPatterns.length > 0) {
    const matched = config.includeUrlPatterns.some((pattern) => pattern.test(rawUrl));
    if (!matched) return { crawlable: false, reason: 'does not match any include pattern' };
  }
  const excluded = config.excludeUrlPatterns.find((pattern) => pattern.test(rawUrl));
  if (excluded) return { crawlable: false, reason: `matches exclude pattern /${excluded.source}/` };
  return { crawlable: true };
}
