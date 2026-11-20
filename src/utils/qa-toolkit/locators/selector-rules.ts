/**
 * Rules for one selector string (CSS, XPath or Playwright selector engine syntax), and the user-facing locator to
 * use instead. Pure functions — no browser, no file access — so the self-test can check them directly.
 */
import type { Severity } from '../core/types';

export interface SelectorIssue {
  rule: string;
  severity: Severity;
  message: string;
}

const HTML_TAGS = new Set(['div', 'span', 'button', 'a', 'input', 'label', 'p', 'section', 'li', 'ul', 'img', 'svg', 'form',
  'select', 'textarea', 'h1', 'h2', 'h3', 'h4', 'main', 'header', 'footer', 'nav', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'option']);
/** Structural tags whose bare use is normal for lists and grids. */
const STRUCTURAL = new Set(['main', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'li', 'ul', 'option', 'form', 'header', 'nav', 'section', 'h1']);
/** A generated value used as an id (#…, id=, for=, aria-controls=…) — not a stable attribute NAME like data-radix-…. */
const GENERATED_ID = /(?:#|\b(?:id|for|aria-controls|aria-labelledby|aria-describedby)[\^$*]?=["']?)(?:radix-|:r[0-9a-z]+:|mui-\d|ember\d|react-select-\d|headlessui-|[\w-]*\d{5,}|[\w-]*[0-9a-f]{8,})/i;
const GENERATED_CLASS = /\.(css-[a-z0-9]{5,}|sc-[a-zA-Z]{5,}|jss\d+|makeStyles-[\w-]+-\d+|[\w-]+__[\w-]+___[\w-]{5})/;
/** Utility (styling) classes — they describe appearance, so a design change breaks the selector. */
const STYLE_CLASS = /^(text|bg|border|flex|grid|gap|p[xytrbl]?|m[xytrbl]?|w|h|min-w|max-w|min-h|max-h|rounded|shadow|font|items|justify|space-[xy]|overflow|opacity|z|top|left|right|bottom|inline|block|hidden|absolute|relative|fixed|sticky|truncate|cursor|leading|tracking|ring|outline)(-|$)/;

export function isXPath(selector: string): boolean {
  const s = selector.trim();
  return s.startsWith('xpath=') || s.startsWith('//') || s.startsWith('(//') || s.startsWith('./') || s.startsWith('/html');
}

/** Unbalanced brackets, parentheses or quotes — the selector cannot parse. Placeholders (${…}) are ignored. */
function syntaxProblem(selector: string): string | undefined {
  const s = selector.replace(/\$\{[^}]*\}/g, 'x');
  const pairs: Record<string, string> = { ')': '(', ']': '[' };
  const stack: string[] = [];
  let quote: string | undefined;
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = undefined; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') stack.push(ch);
    else if (ch === ')' || ch === ']') {
      if (stack.pop() !== pairs[ch]) return `unbalanced "${ch}"`;
    }
  }
  if (quote) return `unclosed ${quote} quote`;
  if (stack.length) return `unclosed "${stack[stack.length - 1]}"`;
  return undefined;
}

export function checkSelector(selector: string): SelectorIssue[] {
  const issues: SelectorIssue[] = [];
  const s = selector.trim();
  const add = (rule: string, severity: Severity, message: string): void => { issues.push({ rule, severity, message }); };

  const bad = syntaxProblem(s);
  if (bad) add('invalid-selector', 'High', `The selector does not parse: ${bad}.`);
  if (GENERATED_ID.test(s)) add('generated-id', 'High', 'Uses a framework-generated id that changes between builds or renders.');
  if (GENERATED_CLASS.test(s)) add('generated-class', 'High', 'Uses a generated (hashed) CSS class that changes between builds.');

  if (isXPath(s)) {
    const body = s.replace(/^xpath=/, '');
    // Climbing to a parent / ancestor row (xpath=.., ancestor::tr[1]) is a common, contained idiom.
    const axisOnly = /^(\.\.|(\.\/)?(ancestor|parent)::[\w*-]+(\[1\])?)$/.test(body);
    if (body.startsWith('/html') || body.startsWith('/body')) {
      add('absolute-xpath', 'High', 'Absolute XPath from the document root breaks on any layout change.');
    } else if (axisOnly) {
      add('xpath-locator', 'Low', `XPath only climbs to ${body === '..' ? 'the parent' : 'an ancestor'}; locator.filter({ has }) on the container reads better.`);
    } else {
      add('xpath-locator', 'Medium', 'XPath is hard to read and tied to the DOM structure.');
    }
    if (/\[\d+\]/.test(body) && !axisOnly) add('positional-xpath', 'Medium', 'XPath position index ([n]) depends on element order.');
    return issues;
  }

  if (/:nth-(child|of-type|last-child|match)\(|:first-child|:last-child/.test(s)) {
    add('positional-css', 'Medium', 'Positional CSS depends on element order, which changes when rows or fields are added.');
  }
  const classes = [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1] ?? '');
  const styling = classes.filter((c) => STYLE_CLASS.test(c));
  if (styling.length) add('style-class', 'Medium', `Relies on styling class(es) ${styling.map((c) => `.${c}`).join(', ')}.`);

  // Combinators outside brackets/parentheses: depth of the descendant chain.
  const flat = s.replace(/\([^()]*\)|\[[^\]]*\]|"[^"]*"|'[^']*'/g, '');
  const steps = flat.split(/\s*>\s*|\s+/).filter(Boolean).length;
  if (steps > 5) add('deep-chain', 'Medium', `${steps}-step descendant chain is tied to the page structure.`);

  // Generic only when every part is a plain tag name: an attribute, class, id or pseudo-class makes it specific.
  const parts = s.replace(/"[^"]*"|'[^']*'/g, '').split(/\s*[>+~]\s*|\s+|,/).filter(Boolean);
  const bareTags = parts.every((t) => /^[a-z][a-z0-9]*$/i.test(t)) ? parts : [];
  if (bareTags.length && bareTags.every((t) => HTML_TAGS.has(t.toLowerCase()))) {
    const structural = bareTags.every((t) => STRUCTURAL.has(t.toLowerCase()));
    add('generic-tag', structural ? 'Low' : 'Medium',
      structural ? `Table/list structure only (${s}); fine for rows, ambiguous for a single target.` : `Bare tag selector (${s}) matches many elements.`);
  }
  if (/:has-text\(|:text-is\(|:text\(|\btext=/.test(s) && !/\[data-testid/.test(s)) {
    add('text-coupled', 'Low', 'Matches on visible text inside CSS; a copy change or translation breaks it.');
  }
  if (s.includes('>>')) add('chained-engine', 'Low', 'Legacy ">>" chaining; chain locator() calls or use filter() instead.');
  return issues;
}

const quoted = (v: string): string => `'${v.replace(/'/g, "\\'")}'`;

/** The user-facing Playwright locator that expresses the same target, when it can be read off the selector. */
export function suggestLocator(selector: string): string | undefined {
  const s = selector;
  const testid = s.match(/\[data-testid=["']([^"'$]+)["']\]/);
  if (testid?.[1]) return `getByTestId(${quoted(testid[1])})`;
  const role = s.match(/\[role=["']([\w-]+)["']\]/)?.[1];
  const aria = s.match(/\[aria-label=["']([^"']+)["']\]/)?.[1];
  const text = s.match(/:(?:text-is|has-text|text)\(["']([^"']+)["']\)/)?.[1];
  const tag = s.match(/(?:^|\s)(button|a|input|h[1-6]|textarea|select)(?=[\s:[.#]|$)/)?.[1];
  const tagRole: Record<string, string> = { button: 'button', a: 'link', input: 'textbox', textarea: 'textbox', select: 'combobox',
    h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading' };
  const name = aria ?? text;
  const r = role ?? (tag ? tagRole[tag] : undefined);
  if (r) return `getByRole(${quoted(r)}${name ? `, { name: ${quoted(name)} }` : ''})`;
  if (aria) return `getByLabel(${quoted(aria)})`;
  const placeholder = s.match(/\[placeholder=["']([^"']+)["']\]/)?.[1];
  if (placeholder) return `getByPlaceholder(${quoted(placeholder)})`;
  const label = s.match(/label\[normalize-space\(text\(\)\)=["']([^"']+)["']\]/)?.[1] ?? s.match(/label[^"']*["']([^"']+)["']/)?.[1];
  if (label && isXPath(s)) return `getByLabel(${quoted(label)})`;
  if (text) return `getByText(${quoted(text)}, { exact: true })`;
  return undefined;
}

export const RECOMMEND: Record<string, string> = {
  'invalid-selector': 'Fix the selector syntax; Playwright throws when it resolves it.',
  'generated-id': 'Select by role, label or a data-testid instead of a generated id.',
  'generated-class': 'Select by role, label or a data-testid instead of a hashed class.',
  'absolute-xpath': 'Replace with a user-facing locator (getByRole / getByLabel) or a data-testid.',
  'xpath-locator': 'Prefer getByLabel / getByRole, or locator chaining with filter({ has }) over XPath axes.',
  'positional-xpath': 'Identify the element by its role, name or test id rather than its position.',
  'positional-css': 'Identify the element by its role, name or test id rather than its position.',
  'style-class': 'Use a semantic hook (role, aria-invalid, data-state, data-testid) — styling classes change with the design.',
  'deep-chain': 'Scope with a stable container (getByRole region / data-testid) and a short locator inside it.',
  'generic-tag': 'Scope the tag selector to a named container or filter it (filter({ hasText }) / getByRole with a name).',
  'text-coupled': 'Use getByRole(role, { name }) — it matches the accessible name and survives markup changes.',
  'chained-engine': 'Chain locator() calls or use filter() instead of ">>".',
  'positional-locator': 'Identify the element by name or test id; first()/last()/nth() hide a selector that matches several elements.',
  'unscoped-text': 'Scope getByText to a container, or use getByRole(role, { name }) for interactive elements.',
  'not-on-page': 'Expected if the element appears only after an action; otherwise the selector is stale — check it against the current DOM.',
  'ambiguous-live': 'Make the selector unique (role + name, test id, or scope to a container) if it targets a single element.',
  'unused-selector': 'Delete selectors nothing uses, so stale ones do not mislead the next person editing the page object.',
};
