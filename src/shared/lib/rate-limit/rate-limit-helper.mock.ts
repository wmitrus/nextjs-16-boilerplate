import { vi } from 'vitest';

export const mockCheckRateLimit = vi.fn();

vi.mock('@/shared/lib/rate-limit/rate-limit-helper', () => ({
  checkRateLimit: (ip: string, meta?: { path?: string }) =>
    mockCheckRateLimit(ip, meta),
}));
