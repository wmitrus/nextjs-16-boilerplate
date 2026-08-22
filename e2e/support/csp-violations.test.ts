import { describe, expect, it } from 'vitest';

import { isExecutableScript, type ScriptDescriptor } from './csp-violations';

/**
 * Unit coverage for `isExecutableScript()` -- previously only exercised
 * indirectly via `e2e/csp-nonce-dynamic.spec.ts` (a real-browser
 * Playwright spec, opt-in and not part of the default suite). Proves the
 * classification logic directly: CSP's script-src directive does not
 * apply to genuinely non-executable script block types (JSON-LD, import
 * maps), so a blanket "every <script> needs a matching nonce" check would
 * false-fail on those -- but `speculationrules` IS governed by
 * script-src (confirmed against MDN/the WICG spec, SEC-32) and must NOT
 * be excluded, unlike an earlier version of both this file and
 * csp-violations.ts.
 */
function scriptDescriptor(
  overrides: Partial<ScriptDescriptor> = {},
): ScriptDescriptor {
  return {
    nonce: null,
    src: null,
    type: null,
    id: null,
    textSnippet: null,
    ...overrides,
  };
}

describe('isExecutableScript', () => {
  it('treats a script with no type attribute as executable', () => {
    expect(isExecutableScript(scriptDescriptor({ type: null }))).toBe(true);
  });

  it('treats an explicit text/javascript type as executable', () => {
    expect(
      isExecutableScript(scriptDescriptor({ type: 'text/javascript' })),
    ).toBe(true);
  });

  it('treats a module script as executable', () => {
    expect(isExecutableScript(scriptDescriptor({ type: 'module' }))).toBe(true);
  });

  it('treats a speculationrules block as executable -- script-src DOES govern it', () => {
    // <script type="speculationrules"> requires an explicit
    // 'inline-speculation-rules' source expression, a nonce, or a hash --
    // it is not even covered by 'unsafe-inline'. Excluding it here would
    // silently stop checking its nonce (SEC-32).
    expect(
      isExecutableScript(scriptDescriptor({ type: 'speculationrules' })),
    ).toBe(true);
  });

  it('excludes an application/json block', () => {
    expect(
      isExecutableScript(scriptDescriptor({ type: 'application/json' })),
    ).toBe(false);
  });

  it('excludes an application/ld+json block', () => {
    expect(
      isExecutableScript(scriptDescriptor({ type: 'application/ld+json' })),
    ).toBe(false);
  });

  it('excludes an importmap block', () => {
    expect(isExecutableScript(scriptDescriptor({ type: 'importmap' }))).toBe(
      false,
    );
  });

  it('is case-insensitive on the type attribute', () => {
    expect(
      isExecutableScript(scriptDescriptor({ type: 'SPECULATIONRULES' })),
    ).toBe(true);
    expect(
      isExecutableScript(scriptDescriptor({ type: 'Application/Ld+Json' })),
    ).toBe(false);
  });
});
