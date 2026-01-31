import { logger } from '@/core/logger/server';

import { createSuccessResponse } from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

const sampleUsers = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@sample.dev' },
  { id: '2', name: 'Alan Turing', email: 'alan@sample.dev' },
  { id: '3', name: 'Grace Hopper', email: 'grace@sample.dev' },
];

export const GET = withErrorHandler(async () => {
  logger.info({ count: sampleUsers.length }, 'Serving sample users');
  return createSuccessResponse(sampleUsers);
});
