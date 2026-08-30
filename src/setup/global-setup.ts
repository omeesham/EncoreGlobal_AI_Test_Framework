import { FullConfig } from '@playwright/test';
import { Log } from '../utils/logger';
import { CredentialLoader } from '../utils/credential-loader';
import * as dotenvFlow from 'dotenv-flow';
import * as path from 'path';
import * as fs from 'fs';

interface PreflightResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
}

const PREFLIGHT_OUTPUT = path.join(process.cwd(), 'reports', 'preflight-check.json');

async function globalSetup(config: FullConfig) {
  // Local-first: bare `npm test` loads .env.local; CI sets CI_ENV=e2e to load .env.e2e.
  dotenvFlow.config({
    path: path.join(__dirname, '..', '..'),
    node_env: process.env.CI_ENV || process.env.NODE_ENV || 'local',
    silent: true,
  });

  // The .env.e2e file is CI-only; block any non-CI run that loaded it.
  if (process.env.CI_ENV === 'e2e' && !process.env.CI) {
    throw new Error(
      "[env-guard] '.env.e2e' is the CI config and must not be used locally.\n" +
      "Local runs use '.env.local' (same target server, different config).\n" +
      "Fix: run `npm test` without CI_ENV (it loads .env.local). See the README 'Quickstart' section to fill in .env.local.",
    );
  }

  Log.info('=== Global Test Setup Started ===');
  Log.info(`Workers: ${config.workers}`);
  Log.info(`Projects: ${config.projects?.length || 0}`);

  ensureReportDirectories();

  const results = await runPreflightChecks();
  writePreflightReport(results);

  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    for (const f of failures) {
      Log.error(`[ERR] Pre-flight FAIL: ${f.check} -- ${f.message}`);
    }
    throw new Error(`Pre-flight checks failed: ${failures.map(f => f.check).join(', ')}`);
  }

  const warnings = results.filter(r => r.status === 'WARN');
  for (const w of warnings) {
    Log.warn(`Pre-flight WARN: ${w.check} -- ${w.message}`);
  }

  // Age out diagnostic snapshots older than 7 days. Without this, the
  // reports/diagnostics/ folder grows unbounded on long-lived CI agents.
  cleanupDiagnosticFiles();

  Log.info('=== Global Test Setup Completed ===');
}

const REPORT_DIRS = [
  'reports/allure-results',
  'reports/html-report',
  'reports/test-results',
  'reports/diagnostics',
];

function ensureReportDirectories(): void {
  for (const dir of REPORT_DIRS) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      Log.info(`Created report directory: ${dir}`);
    }
  }
}

async function runPreflightChecks(): Promise<PreflightResult[]> {
  const results: PreflightResult[] = [];

  // Only BASE_URL is required: CI_ENV defaults to 'local' when unset, so a bare `npm test`
  // legitimately leaves it empty.
  for (const envVar of ['BASE_URL']) {
    const value = process.env[envVar];
    if (!value || value.trim() === '') {
      results.push({ check: `env:${envVar}`, status: 'FAIL', message: `Missing required env var: ${envVar}. Open .env.local and fill in the two blank values at the top. The README 'Quickstart' section has the steps.` });
    } else {
      results.push({ check: `env:${envVar}`, status: 'PASS', message: `${envVar}=${value}` });
    }
  }

  // redirect: 'manual' — the unauthenticated redirect to /auth/sign-in can end in a non-2xx,
  // and a 3xx alone already proves the server is up and routing.
  const baseUrl = process.env.BASE_URL;
  if (baseUrl) {
    try {
      const response = await fetch(baseUrl, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
      if (response.ok || [301, 302, 303, 307, 308].includes(response.status)) {
        results.push({ check: 'base_url_reachable', status: 'PASS', message: `HTTP ${response.status}` });
      } else {
        results.push({ check: 'base_url_reachable', status: 'FAIL', message: `Base URL unreachable: ${baseUrl} -- HTTP ${response.status}` });
      }
    } catch (error) {
      results.push({ check: 'base_url_reachable', status: 'FAIL', message: `Base URL unreachable: ${baseUrl} -- ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  // Check 3: OAuth endpoint reachable (WARN only -- may be blocked by network policy)
  try {
    const oauthUrl = 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration';
    const response = await fetch(oauthUrl, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
      results.push({ check: 'oauth_endpoint', status: 'PASS', message: 'OpenID configuration reachable' });
    } else {
      results.push({ check: 'oauth_endpoint', status: 'WARN', message: `OAuth endpoint returned HTTP ${response.status}` });
    }
  } catch (error) {
    results.push({ check: 'oauth_endpoint', status: 'WARN', message: `OAuth endpoint unreachable -- ${error instanceof Error ? error.message : String(error)}` });
  }

  try {
    await CredentialLoader.loadCredentials({ type: 'env' });
    results.push({ check: 'credentials', status: 'PASS', message: 'Credentials loaded from environment' });
  } catch (error) {
    results.push({ check: 'credentials', status: 'FAIL', message: `Credentials unavailable: ${error instanceof Error ? error.message : String(error)}. Add your username and password to .env.local — on a build server, add them to that server's secret store instead.` });
  }

  return results;
}

function writePreflightReport(results: PreflightResult[]): void {
  const reportsDir = path.dirname(PREFLIGHT_OUTPUT);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  fs.writeFileSync(PREFLIGHT_OUTPUT, JSON.stringify({ timestamp: new Date().toISOString(), checks: results }, null, 2) + '\n', 'utf-8');
}

function cleanupDiagnosticFiles(): void {
  const diagDir = path.join(process.cwd(), 'reports', 'diagnostics');
  if (!fs.existsSync(diagDir)) return;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  try {
    for (const file of fs.readdirSync(diagDir)) {
      const filePath = path.join(diagDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch { /* deletion failure is non-fatal — stale diag files do not block test setup */ }
}

export default globalSetup;
