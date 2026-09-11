export enum FailureCategory {
  AUTH = 'AUTH',
  NETWORK = 'NETWORK',
  SELECTOR = 'SELECTOR',
  TIMING = 'TIMING',
  APPLICATION = 'APPLICATION',
  DATA = 'DATA',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  UNKNOWN = 'UNKNOWN',
}

export interface NetworkFailure {
  url: string;
  status: number;
  statusText: string;
  body: string;
  timestamp: number;
}

export interface ConsoleEntry {
  type: string;
  text: string;
  location: string;
  timestamp: number;
}

export interface AuthChainEntry {
  url: string;
  status: number;
  redirectedFrom: string | null;
  timestamp: number;
}

export interface UrlBreadcrumb {
  url: string;
  timestamp: number;
}

export interface DiagnosticSnapshot {
  consoleErrors: ConsoleEntry[];
  networkFailures: NetworkFailure[];
  pageErrors: string[];
  urlHistory: string[];
  urlBreadcrumbs: UrlBreadcrumb[];
  authChain: AuthChainEntry[];
  domSnippet?: string;
  harEntries?: HarEntry[];
  domState?: string;
}

export interface HarEntry {
  url: string;
  method: string;
  status: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  timestamp: number;
  duration: number;
}
