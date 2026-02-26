/** @vitest-environment node */
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { server } from '@/shared/lib/mocks/server';

import { secureFetch } from '@/security/outbound/secure-fetch';
import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';
import {
  mockChildLogger,
  resetLoggerMocks,
} from '@/testing/infrastructure/logger';

describe('Outbound Security Integration (SSRF)', () => {
  beforeEach(() => {
    resetEnvMocks();
    resetLoggerMocks();
    vi.clearAllMocks();
  });

  it('should allow requests to explicitly allowed hosts', async () => {
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'api.trusted-service.com';

    // Setup MSW handler for the trusted host
    server.use(
      http.get('https://api.trusted-service.com/data', () => {
        return HttpResponse.json({ success: true });
      }),
    );

    const response = await secureFetch('https://api.trusted-service.com/data');
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockChildLogger.error).not.toHaveBeenCalled();
  });

  it('should allow requests to core allowed hosts', async () => {
    server.use(
      http.get('https://api.clerk.com/v1/clients', () => {
        return HttpResponse.json({ status: 'ok' });
      }),
    );

    const response = await secureFetch('https://api.clerk.com/v1/clients');
    const data = await response.json();

    expect(data.status).toBe('ok');
  });

  it('should block requests to untrusted hosts', async () => {
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'api.trusted-service.com';
    const untrustedUrl = 'https://malicious-site.com/steal-data';

    await expect(secureFetch(untrustedUrl)).rejects.toThrow(
      'SSRF Protection: Host malicious-site.com is not allowed',
    );

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'malicious-site.com',
      }),
      expect.stringContaining('SSRF Attempt Blocked'),
    );
  });

  it('should block requests to private/local networks', async () => {
    const localUrls = [
      'http://localhost:3000/api/config',
      'http://127.0.0.1/admin',
      'http://192.168.1.1/router-login',
      'http://10.0.0.1/internal-service',
    ];

    for (const url of localUrls) {
      await expect(secureFetch(url)).rejects.toThrow(
        /SSRF Protection: Host .* is not allowed/,
      );
    }

    expect(mockChildLogger.error).toHaveBeenCalled();
  });

  it('should support subdomain matching for allowed hosts', async () => {
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'trusted.com';

    server.use(
      http.get('https://sub.trusted.com/api', () => {
        return HttpResponse.json({ ok: true });
      }),
    );

    const response = await secureFetch('https://sub.trusted.com/api');
    const data = await response.json();

    expect(data.ok).toBe(true);
  });
});
