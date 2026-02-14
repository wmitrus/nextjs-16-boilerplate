import { vi } from 'vitest';

export const mockSecureFetch = vi.fn();

export function resetSecureFetchMocks() {
  mockSecureFetch.mockReset();
}

vi.mock('./secure-fetch', () => ({
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));
