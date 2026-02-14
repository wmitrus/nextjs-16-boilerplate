import { vi } from 'vitest';

export const mockGetIP = vi.fn(async (_headers: Headers) => '127.0.0.1');

vi.mock('@/shared/lib/network/get-ip', () => ({
  getIP: (headers: Headers) => mockGetIP(headers),
}));
