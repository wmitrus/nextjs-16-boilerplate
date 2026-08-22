import { describe, expect, it } from 'vitest';

import { isExecutableScript, type ScriptDescriptor } from './csp-violations';

/**
 * Unit coverage for `isExecutableScript()` -- previously only exercised
 * indirectly via `e2e/csp-nonce-dynamic.spec.ts` (a real-browser
 * Playwright spec, opt-in and not part of the default suite). This proves
 * the classification logic itself directly, including the
 * `speculationrules` case A.8.4 specifically asked for: CSP's script-src
 * directive does not apply to non-executable script block types, so a
 * blanket "every <script> needs a matching nonce" check would false-fail
 * on a legitimate speculationrules/JSON-LD/import-map block.
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

  it('excludes a speculationrules block', () => {
    expect(
      isExecutableScript(scriptDescriptor({ type: 'speculationrules' })),
    ).toBe(false);
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
    ).toBe(false);
    expect(
      isExecutableScript(scriptDescriptor({ type: 'Application/Ld+Json' })),
    ).toBe(false);
  });
});
