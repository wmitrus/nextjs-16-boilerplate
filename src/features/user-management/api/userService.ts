import { logger } from '@/core/logger/client';

import type { User } from '../types';

export async function getUsers(): Promise<User[]> {
  logger.info('Fetching users from API');

  try {
    const response = await fetch('/api/users');
    if (!response.ok) {
      if (response.status === 429) {
        logger.warn(
          { status: response.status },
          'Rate limit exceeded when fetching users',
        );
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      logger.error(
        { status: response.status },
        'Failed to fetch users from API',
      );
      throw new Error('Failed to fetch users');
    }

    const data = (await response.json()) as User[];
    logger.debug({ count: data.length }, 'Fetched users from API');
    return data;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Rate limit exceeded')) {
      throw err;
    }

    logger.error({ err }, 'Users API request failed');
    throw err;
  }
}
