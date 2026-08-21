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
});
