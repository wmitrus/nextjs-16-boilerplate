import { getUsers } from './userService';

describe('userService', () => {
  const mockUsers = [
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Doe', email: 'jane@example.com' },
  ];

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('fetches users successfully', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockUsers,
    } as Response);

    const users = await getUsers();

    expect(users).toEqual(mockUsers);
    expect(global.fetch).toHaveBeenCalledWith('/api/users');
  });

  it('throws an error when fetch fails', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue({
      ok: false,
    } as Response);

    await expect(getUsers()).rejects.toThrow('Failed to fetch users');
  });
});
