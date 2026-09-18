/**
 * Crawler configuration: defaults, file overrides, environment overrides, and validation.
 *
 * Precedence, lowest to highest — defaults, `config/crawler/crawler.config.json`, `CRAWLER_*`
 * environment variables, then whatever the caller passes to `resolveConfig()`. A spec can
 * therefore be checked in with sane settings while a one-off run is steered entirely from the
 * command line, which is what an exploratory session actually needs.
 *
 * The safety defaults are deliberately the cautious ones: the crawler is READ-ONLY until someone
 * opts in. An exploratory tool that deletes a record on its first run does not get a second run.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Log } from '../utils/logger';
import type {
  CrawlerConfig,
  CrawlerLimits,
  CrawlerSafety,
  CrawlerTestData,
  CrawlerAuthConfig,
  DetectorId,
  ResolvedCrawlerConfig,
} from './types';

export const CONFIG_FILE = path.join(process.cwd(), 'config', 'crawler', 'crawler.config.json');

/** Every detector the utility ships with. `detectors.only` / `.disabled` filter this list. */
export const ALL_DETECTORS: DetectorId[] = [
  'page-crash',
  'console-error',
  'network-failure',
  'broken-link',
  'dead-control',
  'unexpected-route',
  'form-validation',
  'input-boundary',
  'placeholder-text',
  'missing-label',
  'accessibility',
  'layout',
  'page-title',
];

const DEFAULT_LIMITS: CrawlerLimits = {
  maxPages: 25,
  maxActionsPerPage: 12,
  maxTotalActions: 200,
  maxDepth: 3,
  maxDurationMs: 15 * 60 * 1000,
  settleMs: 900,
  actionTimeoutMs: 8_000,
  navigationTimeoutMs: 30_000,
};

/**
 * Names that change server state, and names that destroy it.
 *
 * Two lists rather than one because they are opted into separately: a tester exercising form
 * validation wants `allowWrites` without ever arming Delete. Matched case-insensitively against
 * the accessible name, as whole words, so "Save" matches a Save button but not "Saved searches".
 */
const DEFAULT_SAFETY: CrawlerSafety = {
  allowWrites: false,
  allowDestructive: false,
  writeActionPatterns: [
    'save', 'submit', 'apply', 'confirm', 'create', 'add new', 'update', 'publish',
    'import', 'upload', 'send', 'approve', 'reject', 'assign', 'duplicate', 'copy to',
    'generate', 'run', 'execute', 'sync', 'finalize', 'post',
  ],
  destructiveActionPatterns: [
    'delete', 'remove', 'discard', 'deactivate', 'disable', 'archive', 'purge', 'clear all',
    'reset', 'revoke', 'cancel order', 'terminate', 'drop', 'void', 'unpublish',
  ],
  neverClickPatterns: [
    'sign out', 'signout', 'log out', 'logout', 'switch account', 'change password',
    'download', 'export', 'print',
  ],
};

/**
 * Safe, obviously synthetic inputs.
 *
 * `valid` is keyed by a substring of the field's name, so the crawler can offer a plausible value
 * to a field it has never seen — an email box gets an address, a date box gets a date — which is
 * what makes validation probing meaningful rather than uniformly rejected noise.
 */
const DEFAULT_TEST_DATA: CrawlerTestData = {
  valid: {
    email: 'sdet.crawler@example.invalid',
    phone: '5550100',
    zip: '10001',
    postal: '10001',
    date: '01/01/2030',
    year: '2030',
    amount: '10',
    price: '10',
    rate: '1',
    percent: '5',
    qty: '2',
    quantity: '2',
    number: '5',
    hours: '8',
    code: 'SDET01',
    name: 'SDET Crawler Probe',
    search: 'zzzz-sdet-no-match',
    note: 'Automated exploratory probe — safe to ignore.',
    description: 'Automated exploratory probe — safe to ignore.',
    default: 'SDET probe',
  },
  invalid: ['!@#$%^&*()', '<script>alert(1)</script>', '   ', '-1', 'not-a-number', "'; DROP TABLE--"],
  boundary: ['0', '999999999', 'A'.repeat(300)],
};

const DEFAULT_AUTH: CrawlerAuthConfig = {
  mode: 'storage-state',
  storageStatePath: path.join(process.cwd(), '.auth', 'encore-state.json'),
  signedInSelector: 'h1',
  signedInTimeoutMs: 60_000,
};

/**
 * Framework and browser noise that is not the application's defect.
 *
 * Kept deliberately short. Every pattern here is a bug the report will never show, so the bar is
 * "provably not the application" — a third-party script, a devtools notice, a benign abort.
 */
const DEFAULT_CONSOLE_IGNORE = [
  'Download the React DevTools',
  'React DevTools',
  'favicon.ico',
  'ResizeObserver loop',
  '\\[HMR\\]',
  'Lit is in dev mode',
  'was preloaded using link preload but not used',
];

const DEFAULT_NETWORK_IGNORE = [
  'favicon.ico',
  'google-analytics',
  'googletagmanager',
  'doubleclick',
  'hot-update',
  '/__nextjs',
  'browser-sync',
];

const DEFAULT_EXCLUDES = [
  'logout',
  'signout',
  'sign-out',
  '/api/auth/signout',
  'login\\.microsoftonline\\.com',
  'b2clogin\\.com',
  '\\.(pdf|csv|xlsx|xls|zip|docx|png|jpe?g|gif|svg|woff2?|ttf)(\\?|$)',
  '^mailto:',
  '^tel:',
  '^javascript:',
];

/* ------------------------------------------------------------------ helpers */

function toRegExpList(patterns: string[], where: string): RegExp[] {
  const out: RegExp[] = [];
  for (const raw of patterns) {
    try {
      out.push(new RegExp(raw, 'i'));
    } catch {
      // A bad pattern must not sink the run — it is far more useful to crawl with one filter
      // missing and say so than to refuse to start over a stray bracket.
      Log.warn(`[crawler] ignoring invalid ${where} pattern: ${raw}`);
    }
  }
  return out;
}

function envString(name: string): string | undefined {
  const raw = process.env[name];
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : undefined;
}

function envNumber(name: string): number | undefined {
  const raw = envString(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number, got "${raw}".`);
  }
  return value;
}

function envBool(name: string): boolean | undefined {
  const raw = envString(name)?.toLowerCase();
  if (raw === undefined) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be a boolean (true/false), got "${raw}".`);
}

/** Comma-separated env list, with blanks dropped so a trailing comma is harmless. */
function envList(name: string): string[] | undefined {
  const raw = envString(name);
  if (raw === undefined) return undefined;
  const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function readConfigFile(): CrawlerConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as CrawlerConfig;
    Log.info(`[crawler] config file loaded: ${path.relative(process.cwd(), CONFIG_FILE)}`);
    return parsed;
  } catch (error) {
    // Same reasoning as a bad regex: report it and fall back to the defaults rather than
    // refusing to run, because the defaults are safe and a crawl is better than no crawl.
    Log.warn(`[crawler] config file unreadable, using defaults: ${(error as Error).message}`);
    return {};
  }
}

/** `CRAWLER_*` overrides. Read last so a one-off run never needs the file edited. */
function readEnvConfig(): CrawlerConfig {
  const env: CrawlerConfig = {};
  const startUrl = envString('CRAWLER_START_URL');
  if (startUrl) env.startUrl = startUrl;

  const origins = envList('CRAWLER_ALLOWED_ORIGINS');
  if (origins) env.allowedOrigins = origins;

  const exclude = envList('CRAWLER_EXCLUDE');
  if (exclude) env.excludeUrlPatterns = exclude;

  const include = envList('CRAWLER_INCLUDE');
  if (include) env.includeUrlPatterns = include;

  const limits: Partial<CrawlerLimits> = {};
  const maxPages = envNumber('CRAWLER_MAX_PAGES');
  if (maxPages !== undefined) limits.maxPages = maxPages;
  const maxActionsPerPage = envNumber('CRAWLER_MAX_ACTIONS_PER_PAGE');
  if (maxActionsPerPage !== undefined) limits.maxActionsPerPage = maxActionsPerPage;
  const maxTotalActions = envNumber('CRAWLER_MAX_ACTIONS');
  if (maxTotalActions !== undefined) limits.maxTotalActions = maxTotalActions;
  const maxDepth = envNumber('CRAWLER_MAX_DEPTH');
  if (maxDepth !== undefined) limits.maxDepth = maxDepth;
  const maxDurationMs = envNumber('CRAWLER_MAX_DURATION_MS');
  if (maxDurationMs !== undefined) limits.maxDurationMs = maxDurationMs;
  if (Object.keys(limits).length) env.limits = limits;

  const safety: Partial<CrawlerSafety> = {};
  const allowWrites = envBool('CRAWLER_ALLOW_WRITES');
  if (allowWrites !== undefined) safety.allowWrites = allowWrites;
  const allowDestructive = envBool('CRAWLER_ALLOW_DESTRUCTIVE');
  if (allowDestructive !== undefined) safety.allowDestructive = allowDestructive;
  if (Object.keys(safety).length) env.safety = safety;

  const only = envList('CRAWLER_DETECTORS');
  const disabled = envList('CRAWLER_DISABLE_DETECTORS');
  if (only || disabled) {
    env.detectors = {};
    if (only) env.detectors.only = only as DetectorId[];
    if (disabled) env.detectors.disabled = disabled as DetectorId[];
  }

  const outputDir = envString('CRAWLER_OUTPUT_DIR');
  if (outputDir) env.outputDir = outputDir;

  const screenshots = envBool('CRAWLER_SCREENSHOTS');
  if (screenshots !== undefined) env.captureScreenshots = screenshots;

  return env;
}

/** Later sources win; nested objects merge one level deep, which is as deep as the shape goes. */
function mergeConfig(...layers: CrawlerConfig[]): CrawlerConfig {
  const out: CrawlerConfig = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      const existing = (out as Record<string, unknown>)[key];
      const mergeable =
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing);
      (out as Record<string, unknown>)[key] = mergeable
        ? { ...(existing as object), ...(value as object) }
        : value;
    }
  }
  return out;
}

function resolveDetectors(config: CrawlerConfig): DetectorId[] {
  const unknown = [...(config.detectors?.only ?? []), ...(config.detectors?.disabled ?? [])].filter(
    (id) => !ALL_DETECTORS.includes(id),
  );
  if (unknown.length) {
    throw new Error(
      `Unknown detector(s): ${unknown.join(', ')}. Known detectors: ${ALL_DETECTORS.join(', ')}.`,
    );
  }
  const only = config.detectors?.only;
  const base = only && only.length ? ALL_DETECTORS.filter((id) => only.includes(id)) : [...ALL_DETECTORS];
  const disabled = new Set(config.detectors?.disabled ?? []);
  return base.filter((id) => !disabled.has(id));
}

/* ------------------------------------------------------------------ public API */

/**
 * Builds the configuration the crawl actually runs with.
 *
 * Throws only on input that would make the crawl meaningless or misleading — no start URL, a
 * malformed one, an unknown detector name, a non-numeric limit. Everything recoverable warns and
 * falls back, because a partial crawl reported honestly beats a refusal to start.
 */
export function resolveConfig(overrides: CrawlerConfig = {}): ResolvedCrawlerConfig {
  const merged = mergeConfig(readConfigFile(), readEnvConfig(), overrides);

  const startUrl = merged.startUrl || process.env.BASE_URL || '';
  if (!startUrl) {
    throw new Error(
      'No start URL. Set CRAWLER_START_URL, or BASE_URL, or pass { startUrl } to resolveConfig().',
    );
  }
  let origin: string;
  try {
    origin = new URL(startUrl).origin;
  } catch {
    throw new Error(`startUrl is not a valid URL: "${startUrl}".`);
  }

  const limits: CrawlerLimits = { ...DEFAULT_LIMITS, ...merged.limits };
  if (limits.maxPages < 1) throw new Error('limits.maxPages must be at least 1.');
  if (limits.maxDepth < 0) throw new Error('limits.maxDepth must be 0 or more.');

  const safety: CrawlerSafety = { ...DEFAULT_SAFETY, ...merged.safety };
  const testData: CrawlerTestData = {
    valid: { ...DEFAULT_TEST_DATA.valid, ...merged.testData?.valid },
    invalid: merged.testData?.invalid ?? DEFAULT_TEST_DATA.invalid,
    boundary: merged.testData?.boundary ?? DEFAULT_TEST_DATA.boundary,
  };

  const resolved: ResolvedCrawlerConfig = {
    startUrl,
    allowedOrigins: merged.allowedOrigins?.length ? merged.allowedOrigins : [origin],
    excludeUrlPatterns: toRegExpList(
      [...DEFAULT_EXCLUDES, ...(merged.excludeUrlPatterns ?? [])],
      'exclude',
    ),
    includeUrlPatterns: toRegExpList(merged.includeUrlPatterns ?? [], 'include'),
    auth: { ...DEFAULT_AUTH, ...merged.auth },
    limits,
    safety,
    testData,
    enabledDetectors: resolveDetectors(merged),
    outputDir: path.resolve(
      process.cwd(),
      merged.outputDir ?? path.join('reports', 'bugs', 'crawler'),
    ),
    captureScreenshots: merged.captureScreenshots ?? true,
    consoleIgnorePatterns: toRegExpList(
      [...DEFAULT_CONSOLE_IGNORE, ...(merged.consoleIgnorePatterns ?? [])],
      'console-ignore',
    ),
    networkIgnorePatterns: toRegExpList(
      [...DEFAULT_NETWORK_IGNORE, ...(merged.networkIgnorePatterns ?? [])],
      'network-ignore',
    ),
  };

  if (resolved.safety.allowDestructive) {
    Log.warn('[crawler] DESTRUCTIVE ACTIONS ARE ENABLED — the crawl may delete application data.');
  }
  return resolved;
}

/** The config as it goes into the report: regexes back to strings, nothing secret to leak. */
export function describeConfig(config: ResolvedCrawlerConfig): Record<string, unknown> {
  return {
    startUrl: config.startUrl,
    allowedOrigins: config.allowedOrigins,
    excludeUrlPatterns: config.excludeUrlPatterns.map((r) => r.source),
    includeUrlPatterns: config.includeUrlPatterns.map((r) => r.source),
    auth: { mode: config.auth.mode, signedInSelector: config.auth.signedInSelector },
    limits: config.limits,
    safety: {
      allowWrites: config.safety.allowWrites,
      allowDestructive: config.safety.allowDestructive,
    },
    enabledDetectors: config.enabledDetectors,
    captureScreenshots: config.captureScreenshots,
    outputDir: path.relative(process.cwd(), config.outputDir).replace(/\\/g, '/'),
  };
}
