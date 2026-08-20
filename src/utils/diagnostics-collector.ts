import type { Page } from '@playwright/test';
import type {
  NetworkFailure,
  ConsoleEntry,
  AuthChainEntry,
  UrlBreadcrumb,
  DiagnosticSnapshot,
  HarEntry,
} from '../types/diagnostics';
import { isAuthUrl } from './url-host';

const MAX_BODY_LENGTH = 2048;

export class DiagnosticsCollector {
  private readonly page: Page;
  private consoleEntries: ConsoleEntry[] = [];
  private networkFailures: NetworkFailure[] = [];
  private pageErrors: string[] = [];
  private urlHistory: string[] = [];
  private urlBreadcrumbs: UrlBreadcrumb[] = [];
  private authChain: AuthChainEntry[] = [];
  private allResponses: HarEntry[] = [];

  constructor(page: Page) {
    this.page = page;
    this.attachListeners();
  }

  private attachListeners(): void {
    this.page.on('console', (msg) => {
      try {
        this.consoleEntries.push({
          type: msg.type(),
          text: msg.text(),
          location: msg.location() ? `${msg.location().url}:${msg.location().lineNumber}` : '',
          timestamp: Date.now(),
        });
      } catch { }
    });

    this.page.on('pageerror', (error) => {
      try {
        this.pageErrors.push(error.message || String(error));
      } catch { }
    });

    this.page.on('response', async (response) => {
      try {
        const status = response.status();
        const url = response.url();
        if (isAuthUrl(url) || url.includes('oauth')) {
          this.authChain.push({
            url,
            status,
            redirectedFrom: response.request().redirectedFrom()?.url() ?? null,
            timestamp: Date.now(),
          });
        }
        try {
          const req = response.request();
          this.allResponses.push({
            url,
            method: req.method(),
            status,
            timestamp: Date.now(),
            duration: 0,
          });
        } catch { }
        if (status >= 400) {
          let body = '';
          try {
            body = (await response.text()).substring(0, MAX_BODY_LENGTH);
          } catch { }
          this.networkFailures.push({
            url,
            status,
            statusText: response.statusText(),
            body,
            timestamp: Date.now(),
          });
        }
      } catch { }
    });

    this.page.on('requestfailed', (request) => {
      try {
        const failure = request.failure();
        this.networkFailures.push({
          url: request.url(),
          status: 0,
          statusText: failure?.errorText ?? 'Request failed',
          body: '',
          timestamp: Date.now(),
        });
      } catch { }
    });

    this.page.on('framenavigated', (frame) => {
      try {
        if (frame === this.page.mainFrame()) {
          this.urlBreadcrumbs.push({ url: frame.url(), timestamp: Date.now() });
        }
      } catch { }
    });
  }

  recordUrl(): void {
    try {
      this.urlHistory.push(this.page.url());
    } catch { }
  }

  getNetworkFailures(): NetworkFailure[] {
    return this.networkFailures;
  }

  getConsoleErrors(): ConsoleEntry[] {
    return this.consoleEntries.filter(e => e.type === 'error' || e.type === 'warning');
  }

  getUrlBreadcrumbs(): UrlBreadcrumb[] {
    return [...this.urlBreadcrumbs];
  }

  getAuthChain(): AuthChainEntry[] {
    return this.authChain;
  }

  captureHar(): HarEntry[] {
    const maxSize = parseInt(process.env.HAR_MAX_SIZE ?? '1048576', 10);
    const failedIndices: number[] = [];
    for (let i = 0; i < this.allResponses.length; i++) {
      const resp = this.allResponses[i];
      if (resp && resp.status >= 400) {
        failedIndices.push(i);
      }
    }
    if (failedIndices.length === 0) return [];
    const includeIndices = new Set<number>();
    for (const idx of failedIndices) {
      for (let j = Math.max(0, idx - 5); j <= Math.min(this.allResponses.length - 1, idx + 5); j++) {
        includeIndices.add(j);
      }
    }
    const entries: HarEntry[] = [];
    let totalSize = 0;
    for (const idx of Array.from(includeIndices).sort((a, b) => a - b)) {
      const entry = this.allResponses[idx];
      if (!entry) continue;
      const entrySize = JSON.stringify(entry).length;
      if (totalSize + entrySize > maxSize) break;
      entries.push(entry);
      totalSize += entrySize;
    }
    return entries;
  }

  async captureDomState(): Promise<string> {
    try {
      const dom = await this.page.evaluate(() => document.documentElement.outerHTML);
      return (dom ?? '').substring(0, 51_200);
    } catch {
      return '';
    }
  }

  getNetworkErrorSummary(): string {
    const errors = this.networkFailures.filter(n => n.status >= 400);
    if (errors.length === 0) return 'No API errors';
    return errors.map(e => `${e.status} ${e.url.split('/').pop()}: ${e.body.substring(0, 200)}`).join('\n');
  }

  getSnapshot(): DiagnosticSnapshot {
    return {
      consoleErrors: this.getConsoleErrors(),
      networkFailures: [...this.networkFailures],
      pageErrors: [...this.pageErrors],
      urlHistory: [...this.urlHistory],
      urlBreadcrumbs: this.getUrlBreadcrumbs(),
      authChain: [...this.authChain],
    };
  }

  async generateErrorContext(testName: string, failingSelector?: string | null): Promise<string> {
    try {
      const analysis = await this.page.evaluate((selector) => {
        const dialogs = document.querySelectorAll('[role="alertdialog"], [role="dialog"]');
        const overlays = document.querySelectorAll('[data-radix-popper-content-wrapper], [data-state="open"][role="dialog"]');
        const alerts = document.querySelectorAll('[role="alert"]');
        const invalidFields = Array.from(document.querySelectorAll('[aria-invalid="true"]')).map(el => {
          return el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.tagName;
        });
        const disabledButtons = Array.from(document.querySelectorAll('button[disabled]')).map(el =>
          el.getAttribute('data-testid') || el.textContent?.trim().slice(0, 40) || 'unknown'
        );
        let selectorFound: { exists: boolean; visible: boolean; disabled: boolean } | null = null;
        if (selector) {
          const el = document.querySelector(`[data-testid="${selector}"]`);
          if (el) {
            const rect = el.getBoundingClientRect();
            selectorFound = {
              exists: true,
              visible: rect.width > 0 && rect.height > 0,
              disabled: el.hasAttribute('disabled'),
            };
          } else {
            selectorFound = { exists: false, visible: false, disabled: false };
          }
        }
        return {
          url: location.href,
          title: document.title,
          dialogCount: dialogs.length,
          overlayCount: overlays.length,
          alertCount: alerts.length,
          invalidFields,
          disabledButtons,
          selectorFound,
          domSnippet: document.documentElement.outerHTML.slice(0, 20_480),
        };
      }, failingSelector).catch(() => null);

      if (!analysis) return `# Error Context: ${testName}\n\nPage unavailable at capture time.\n`;

      const lines: string[] = [
        `# Error Context: ${testName}`,
        '',
        '## Page State',
        `- URL: ${analysis.url}`,
        `- Title: ${analysis.title}`,
        '',
        '## Blocking Elements',
        `- Dialogs: ${analysis.dialogCount}`,
        `- Overlays: ${analysis.overlayCount}`,
        `- Alerts: ${analysis.alertCount}`,
      ];

      if (failingSelector && analysis.selectorFound) {
        lines.push('', `## Selector: ${failingSelector}`);
        lines.push(`- In DOM: ${analysis.selectorFound.exists ? 'YES' : 'NO'}`);
        if (analysis.selectorFound.exists) {
          lines.push(`- Visible: ${analysis.selectorFound.visible ? 'YES' : 'NO'}`);
          lines.push(`- Disabled: ${analysis.selectorFound.disabled ? 'YES' : 'NO'}`);
        }
      }

      if (analysis.invalidFields.length > 0) {
        lines.push('', '## Invalid Fields', ...analysis.invalidFields.map(f => `- ${f}`));
      }
      if (analysis.disabledButtons.length > 0) {
        lines.push('', '## Disabled Buttons', ...analysis.disabledButtons.map(b => `- ${b}`));
      }

      lines.push('', '## DOM Snapshot', '```html', analysis.domSnippet, '```');
      return lines.join('\n');
    } catch {
      return `# Error Context: ${testName}\n\nCapture failed — page may be closed.\n`;
    }
  }
}

export function attachDiagnostics(page: Page): DiagnosticsCollector {
  const collector = new DiagnosticsCollector(page);
  (page as any).__diagnosticsCollector = collector;
  return collector;
}
