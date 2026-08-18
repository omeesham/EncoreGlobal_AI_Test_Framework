// Minimal TestRail REST API v2 client (Node 18+ global fetch, no deps).
// Auth: email + API key (TestRail → My Settings → API Keys). The instance
// must have the API enabled (Administration → Site Settings → API).

export interface TestRailCase {
  id: number;
  title: string;
}

export interface TestRailResult {
  case_id: number;
  status_id: number; // 1 passed · 2 blocked · 4 retest · 5 failed
  comment?: string;
  elapsed?: string; // e.g. "12s"
}

export class TestRailClient {
  private readonly base: string;
  private readonly auth: string;

  constructor(host: string, username: string, apiKey: string) {
    this.base = host.replace(/\/+$/, '').replace(/\/index\.php\??$/, '');
    this.auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
  }

  private async request<T>(method: 'GET' | 'POST', uri: string, body?: unknown): Promise<T> {
    // TestRail's URI style is index.php?/api/v2/<method>&<params>
    const url = `${this.base}/index.php?${uri}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.auth}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < 3) {
        const wait = Number(res.headers.get('retry-after') ?? '5');
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        throw new Error(`TestRail ${method} ${uri} → HTTP ${res.status}: ${text}`);
      }
      return (await res.json()) as T;
    }
  }

  /** All cases in a project (optionally one suite). Handles both the modern
   *  paginated shape ({ cases: [...] }) and the legacy plain-array shape. */
  async getCases(projectId: number, suiteId?: number): Promise<TestRailCase[]> {
    const out: TestRailCase[] = [];
    const limit = 250;
    for (let offset = 0; ; offset += limit) {
      const suite = suiteId ? `&suite_id=${suiteId}` : '';
      const page = await this.request<{ cases: TestRailCase[] } | TestRailCase[]>(
        'GET',
        `/api/v2/get_cases/${projectId}${suite}&limit=${limit}&offset=${offset}`,
      );
      const cases = Array.isArray(page) ? page : page.cases;
      out.push(...cases);
      if (cases.length < limit) return out;
    }
  }

  async addRun(
    projectId: number,
    payload: {
      name: string;
      suite_id?: number;
      milestone_id?: number;
      include_all: boolean;
      case_ids?: number[];
      description?: string;
    },
  ): Promise<{ id: number }> {
    return this.request('POST', `/api/v2/add_run/${projectId}`, payload);
  }

  async addResultsForCases(runId: number, results: TestRailResult[]): Promise<unknown> {
    return this.request('POST', `/api/v2/add_results_for_cases/${runId}`, { results });
  }

  async closeRun(runId: number): Promise<unknown> {
    return this.request('POST', `/api/v2/close_run/${runId}`, {});
  }

  runUrl(runId: number): string {
    return `${this.base}/index.php?/runs/view/${runId}`;
  }
}
