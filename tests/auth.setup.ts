// Runs once before every test project; writes .auth/encore-state.json, which workers then read
// only. The file lock keeps parallel workers from racing into simultaneous fresh logins.

import { test as setup, expect } from '@playwright/test';
import { CommonMethods } from '../src/utils/env-config';
import { CredentialLoader } from '../src/utils/credential-loader';
import { recordCall as recordRetryCall, type AttemptRecord } from '../src/utils/retry-telemetry';
import {
  STATE_PATH,
  acquireLock,
  performSsoLogin,
  readStateOrNull,
  validateState,
  writeStateAtomic,
} from '../src/utils/auth-storage';

setup('acquire shared auth state', async ({ browser }) => {
  setup.setTimeout(300_000);

  const baseUrl = process.env.BASE_URL || 'https://cloudapps-e2e.encoreglobal.com/navigator/';

  // Fast path: existing state passes validation -> reuse
  if (readStateOrNull()) {
    const ctx = await browser.newContext({ storageState: STATE_PATH });
    const page = await ctx.newPage();
    const ok = await validateState(page, baseUrl);
    await ctx.close();
    if (ok) {
      console.log('[auth.setup] existing state valid -> reuse');
      return;
    }
    console.log('[auth.setup] existing state stale -> refresh under lock');
  } else {
    console.log('[auth.setup] no state file -> fresh login under lock');
  }

  // Slow path: acquire lock, re-check (another process may have refreshed while we waited)
  const release = await acquireLock();
  try {
    if (readStateOrNull()) {
      const ctx = await browser.newContext({ storageState: STATE_PATH });
      const page = await ctx.newPage();
      const ok = await validateState(page, baseUrl);
      await ctx.close();
      if (ok) {
        console.log('[auth.setup] state refreshed by peer while waiting -> reuse');
        return;
      }
    }

    // Retries cover transient MS sign-in bursts, and run inside the file lock so peer workers
    // wait on the lock rather than on a half-success.
    const credentials = await CredentialLoader.loadCredentials({ type: 'env' });
    const config = CommonMethods.initProp();

    const MAX_ATTEMPTS = 3;
    let savedCtx: import('@playwright/test').BrowserContext | null = null;
    let lastErr: unknown = null;
    const callRecord: AttemptRecord[] = [];

    // The 3-attempt retry + telemetry + per-attempt logging stay here;
    // SSO core (newContext + goto + loginWithMicrosoft + Dashboard wait) is shared via performSsoLogin.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const t0 = Date.now();
      try {
        const { ctx } = await performSsoLogin(browser, baseUrl, config, credentials);
        savedCtx = ctx;
        callRecord.push({ attemptN: attempt, durationMs: Date.now() - t0, outcome: 'pass' });
        console.log(`[auth.setup] login succeeded on attempt ${attempt}/${MAX_ATTEMPTS}`);
        break;
      } catch (err) {
        lastErr = err;
        callRecord.push({ attemptN: attempt, durationMs: Date.now() - t0, outcome: 'fail' });
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[auth.setup] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
        // performSsoLogin closes its own context on throw — no manual close needed here.
        if (attempt < MAX_ATTEMPTS) {
          // Brief wait between attempts to let MS-side transient settle
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
    }

    recordRetryCall('login', callRecord);

    if (!savedCtx) {
      throw new Error(
        `[auth.setup] SSO login failed after ${MAX_ATTEMPTS} attempts: ${
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        }`,
      );
    }

    await writeStateAtomic(savedCtx);
    console.log(`[auth.setup] state saved -> ${STATE_PATH}`);

    await savedCtx.close();

    // Validate the file, not a fresh browser context: storageState omits sessionStorage and
    // in-memory MSAL tokens, so a probe context hangs in skeleton-loading even on good state.
    const saved = readStateOrNull();
    const cookies = (saved?.cookies ?? []) as Array<{ name: string; expires?: number }>;
    const sessionToken = cookies.find((c) => c.name.includes('next-auth.session-token'));
    const csrfToken = cookies.find((c) => c.name.includes('next-auth.csrf-token'));
    const nowSec = Date.now() / 1000;
    const sessionValid = !!sessionToken && (sessionToken.expires === undefined || sessionToken.expires < 0 || sessionToken.expires > nowSec);
    const fileValid = !!sessionToken && !!csrfToken && sessionValid;
    expect(fileValid, 'saved state must contain unexpired next-auth session + csrf cookies').toBe(true);
    console.log('[auth.setup] state file validates -> session+csrf cookies present, not expired');
  } finally {
    await release();
  }
});
