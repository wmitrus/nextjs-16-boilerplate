import { logger as baseLogger } from '@/core/logger/client';

import { apiClient } from '@/shared/lib/api/api-client';

import type { User } from '../types';

const logger = baseLogger.child({
  type: 'Feature',
  category: 'user-management',
  module: 'userService',
});

export async function getUsers(): Promise<User[]> {
  logger.debug({}, 'Fetching users from API');
  return apiClient.get<User[]>('/api/users');
}
