import { test } from '@playwright/test';
import labelData from './label-jargon.json';

type LabelData = {
  jargonMap: Record<string, string>;
  deniedJargon: string[];
  handLabels: Record<string, Record<string, string>>;
};

const { jargonMap, handLabels } = labelData as LabelData;

function splitCamel(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

export function camelToLabel(methodName: string): string {
  const out: string[] = [];
  for (const word of splitCamel(methodName)) {
    const mapped: string | undefined = jargonMap[word.toLowerCase()];
    if (mapped === undefined) {
      out.push(word.toLowerCase());
    } else if (mapped !== '') {
      out.push(mapped);
    }
  }
  const label = out.join(' ').replace(/\s+/g, ' ').trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function resolveLabel(className: string, methodName: string): string {
  const perClass = handLabels[className];
  const hand = perClass ? perClass[methodName] : undefined;
  return hand !== undefined && hand !== '' ? hand : camelToLabel(methodName);
}

/**
 * `test.info()` throws synchronously outside a running test (e.g. a worker-scoped auth
 * refresh), so it is a safe pre-check BEFORE calling test.step (which would reject rather
 * than throw). Body errors are NEVER caught here — assertion failures propagate normally.
 */
async function safeStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let hasContext = false;
  try {
    test.info();
    hasContext = true;
  } catch {
    hasContext = false;
  }
  if (!hasContext) {
    return fn();
  }
  return test.step(label, fn);
}

export interface WrapOptions {
  exclude?: string[];
}

export function wrapWithSteps<T extends object>(
  instance: T,
  className: string,
  options: WrapOptions = {},
): T {
  if (options.exclude?.includes(className)) {
    return instance;
  }
  const handler: ProxyHandler<T> = {
    get(target, prop, receiver): unknown {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      if (value.constructor.name !== 'AsyncFunction') {
        return value.bind(target);
      }
      // `.apply(target, ...)` (raw target, not the proxy) means internal this.otherMethod()
      // calls are not re-intercepted, so the report shows no confusing nested duplicate steps.
      const label = resolveLabel(className, String(prop));
      return (...args: unknown[]): Promise<unknown> =>
        safeStep(label, () => value.apply(target, args) as Promise<unknown>);
    },
  };
  return new Proxy(instance, handler);
}
