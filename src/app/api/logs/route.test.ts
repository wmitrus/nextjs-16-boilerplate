/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';
import '@/shared/lib/network/get-ip.mock';

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { localRateLimit } from '@/shared/lib/rate-limit/rate-limit-local';

import { POST } from './route';

import {
  mockGetIP,
  mockLogger,
  mockChildLogger,
  resetAllInfrastructureMocks,
} from '@/testing';
import { mockEnv } from '@/testing/infrastructure/env';

vi.mock('@/shared/lib/rate-limit/rate-limit-local', () => ({
  localRateLimit: vi.fn().mockResolvedValue({
    success: true,
    limit: 60,
    remaining: 59,
    reset: new Date(),
  }),
}));

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: vi.fn(() => mockLogger),
}));

const mockLocalRateLimit = vi.mocked(localRateLimit);

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  const bodyStr = JSON.stringify(body);
  return new NextRequest('http://localhost/api/logs', {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      ...headers,
    }),
    body: bodyStr,
  });
}

describe('POST /api/logs', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockGetIP.mockResolvedValue('1.2.3.4');
    mockLocalRateLimit.mockClear();
    mockLocalRateLimit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: new Date(),
    });
  });

  describe('valid browser log payload', () => {
    it('returns 204 for valid info log', async () => {
      const req = makeRequest({
        level: 'info',
        message: 'test message',
        context: { foo: 'bar' },
        source: 'browser',
      });

      const res = await POST(req);
      expect(res.status).toBe(204);
    });

    it('forwards log to server logger at correct level', async () => {
      const req = makeRequest({
        level: 'error',
        message: 'something broke',
        context: { component: 'Header' },
        source: 'browser',
      });

      await POST(req);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'browser-ingest',
          category: 'browser',
          source: 'browser',
        }),
      );
      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'Header', ip: '1.2.3.4' }),
        'something broke',
      );
    });

    it('treats source as browser when no ingest secret header is sent', async () => {
      const req = makeRequest({
        level: 'warn',
        message: 'warn msg',
        context: {},
        source: 'edge',
      });

      await POST(req);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'browser' }),
      );
    });
  });

  describe('edge source authentication', () => {
    it('treats source as edge when valid ingest secret matches', async () => {
      mockEnv.LOG_INGEST_SECRET = 'test-secret-123';

      const req = makeRequest(
        { level: 'info', message: 'edge log', context: {}, source: 'edge' },
        { 'x-log-ingest-secret': 'test-secret-123' },
      );

      await POST(req);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'edge', category: 'edge' }),
      );

      mockEnv.LOG_INGEST_SECRET = undefined;
    });

    it('falls back to browser source when ingest secret does not match', async () => {
      mockEnv.LOG_INGEST_SECRET = 'correct-secret';

      const req = makeRequest(
        { level: 'info', message: 'edge log', context: {}, source: 'edge' },
        { 'x-log-ingest-secret': 'wrong-secret' },
      );

      await POST(req);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'browser' }),
      );

      mockEnv.LOG_INGEST_SECRET = undefined;
    });

    it('preserves type/category/module from context for authenticated edge', async () => {
      mockEnv.LOG_INGEST_SECRET = 'test-secret-123';

      const req = makeRequest(
        {
          level: 'debug',
          message: 'Security Middleware Processing',
          context: {
            type: 'Security',
            category: 'middleware',
            module: 'with-security',
            path: '/api/users',
            correlationId: 'abc-123',
          },
          source: 'edge',
        },
        { 'x-log-ingest-secret': 'test-secret-123' },
      );

      await POST(req);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Security',
          category: 'middleware',
          module: 'with-security',
          source: 'edge',
        }),
      );

      mockEnv.LOG_INGEST_SECRET = undefined;
    });

    it('uses default edge-ingest type when context has no type for authenticated edge', async () => {
      mockEnv.LOG_INGEST_SECRET = 'test-secret-123';

      const req = makeRequest(
        {
          level: 'info',
          message: 'edge log without classification',
          context: { path: '/api/test' },
          source: 'edge',
        },
        { 'x-log-ingest-secret': 'test-secret-123' },
      );

      await POST(req);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'edge-ingest',
          category: 'edge',
          module: 'log-ingest-route',
          source: 'edge',
        }),
      );

      mockEnv.LOG_INGEST_SECRET = undefined;
    });

    it('strips type/category/module from log body when used as child bindings for edge', async () => {
      mockEnv.LOG_INGEST_SECRET = 'test-secret-123';

      const req = makeRequest(
        {
          level: 'debug',
          message: 'edge log',
          context: {
            type: 'Security',
            category: 'middleware',
            module: 'with-security',
            path: '/api/users',
          },
          source: 'edge',
        },
        { 'x-log-ingest-secret': 'test-secret-123' },
      );

      await POST(req);

      const logCall = mockChildLogger.debug.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall).not.toHaveProperty('type');
      expect(logCall).not.toHaveProperty('category');
      expect(logCall).not.toHaveProperty('module');
      expect(logCall).toHaveProperty('path', '/api/users');

      mockEnv.LOG_INGEST_SECRET = undefined;
    });

    it('still strips secret-named keys for authenticated edge', async () => {
      mockEnv.LOG_INGEST_SECRET = 'test-secret-123';

      const req = makeRequest(
        {
          level: 'info',
          message: 'edge log with secrets',
          context: {
            type: 'Security',
            password: 'should-be-stripped',
            correlationId: 'abc-123',
          },
          source: 'edge',
        },
        { 'x-log-ingest-secret': 'test-secret-123' },
      );

      await POST(req);

      const logCall = mockChildLogger.info.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall).not.toHaveProperty('password');
      expect(logCall).toHaveProperty('correlationId', 'abc-123');

      mockEnv.LOG_INGEST_SECRET = undefined;
    });

    it('source from context is always ignored — route controls it', async () => {
      mockEnv.LOG_INGEST_SECRET = 'test-secret-123';

      const req = makeRequest(
        {
          level: 'info',
          message: 'edge log',
          context: { source: 'injected-source', path: '/x' },
          source: 'edge',
        },
        { 'x-log-ingest-secret': 'test-secret-123' },
      );

      await POST(req);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'edge' }),
      );
      const logCall = mockChildLogger.info.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall).not.toHaveProperty('source');

      mockEnv.LOG_INGEST_SECRET = undefined;
    });
  });

  describe('edge rate limit bypass', () => {
    it('bypasses rate limit for authenticated edge ingest', async () => {
      mockEnv.LOG_INGEST_SECRET = 'test-secret-123';
      mockLocalRateLimit.mockResolvedValue({
        success: false,
        limit: 60,
        remaining: 0,
        reset: new Date(),
      });

      const req = makeRequest(
        { level: 'info', message: 'edge log', context: {}, source: 'edge' },
        { 'x-log-ingest-secret': 'test-secret-123' },
      );

      const res = await POST(req);
      expect(res.status).toBe(204);
      expect(mockLocalRateLimit).not.toHaveBeenCalled();

      mockEnv.LOG_INGEST_SECRET = undefined;
    });

    it('applies rate limit for unauthenticated requests even with source=edge in payload', async () => {
      mockLocalRateLimit.mockResolvedValue({
        success: false,
        limit: 60,
        remaining: 0,
        reset: new Date(),
      });

      const req = makeRequest({
        level: 'info',
        message: 'trying to bypass',
        context: {},
        source: 'edge',
      });

      const res = await POST(req);
      expect(res.status).toBe(429);

      mockEnv.LOG_INGEST_SECRET = undefined;
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
      mockLocalRateLimit.mockResolvedValue({
        success: false,
        limit: 60,
        remaining: 0,
        reset: new Date(),
      });

      const req = makeRequest({
        level: 'info',
        message: 'test',
        context: {},
        source: 'browser',
      });

      const res = await POST(req);
      expect(res.status).toBe(429);
    });

    it('does not forward to logger when rate limited', async () => {
      mockLocalRateLimit.mockResolvedValue({
        success: false,
        limit: 60,
        remaining: 0,
        reset: new Date(),
      });

      const req = makeRequest({
        level: 'info',
        message: 'test',
        context: {},
        source: 'browser',
      });

      await POST(req);
      expect(mockLogger.child).not.toHaveBeenCalled();
    });
  });

  describe('body size limit', () => {
    it('returns 413 when content-length header exceeds limit', async () => {
      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'content-length': String(9 * 1024),
        }),
        body: JSON.stringify({
          level: 'info',
          message: 'x',
          context: {},
          source: 'browser',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
    });

    it('returns 413 when body exceeds limit regardless of content-length', async () => {
      const largeBody = 'x'.repeat(9 * 1024);
      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/json' }),
        body: largeBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
    });
  });

  describe('input validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/json' }),
        body: 'not-json',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid level value', async () => {
      const req = makeRequest({
        level: 'verbose',
        message: 'test',
        context: {},
        source: 'browser',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when message is missing', async () => {
      const req = makeRequest({
        level: 'info',
        context: {},
        source: 'browser',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when message exceeds 500 chars', async () => {
      const req = makeRequest({
        level: 'info',
        message: 'x'.repeat(501),
        context: {},
        source: 'browser',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('context sanitization', () => {
    it('strips reserved top-level fields from context', async () => {
      const req = makeRequest({
        level: 'info',
        message: 'test',
        context: { type: 'SECURITY_AUDIT', category: 'hacked', foo: 'bar' },
        source: 'browser',
      });

      await POST(req);

      const logCall = mockChildLogger.info.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall).not.toHaveProperty('type');
      expect(logCall).not.toHaveProperty('category');
      expect(logCall).toHaveProperty('foo', 'bar');
    });

    it('strips secret-named keys from context', async () => {
      const req = makeRequest({
        level: 'info',
        message: 'test',
        context: { password: 'hunter2', token: 'abc123', userId: 'u1' },
        source: 'browser',
      });

      await POST(req);

      const logCall = mockChildLogger.info.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall).not.toHaveProperty('password');
      expect(logCall).not.toHaveProperty('token');
      expect(logCall).toHaveProperty('userId', 'u1');
    });

    it('truncates string values exceeding 2KB', async () => {
      const longValue = 'a'.repeat(3000);
      const req = makeRequest({
        level: 'info',
        message: 'test',
        context: { data: longValue },
        source: 'browser',
      });

      await POST(req);

      const logCall = mockChildLogger.info.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      const data = logCall?.['data'] as string;
      expect(data).toContain('[truncated]');
      expect(data.length).toBeLessThan(longValue.length);
    });

    it('strips nested context beyond depth 3', async () => {
      const req = makeRequest({
        level: 'info',
        message: 'test',
        context: {
          a: { b: { c: { d: { deep: 'value' } } } },
        },
        source: 'browser',
      });

      await POST(req);

      const logCall = mockChildLogger.info.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      const a = logCall?.['a'] as Record<string, unknown>;
      const b = a?.['b'] as Record<string, unknown>;
      const c = b?.['c'] as Record<string, unknown>;
      expect(c).toEqual({});
    });
  });
});
