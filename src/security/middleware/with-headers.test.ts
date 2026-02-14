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
  });
});
