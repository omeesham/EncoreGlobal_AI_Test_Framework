const MCP_SESSION_DATE_FIELD_RE = /^(?:\*\*)?MCP_Session_Date(?:\*\*)?\s*:\s*([^\r\n]*)\s*$/im;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

export function parseMcpSessionDateField(text) {
  const match = String(text || '').match(MCP_SESSION_DATE_FIELD_RE);
  if (!match) return { status: 'missing', sessionDate: '', rawValue: '' };

  const rawValue = match[1].trim().replace(/^`([^`]+)`$/, '$1').trim();
  if (!isRealIsoDate(rawValue)) {
    return { status: 'unreadable', sessionDate: '', rawValue };
  }

  return { status: 'parsed', sessionDate: rawValue, rawValue };
}
