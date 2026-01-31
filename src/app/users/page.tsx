'use client';

import { useEffect, useState } from 'react';

import { logger } from '@/core/logger/client';

import { ClientErrorBoundary } from '@/shared/components/error/client-error-boundary';
import { ErrorAlert } from '@/shared/components/ErrorAlert';
import { ApiClientError } from '@/shared/lib/api/api-client';

import { getUsers } from '@/features/user-management/api/userService';
import { UserList } from '@/features/user-management/components/UserList';
import type { User } from '@/features/user-management/types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    logger.info('Fetching users list');
    try {
      const data = await getUsers();
      setUsers(data);
      logger.debug({ count: data.length }, 'Users loaded');
      if (data.length === 0) {
        logger.warn('Users list is empty');
      }
    } catch (err) {
      setError(err);
      if (err instanceof ApiClientError) {
        logger.error(
          {
            err,
            status: err.status,
            code: err.code,
            errors: err.errors,
            correlationId: err.correlationId,
          },
          'API Error loading users',
        );
      } else {
        logger.error(err, 'Unexpected error loading users');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <ClientErrorBoundary>
      <div className="container mx-auto p-8">
        <h1 className="mb-6 text-3xl font-bold">User Management</h1>
        <ErrorAlert error={error} onRetry={fetchUsers} />
        <UserList
          users={users}
          loading={loading}
          error={error ? (error as Error).message : null}
        />
      </div>
    </ClientErrorBoundary>
  );
}
