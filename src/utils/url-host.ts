// Host matching by parsed hostname, not substring: `.includes('login.microsoftonline.com')` also
// matches `login.microsoftonline.com.attacker.net` (CodeQL js/incomplete-url-substring-sanitization).

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

/** Only scheme-qualified URLs match; bare-host mentions stay the callers' keyword heuristics. */
export function textMentionsAuthUrl(text: string): boolean {
  return (text.match(/https?:\/\/[^\s'"]+/gi) ?? []).some(isAuthUrl);
}
