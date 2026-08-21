import type { Page } from '@playwright/test';

export interface CspViolation {
  violatedDirective: string;
  blockedUri: string;
  sourceFile: string | null;
  lineNumber: number | null;
}

export interface CspTracker {
  violations: CspViolation[];
  consoleMessages: string[];
  pageErrors: string[];
}

/**
 * Attaches CSP-violation, console, and page-error listeners to `page` and
 * returns a live tracker object those listeners keep appending to.
 *
 * Must be called BEFORE `page.goto()` — the `securitypolicyviolation`
 * listener is installed via `addInitScript`, which only applies to
 * navigations that happen after this call.
 *
 * This formalizes the ad hoc diagnostic script written directly into
 * `.github/workflows/preview-deploy.yml` during the Phase 1 investigation
 * that found the original nonce/PPR hydration bug (mobile Chrome stuck on
 * a loading skeleton, every script CSP-blocked) — see SEC-30 in
 * docs/ai/general/SECURITY_CODING_PATTERNS.md. That CI-only script is
 * retired in favor of this reusable, permanently-testable version.
 */
export async function trackCspViolations(page: Page): Promise<CspTracker> {
  const tracker: CspTracker = {
    violations: [],
    consoleMessages: [],
    pageErrors: [],
  };

  page.on('console', (msg) => {
    tracker.consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    tracker.pageErrors.push(error.message);
  });

  await page.exposeFunction('__reportCspViolation', (detail: CspViolation) => {
    tracker.violations.push(detail);
  });

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      // window.__reportCspViolation is bound by exposeFunction() above —
      // not visible to this page-context script's own type checking.
      (
        window as unknown as {
          __reportCspViolation: (detail: CspViolation) => void;
        }
      ).__reportCspViolation({
        violatedDirective: event.violatedDirective,
        blockedUri: event.blockedURI,
        sourceFile: event.sourceFile || null,
        lineNumber: event.lineNumber || null,
      });
    });
  });

  return tracker;
}

/**
 * Reads every `<script>` element's live nonce via the `.nonce` IDL
 * property, NOT `getAttribute('nonce')`/`outerHTML`. Browsers deliberately
 * hide the `nonce` *content* attribute from reflection (getAttribute,
 * outerHTML, DOM serialization) once a script element is inserted into the
 * document — a spec-mandated anti-exfiltration measure so an unrelated
 * injected script can't read another script's nonce off the DOM. Only the
 * `.nonce` property (same-realm script access) still returns the real
 * value. Using `getAttribute` here would silently make every assertion
 * pass with `''` regardless of whether nonces actually match — a false
 * green, not a real check.
 */
export function readScriptNonces(page: Page): Promise<(string | null)[]> {
  return page.locator('script').evaluateAll((nodes) =>
    nodes.map((node) => {
      const script = node as HTMLScriptElement;
      return script.nonce || null;
    }),
  );
}

export interface ScriptDescriptor {
  nonce: string | null;
  src: string | null;
  type: string | null;
  id: string | null;
  textSnippet: string | null;
}

/**
 * CSP's script-src directive does not apply to non-executable script
 * block types — the browser never treats these as code, so they carry no
 * nonce and need none. A blanket "every <script> tag must have a matching
 * nonce" check would false-fail on legitimate JSON-LD structured data or
 * an import map.
 */
const NON_EXECUTABLE_SCRIPT_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'importmap',
  'speculationrules',
]);

export function isExecutableScript(descriptor: ScriptDescriptor): boolean {
  return (
    !descriptor.type ||
    !NON_EXECUTABLE_SCRIPT_TYPES.has(descriptor.type.toLowerCase())
  );
}

/**
 * Richer per-`<script>` diagnostic than readScriptNonces() — src/type/id/a
 * text snippet alongside the live nonce, so a nonce-mismatch test failure
 * names the actual offending element instead of just "null vs <nonce>".
 */
export function describeScripts(page: Page): Promise<ScriptDescriptor[]> {
  return page.locator('script').evaluateAll((nodes) =>
    nodes.map((node) => {
      const script = node as HTMLScriptElement;
      return {
        nonce: script.nonce || null,
        src: script.getAttribute('src'),
        type: script.getAttribute('type'),
        id: script.id || null,
        textSnippet: script.textContent
          ? script.textContent.slice(0, 80)
          : null,
      };
    }),
  );
}
