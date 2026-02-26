import * as Sentry from '@sentry/nextjs';

class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'SentryExampleAPIError';
  }
}

// A faulty API route to test Sentry's error monitoring
export async function GET() {
  Sentry.logger.info('Sentry example API called');
  try {
    throw new SentryExampleAPIError(
      'This error is raised on the backend called by the example page.',
    );
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    throw error;
  }
}
