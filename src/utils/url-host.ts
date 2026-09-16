/**
 * URL host-matching helpers — defends against incomplete URL substring checks
 * (CodeQL js/incomplete-url-substring-sanitization).
 *
 * `someUrl.includes('login.microsoftonline.com')` returns true for
 * `login.microsoftonline.com.attacker.net` and for the host appearing in a
 * query string. Parse the host and compare exact-or-subdomain instead.
 *
 * Path/keyword heuristics that carry NO host (e.g. 'oauth', '/auth/sign-in',
 * 'error=OAuth', '401') are NOT a substring-sanitization concern and stay as
 * plain `.includes()` checks at the call sites.
 */

export const AUTH_HOSTS = ['login.microsoftonline.com', 'b2clogin.com'] as const;

export function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function urlHostMatches(rawUrl: string, host: string): boolean {
  const h = hostnameOf(rawUrl);
  const t = host.toLowerCase();
  return h !== '' && (h === t || h.endsWith(`.${t}`));
}

export function isAuthUrl(rawUrl: string): boolean {
  return AUTH_HOSTS.some((h) => urlHostMatches(rawUrl, h));
}

/**
 * Bare-host mentions without a scheme are intentionally not matched here — callers
 * keep their keyword heuristics ('oauth', '401', …) for that case.
 */
export function textMentionsAuthUrl(text: string): boolean {
  return (text.match(/https?:\/\/[^\s'"]+/gi) ?? []).some(isAuthUrl);
}
