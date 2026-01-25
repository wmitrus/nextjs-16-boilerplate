import { logger } from '@/core/logger';

import type { User } from '../types';

export async function getUsers(): Promise<User[]> {
  logger.info('Fetching users from API');

  try {
    const response = await fetch('/api/users');
    if (!response.ok) {
      logger.warn(
        { status: response.status },
        'Failed to fetch users from API',
      );
      throw new Error('Failed to fetch users');
    }

    const data = (await response.json()) as User[];
    logger.debug({ count: data.length }, 'Fetched users from API');
    return data;
  } catch (err) {
    logger.error({ err }, 'Users API request failed');
    throw err;
  }
}
