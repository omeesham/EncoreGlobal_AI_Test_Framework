// Minimal TestRail REST API v2 client (Node 18+ global fetch, no deps).
// Auth: email + API key (TestRail -> My Settings -> API Keys); the instance must have the API enabled.

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

export interface TestRailProject {
  id: number;
  name: string;
}

export interface TestRailSection {
  id: number;
  name: string;
  parent_id: number | null;
  suite_id?: number;
}

export interface TestRailNamedRef {
  id: number;
  name: string;
}

export interface TestRailLabel {
  id: number;
  name: string; // TestRail's Labels API uses "name", not "title" (verified against a live get_labels response)
}

/** One row of a "Test Case (Steps)" template's custom_steps_separated field. */
export interface TestRailStep {
  content: string;
  expected?: string;
}

/** Payload for add_case — only the fields scripts/testrail-sync.ts populates;
 *  TestRail accepts (and ignores) any others per its own field configuration. */
export interface TestRailNewCase {
  title: string;
  template_id?: number;
  type_id?: number;
  priority_id?: number;
  custom_preconds?: string;
  custom_steps_separated?: TestRailStep[];
  labels?: number[];
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
        throw new Error(`TestRail ${method} ${uri} -> HTTP ${res.status}: ${text}`);
      }
      return (await res.json()) as T;
    }
  }

  /** All cases in a project (optionally one suite). Handles the paginated
   *  ({ cases: [...] }) and the legacy plain-array response shapes. */
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

  // ---- used by scripts/testrail-sync.ts (importing newly authored cases) ----

  /** Cheap read-only call used to confirm host/credentials/project id are valid. */
  getProject(projectId: number): Promise<TestRailProject> {
    return this.request('GET', `/api/v2/get_project/${projectId}`);
  }

  async getSections(projectId: number, suiteId?: number): Promise<TestRailSection[]> {
    const out: TestRailSection[] = [];
    const limit = 250;
    for (let offset = 0; ; offset += limit) {
      const suite = suiteId ? `&suite_id=${suiteId}` : '';
      const page = await this.request<{ sections: TestRailSection[] } | TestRailSection[]>(
        'GET',
        `/api/v2/get_sections/${projectId}${suite}&limit=${limit}&offset=${offset}`,
      );
      const sections = Array.isArray(page) ? page : page.sections;
      out.push(...sections);
      if (sections.length < limit) return out;
    }
  }

  addSection(
    projectId: number,
    payload: { name: string; suite_id?: number; parent_id?: number | null },
  ): Promise<TestRailSection> {
    return this.request('POST', `/api/v2/add_section/${projectId}`, payload);
  }

  getPriorities(): Promise<TestRailNamedRef[]> {
    return this.request('GET', '/api/v2/get_priorities');
  }

  getCaseTypes(): Promise<TestRailNamedRef[]> {
    return this.request('GET', '/api/v2/get_case_types');
  }

  getTemplates(projectId: number): Promise<TestRailNamedRef[]> {
    return this.request('GET', `/api/v2/get_templates/${projectId}`);
  }

  /** Returns null (rather than throwing) when the Labels feature isn't
   *  available on this TestRail instance/version — callers treat that as
   *  "skip labels", not a fatal error. */
  async getLabels(projectId: number): Promise<TestRailLabel[] | null> {
    try {
      const page = await this.request<{ labels: TestRailLabel[] } | TestRailLabel[]>(
        'GET',
        `/api/v2/get_labels/${projectId}`,
      );
      return Array.isArray(page) ? page : page.labels ?? [];
    } catch {
      return null;
    }
  }

  // Two quirks verified against a live instance: (1) the request body field is
  // "title" even though get_labels reads the same value back as "name" (HTTP 400
  // "Field :title is a required field" when sent as { name }); (2) the response
  // is wrapped as { label: {...} }, unlike get_labels' flat array items.
  async addLabel(projectId: number, name: string): Promise<TestRailLabel> {
    const { label } = await this.request<{ label: TestRailLabel }>(
      'POST',
      `/api/v2/add_label/${projectId}`,
      { title: name },
    );
    return label;
  }

  addCase(sectionId: number, payload: TestRailNewCase): Promise<TestRailCase> {
    return this.request('POST', `/api/v2/add_case/${sectionId}`, payload);
  }

  updateCase(caseId: number, payload: Partial<TestRailNewCase>): Promise<TestRailCase> {
    return this.request('POST', `/api/v2/update_case/${caseId}`, payload);
  }
}
