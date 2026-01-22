import { jest } from '@jest/globals';

import { getUsers } from './userService';

describe('userService', () => {
  const mockUsers = [
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Doe', email: 'jane@example.com' },
  ];

  beforeEach(() => {
    // @ts-expect-error - mocking global fetch
    global.fetch = jest.fn();
  });

  it('fetches users successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockUsers,
    });

    const users = await getUsers();

    expect(users).toEqual(mockUsers);
    expect(global.fetch).toHaveBeenCalledWith('/api/users');
  });

  it('throws an error when fetch fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
    });

    await expect(getUsers()).rejects.toThrow('Failed to fetch users');
  });
});
