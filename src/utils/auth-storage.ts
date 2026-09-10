import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { Page, BrowserContext, Browser } from '@playwright/test';
import { recordCall as recordRetryCall, type AttemptRecord } from './retry-telemetry';
import { urlHostMatches } from './url-host';
import { LoginPage } from '../pages/auth/login.page';
import type { IConfig } from '../types';

export const AUTH_DIR = path.resolve(process.cwd(), '.auth');
export const STATE_PATH = path.join(AUTH_DIR, 'encore-state.json');
export const LOCK_TARGET = path.join(AUTH_DIR, 'encore-state.lock-target');

const LOCK_OPTS: lockfile.LockOptions = {
  retries: { retries: 30, minTimeout: 1000, maxTimeout: 3000, factor: 1 },
  stale: 120_000,
  realpath: false,
};

export function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  if (!fs.existsSync(LOCK_TARGET)) fs.writeFileSync(LOCK_TARGET, '', 'utf-8');
}

export async function acquireLock(): Promise<() => Promise<void>> {
  ensureAuthDir();
  return lockfile.lock(LOCK_TARGET, LOCK_OPTS);
}

export type StorageStateFile = { cookies?: unknown[]; origins?: unknown[] };

export function readStateOrNull(): StorageStateFile | null {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    const raw = fs.readFileSync(STATE_PATH, 'utf-8');
    return JSON.parse(raw) as StorageStateFile;
  } catch {
    return null;
  }
}

/**
 * Returns the EARLIEST positive `expires` epoch (seconds) across all
 * `next-auth.session-token*` cookies in the stored state, or `null` when:
 *   (a) state file is missing or unreadable, OR
 *   (b) no session-token cookies are present, OR
 *   (c) all session-token cookies are session-cookies (`expires === -1`
 *       or `undefined`) — treat as "no real expiry, behaves fresh".
 *
 * Tri-state semantics mirror the auth-setup expiry check
 * (`!!sessionToken && (expires === undefined || expires < 0 || expires > now)`).
 * In all `null` cases the caller's `stateMissing` / downstream behavior already
 * handles the path — no new branch needed.
 */
export function readEarliestSessionExpiry(): number | null {
  try {
    const state = readStateOrNull() as
      | { cookies?: Array<{ name: string; expires?: number }> }
      | null;
    if (!state?.cookies) return null;
    const sessionTokens = state.cookies.filter((c) =>
      c.name.includes('next-auth.session-token'),
    );
    if (sessionTokens.length === 0) return null;
    const expiries = sessionTokens
      .map((c) => c.expires)
      .filter((e): e is number => typeof e === 'number' && e > 0);
    if (expiries.length === 0) return null;
    return Math.min(...expiries);
  } catch {
    return null;
  }
}

export async function writeStateAtomic(context: BrowserContext): Promise<void> {
  ensureAuthDir();
  const tmp = `${STATE_PATH}.tmp`;
  await context.storageState({ path: tmp });
  fs.renameSync(tmp, STATE_PATH);
}

export async function validateState(page: Page, baseUrl: string): Promise<boolean> {
  const MAX_TRIES = 3;
  const callRecord: AttemptRecord[] = [];
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const t0 = Date.now();
    try {
      await page.goto(baseUrl, { timeout: 90_000, waitUntil: 'domcontentloaded' });

      const currentUrl = page.url().toLowerCase();
      if (urlHostMatches(currentUrl, 'login.microsoftonline.com') || currentUrl.includes('/auth/sign-in')) {
        callRecord.push({ attemptN: attempt, durationMs: Date.now() - t0, outcome: 'fail' });
        recordRetryCall('validateState', callRecord);
        return false;
      }

      try {
        await page
          .getByRole('heading', { name: 'Dashboard', level: 1 })
          .waitFor({ state: 'visible', timeout: 30_000 });
        callRecord.push({ attemptN: attempt, durationMs: Date.now() - t0, outcome: 'pass' });
        recordRetryCall('validateState', callRecord);
        return true;
      } catch {
        callRecord.push({ attemptN: attempt, durationMs: Date.now() - t0, outcome: 'fail' });
        if (urlHostMatches(page.url(), 'login.microsoftonline.com') || page.url().toLowerCase().includes('/auth/sign-in')) {
          recordRetryCall('validateState', callRecord);
          return false;
        }
        if (attempt === MAX_TRIES) {
          recordRetryCall('validateState', callRecord);
          return false;
        }
      }
    } catch (err) {
      callRecord.push({ attemptN: attempt, durationMs: Date.now() - t0, outcome: 'fail' });
      if (attempt === MAX_TRIES) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[auth-storage] validateState attempt ${attempt} threw, giving up: ${msg}`);
        recordRetryCall('validateState', callRecord);
        return false;
      }
    }
  }
  recordRetryCall('validateState', callRecord);
  return false;
}

/**
 * Each caller keeps its own retry policy — this helper covers only the core SSO step
 * (context + goto + loginWithMicrosoft + Dashboard wait). On ANY failure, the helper
 * closes the context before the error propagates — callers do not need to close it themselves.
 */
export async function performSsoLogin(
  browser: Browser,
  baseUrl: string,
  config: IConfig,
  credentials: { username: string; password: string },
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'beforeunload') {
      try { await dialog.accept(); } catch { }
    }
  });
  try {
    await page.goto(baseUrl, { timeout: 78_000 });
    const loginPage = new LoginPage(page, config);
    const success = await loginPage.loginWithMicrosoft(
      credentials.username,
      credentials.password,
    );
    if (!success) {
      await ctx.close();
      throw new Error('loginWithMicrosoft returned false');
    }
    await page
      .getByRole('heading', { name: 'Dashboard', level: 1 })
      .waitFor({ state: 'visible', timeout: 60_000 });
    return { ctx, page };
  } catch (err) {
    // On any throw past newContext, propagate but DON'T leak the context — callers vary
    // (auth.setup retries with a fresh ctx, fixtures.ts treats it as terminal). Best-effort
    // close here; if the context is already closed, ignore.
    try { await ctx.close(); } catch { /* close errors are non-fatal — ctx is already being discarded */ }
    throw err;
  }
}
