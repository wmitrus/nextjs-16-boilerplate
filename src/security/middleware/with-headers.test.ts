/** @vitest-environment node */
import { NextResponse } from 'next/server';
import { describe, it, expect, beforeEach } from 'vitest';

import { withHeaders } from './with-headers';

import {
  createMockRequest,
  mockEnv,
  resetAllInfrastructureMocks,
} from '@/testing';

// Initialize environment mock
import '@/testing/infrastructure/env';

describe('Headers Middleware', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockEnv.NODE_ENV = 'production';
    mockEnv.VERCEL_ENV = 'production';
    mockEnv.NEXT_PUBLIC_CSP_SCRIPT_EXTRA = '';
    mockEnv.NEXT_PUBLIC_CSP_CONNECT_EXTRA = '';
    mockEnv.NEXT_PUBLIC_CSP_FRAME_EXTRA = '';
    mockEnv.NEXT_PUBLIC_CSP_IMG_EXTRA = '';
    mockEnv.NEXT_PUBLIC_CSP_STYLE_EXTRA = '';
    mockEnv.NEXT_PUBLIC_CSP_FONT_EXTRA = '';
  });

  it('should set basic security headers', () => {
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);

    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('should not set the deprecated X-XSS-Protection header', () => {
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    expect(res.headers.get('X-XSS-Protection')).toBeNull();
  });

  it('should set cross-origin isolation headers', () => {
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);

    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe(
      'same-origin-allow-popups',
    );
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(res.headers.get('X-Permitted-Cross-Domain-Policies')).toBe('none');
    expect(res.headers.get('Origin-Agent-Cluster')).toBe('?1');
  });

  it('should set HSTS in production', () => {
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    expect(res.headers.get('Strict-Transport-Security')).toBeDefined();
  });

  it('should set Content-Security-Policy', () => {
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).toContain('https://challenges.cloudflare.com');
  });

  it('should set baseline CSP hardening directives', () => {
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    // SEC-32: free additional hardening -- blocks inline event-handler
    // attributes (onclick=, etc.) regardless of CSP_SCRIPT_MODE, even when
    // script-src itself still carries 'unsafe-inline' in cache-compatible
    // mode.
    expect(csp).toContain("script-src-attr 'none'");
  });

  it('should not include upgrade-insecure-requests outside Vercel production', () => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.VERCEL_ENV = undefined;
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('should not set HSTS in development', () => {
    mockEnv.NODE_ENV = 'development';
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('should include preview-specific CSP rules', () => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.VERCEL_ENV = 'preview';
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain('https://vercel.live');
    expect(csp).toContain('https://*.clerk.accounts.dev');
    expect(csp).toContain('wss://*.clerk.accounts.dev');
  });

  it('should include development-specific CSP rules', () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.VERCEL_ENV = 'development';
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain('https://*.clerk.accounts.dev');
    expect(csp).toContain('wss://*.clerk.accounts.dev');
  });

  it('should include extra domains from environment', () => {
    mockEnv.NEXT_PUBLIC_CSP_SCRIPT_EXTRA = 'https://extra.com';
    const req = createMockRequest();
    const res = NextResponse.next();
    withHeaders(req, res);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain('https://extra.com');
  });

  describe('parseExtra() (via the *_CSP_*_EXTRA env vars)', () => {
    it('splits comma- and space-separated tokens alike', () => {
      mockEnv.NEXT_PUBLIC_CSP_SCRIPT_EXTRA =
        'https://a.example.com, https://b.example.com https://c.example.com';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain('https://a.example.com');
      expect(csp).toContain('https://b.example.com');
      expect(csp).toContain('https://c.example.com');
    });

    it('strips wrapping quotes from a token', () => {
      mockEnv.NEXT_PUBLIC_CSP_CONNECT_EXTRA = '"https://quoted.example.com"';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const csp = res.headers.get('Content-Security-Policy');
      // Confirms the quotes were stripped, not carried into the directive
      // value verbatim (which would produce an invalid CSP source).
      expect(csp).toContain('https://quoted.example.com');
      expect(csp).not.toContain('"https://quoted.example.com"');
    });

    it('produces no stray tokens for an empty extra value', () => {
      mockEnv.NEXT_PUBLIC_CSP_SCRIPT_EXTRA = '';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const csp = res.headers.get('Content-Security-Policy');
      const scriptSrc = csp
        ?.split('; ')
        .find((entry) => entry.startsWith('script-src '));
      // No double spaces / empty tokens from an unset extra value.
      expect(scriptSrc).not.toContain('  ');
      expect(scriptSrc?.trim()).toBe(scriptSrc);
    });

    it('SEC-32: does not let a semicolon in an extra value inject a directive that overrides object-src none', () => {
      // A naive split-and-join implementation carries a literal ";" straight
      // through into the header, letting a config typo (or a malicious
      // config value) inject a whole extra directive -- and because CSP
      // uses only the FIRST occurrence of a duplicate directive, an
      // injected "object-src *" here would silently win over this file's
      // own object-src 'none' baseline hardening directive.
      mockEnv.NEXT_PUBLIC_CSP_SCRIPT_EXTRA =
        'https://cdn.example.com; object-src *';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const csp = res.headers.get('Content-Security-Policy')!;

      // No literal ";" survived from the config value -- only the "; "
      // directive separators this file itself joins with remain, so no
      // new directive was injected by the config.
      const directives = csp.split('; ');
      expect(directives.every((entry) => !entry.includes(';'))).toBe(true);
      const objectSrcDirectives = directives.filter((entry) =>
        entry.startsWith('object-src '),
      );
      expect(objectSrcDirectives).toEqual(["object-src 'none'"]);
      // The wildcard from the injection attempt never got through as a
      // source expression on its own either.
      expect(csp).not.toContain(' * ');
      // The whole malformed token is dropped, not partially recovered --
      // "https://cdn.example.com;" (semicolon glued on, no separating
      // whitespace) is rejected as one token rather than the parser
      // trying to salvage the part before the ";", which would add
      // complexity and risk getting the split wrong.
      expect(csp).not.toContain('https://cdn.example.com');
    });

    it('SEC-32: with the ";" as its own whitespace-separated token, still rejects the injected directive but keeps the legitimate host', () => {
      mockEnv.NEXT_PUBLIC_CSP_SCRIPT_EXTRA =
        'https://cdn.example.com ; object-src *';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const csp = res.headers.get('Content-Security-Policy')!;

      const directives = csp.split('; ');
      expect(directives.every((entry) => !entry.includes(';'))).toBe(true);
      expect(
        directives.filter((entry) => entry.startsWith('object-src ')),
      ).toEqual(["object-src 'none'"]);
      expect(csp).not.toContain(' * ');
      // Here the host is a genuinely separate token (whitespace before the
      // lone ";"), so it's still accepted on its own merits.
      expect(csp).toContain('https://cdn.example.com');
    });

    it('SEC-32: rejects dangerous CSP keyword tokens even when quoted or bare', () => {
      mockEnv.NEXT_PUBLIC_CSP_SCRIPT_EXTRA =
        "'unsafe-inline' unsafe-eval 'nonce-abc' strict-dynamic https://cdn.example.com";
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const scriptSrc = res.headers
        .get('Content-Security-Policy')!
        .split('; ')
        .find((entry) => entry.startsWith('script-src '))!;

      expect(scriptSrc).not.toContain("'nonce-abc'");
      expect(scriptSrc).not.toContain('strict-dynamic');
      // The legitimate host survives even though the same value carried
      // several rejected tokens.
      expect(scriptSrc).toContain('https://cdn.example.com');
    });

    it("SEC-32: accepts the 'self' and 'none' keyword sources", () => {
      mockEnv.NEXT_PUBLIC_CSP_FRAME_EXTRA = "'self' none";
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const frameSrc = res.headers
        .get('Content-Security-Policy')!
        .split('; ')
        .find((entry) => entry.startsWith('frame-src '))!;

      expect(frameSrc).toContain("'self'");
      expect(frameSrc).toContain("'none'");
    });
  });

  describe("nonce-based script-src (CSP_SCRIPT_MODE = 'nonce-dynamic')", () => {
    function scriptSrcDirective(csp: string | null): string {
      const directive = csp
        ?.split('; ')
        .find((entry) => entry.startsWith('script-src '));
      expect(directive).toBeDefined();
      return directive!;
    }

    it("uses nonce + strict-dynamic when mode is 'nonce-dynamic' and a nonce is given", () => {
      mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res, 'test-nonce-123');
      const scriptSrc = scriptSrcDirective(
        res.headers.get('Content-Security-Policy'),
      );

      expect(scriptSrc).toContain("'nonce-test-nonce-123'");
      expect(scriptSrc).toContain("'strict-dynamic'");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("falls back to the legacy CSP when mode is 'nonce-dynamic' but no nonce is given", () => {
      mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res);
      const scriptSrc = scriptSrcDirective(
        res.headers.get('Content-Security-Policy'),
      );

      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'nonce-");
      expect(scriptSrc).not.toContain("'strict-dynamic'");
    });

    it("uses the legacy CSP in 'cache-compatible' mode, even with a nonce given", () => {
      mockEnv.CSP_SCRIPT_MODE = 'cache-compatible';
      const req = createMockRequest();
      const res = NextResponse.next();
      withHeaders(req, res, 'test-nonce-123');
      const scriptSrc = scriptSrcDirective(
        res.headers.get('Content-Security-Policy'),
      );

      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'nonce-");
    });

    it('never includes unsafe-eval in production, in either mode', () => {
      mockEnv.NODE_ENV = 'production';

      mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
      const strictRes = NextResponse.next();
      withHeaders(createMockRequest(), strictRes, 'test-nonce-123');
      expect(
        scriptSrcDirective(strictRes.headers.get('Content-Security-Policy')),
      ).not.toContain("'unsafe-eval'");

      mockEnv.CSP_SCRIPT_MODE = 'cache-compatible';
      const legacyRes = NextResponse.next();
      withHeaders(createMockRequest(), legacyRes);
      expect(
        scriptSrcDirective(legacyRes.headers.get('Content-Security-Policy')),
      ).not.toContain("'unsafe-eval'");
    });

    it('includes unsafe-eval in development, in either mode', () => {
      mockEnv.NODE_ENV = 'development';

      mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
      const strictRes = NextResponse.next();
      withHeaders(createMockRequest(), strictRes, 'test-nonce-123');
      expect(
        scriptSrcDirective(strictRes.headers.get('Content-Security-Policy')),
      ).toContain("'unsafe-eval'");

      mockEnv.CSP_SCRIPT_MODE = 'cache-compatible';
      const legacyRes = NextResponse.next();
      withHeaders(createMockRequest(), legacyRes);
      expect(
        scriptSrcDirective(legacyRes.headers.get('Content-Security-Policy')),
      ).toContain("'unsafe-eval'");
    });
  });

  describe('build/runtime CSP invariant (A.8.4)', () => {
    function scriptSrcDirective(csp: string | null): string {
      const directive = csp
        ?.split('; ')
        .find((entry) => entry.startsWith('script-src '));
      expect(directive).toBeDefined();
      return directive!;
    }

    it('falls back to the legacy CSP when runtime says nonce-dynamic but the build was compiled cache-compatible', () => {
      // The dangerous direction: a live env change to nonce-dynamic
      // without a matching rebuild would otherwise emit a strict CSP for
      // a build whose static shell scripts have no nonce -- exactly
      // SEC-30's original incident, from a different trigger.
      mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
      mockEnv.NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE = 'cache-compatible';

      const res = NextResponse.next();
      withHeaders(createMockRequest(), res, 'test-nonce-123');
      const scriptSrc = scriptSrcDirective(
        res.headers.get('Content-Security-Policy'),
      );

      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'nonce-");
      expect(scriptSrc).not.toContain("'strict-dynamic'");
    });

    it('uses the strict CSP when runtime and build-time CSP_SCRIPT_MODE agree on nonce-dynamic', () => {
      mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
      mockEnv.NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE = 'nonce-dynamic';

      const res = NextResponse.next();
      withHeaders(createMockRequest(), res, 'test-nonce-123');
      const scriptSrc = scriptSrcDirective(
        res.headers.get('Content-Security-Policy'),
      );

      expect(scriptSrc).toContain("'nonce-test-nonce-123'");
      expect(scriptSrc).toContain("'strict-dynamic'");
    });

    it('is a no-op when the build-time value is unknown (e.g. a pre-A.8.4 build)', () => {
      mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
      mockEnv.NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE = undefined;

      const res = NextResponse.next();
      withHeaders(createMockRequest(), res, 'test-nonce-123');
      const scriptSrc = scriptSrcDirective(
        res.headers.get('Content-Security-Policy'),
      );

      // Falls through to the raw runtime value, same as before this
      // invariant existed.
      expect(scriptSrc).toContain("'nonce-test-nonce-123'");
      expect(scriptSrc).toContain("'strict-dynamic'");
    });
  });
});
