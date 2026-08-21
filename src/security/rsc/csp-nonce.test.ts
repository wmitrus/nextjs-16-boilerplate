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

  it('returns undefined without calling headers() when strict mode is off', async () => {
    mockEnv.CSP_SCRIPT_STRICT_MODE = false;
    const { getCspNonce } = await import('./csp-nonce');

    const nonce = await getCspNonce();

    expect(nonce).toBeUndefined();
    expect(mockHeaders).not.toHaveBeenCalled();
  });

  it('reads x-nonce from headers() when strict mode is on', async () => {
    mockEnv.CSP_SCRIPT_STRICT_MODE = true;
    mockHeadersGet.mockReturnValue('abc123');
    const { getCspNonce } = await import('./csp-nonce');

    const nonce = await getCspNonce();

    expect(nonce).toBe('abc123');
    expect(mockHeadersGet).toHaveBeenCalledWith('x-nonce');
  });

  it('returns undefined when strict mode is on but no nonce header is present', async () => {
    mockEnv.CSP_SCRIPT_STRICT_MODE = true;
    mockHeadersGet.mockReturnValue(null);
    const { getCspNonce } = await import('./csp-nonce');

    const nonce = await getCspNonce();

    expect(nonce).toBeUndefined();
  });
});
