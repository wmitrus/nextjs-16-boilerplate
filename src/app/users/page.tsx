'use client';

import { useEffect, useState } from 'react';

import { logger } from '@/core/logger/client';

import { getUsers } from '@/features/user-management/api/userService';
import { UserList } from '@/features/user-management/components/UserList';
import type { User } from '@/features/user-management/types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      logger.info('Fetching users list');
      try {
        const data = await getUsers();
        setUsers(data);
        logger.debug({ count: data.length }, 'Users loaded');
        if (data.length === 0) {
          logger.warn('Users list is empty');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  return (
    <div className="container mx-auto p-8">
      <h1 className="mb-6 text-3xl font-bold">User Management</h1>
      <UserList users={users} loading={loading} error={error} />
    </div>
  );
}
