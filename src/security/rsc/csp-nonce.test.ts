import { describe, it, expect, vi, beforeEach } from 'vitest';

import { mockEnv, resetAllInfrastructureMocks } from '@/testing';

import '@/testing/infrastructure/env';

const mockHeadersGet = vi.fn();
const mockHeaders = vi.fn().mockResolvedValue({ get: mockHeadersGet });

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

describe('getCspNonce', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockHeadersGet.mockReset();
    mockHeaders.mockClear();
  });

  it("returns undefined without calling headers() in 'cache-compatible' mode", async () => {
    mockEnv.CSP_SCRIPT_MODE = 'cache-compatible';
    const { getCspNonce } = await import('./csp-nonce');

    const nonce = await getCspNonce();

    expect(nonce).toBeUndefined();
    expect(mockHeaders).not.toHaveBeenCalled();
  });

  it("reads x-nonce from headers() in 'nonce-dynamic' mode", async () => {
    mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
    mockHeadersGet.mockReturnValue('abc123');
    const { getCspNonce } = await import('./csp-nonce');

    const nonce = await getCspNonce();

    expect(nonce).toBe('abc123');
    expect(mockHeadersGet).toHaveBeenCalledWith('x-nonce');
  });

  it("returns undefined in 'nonce-dynamic' mode when no nonce header is present", async () => {
    mockEnv.CSP_SCRIPT_MODE = 'nonce-dynamic';
    mockHeadersGet.mockReturnValue(null);
    const { getCspNonce } = await import('./csp-nonce');

    const nonce = await getCspNonce();

    expect(nonce).toBeUndefined();
  });
});
