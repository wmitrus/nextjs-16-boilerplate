/** @vitest-environment node */
import '@/security/middleware/with-headers.mock';
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';
import '@/testing/infrastructure/env';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.unmock('./with-security');

import { withSecurity } from './with-security';

import {
  createMockRequest,
  createMockRouteContext,
  mockClassifyRequest,
  mockWithHeaders,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Security Pipeline', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    vi.clearAllMocks();

    mockWithHeaders.mockImplementation((_req, res) => res);
  });

  it('should skip logic for static files', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({ isStaticFile: true }),
    );

    const pipeline = withSecurity() as unknown as (
      req: NextRequest,
    ) => Promise<NextResponse>;
    const req = createMockRequest({ path: '/logo.png' });
    const res = await pipeline(req);

    expect(res?.status).toBe(200);
    expect(mockWithHeaders).not.toHaveBeenCalled();
  });

  it('should return handler response when terminal handler denies', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({ isStaticFile: false }),
    );

    const terminalHandler = vi
      .fn()
      .mockResolvedValue(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      );

    const pipeline = withSecurity(terminalHandler) as unknown as (
      req: NextRequest,
    ) => Promise<NextResponse>;
    const req = createMockRequest({ path: '/api/internal/test' });
    const res = await pipeline(req);

    expect(res?.status).toBe(403);
    expect(terminalHandler).toHaveBeenCalled();
  });

  it('should apply headers and correlation id', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({
        isStaticFile: false,
        isPublicRoute: true,
      }),
    );

    const pipeline = withSecurity() as unknown as (
      req: NextRequest,
    ) => Promise<NextResponse>;
    const req = createMockRequest({ path: '/' });
    const res = await pipeline(req);

    expect(mockWithHeaders).toHaveBeenCalled();
    expect(res?.headers.get('x-correlation-id')).toBeDefined();
  });

  it('should call terminal handler if provided', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({
        isStaticFile: false,
        isPublicRoute: true,
      }),
    );

    const terminalHandler = vi
      .fn()
      .mockResolvedValue(NextResponse.json({ ok: true }));
    const pipeline = withSecurity(terminalHandler) as unknown as (
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/test' });
    const res = await pipeline(req);

    expect(terminalHandler).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
