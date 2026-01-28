import { vi, describe, it, expect } from 'vitest';

import { apiClient } from '@/shared/lib/api/api-client';

import { getUsers } from './userService';

vi.mock('@/shared/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('userService', () => {
  const mockUsers = [
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Doe', email: 'jane@example.com' },
  ];

  it('fetches users successfully', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockUsers);

    const users = await getUsers();

    expect(users).toEqual(mockUsers);
    expect(apiClient.get).toHaveBeenCalledWith('/api/users');
  });

  it('throws an error when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('API error'));

    await expect(getUsers()).rejects.toThrow('API error');
  });
});
