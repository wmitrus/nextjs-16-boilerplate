import { logger } from '@/core/logger/client';

import { apiClient } from '@/shared/lib/api/api-client';

import type { User } from '../types';

export async function getUsers(): Promise<User[]> {
  logger.info('Fetching users from API via apiClient');
  return apiClient.get<User[]>('/api/users');
}
