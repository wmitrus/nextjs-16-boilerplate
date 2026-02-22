'use client';

import * as Sentry from '@sentry/nextjs';
import type { ReactNode } from 'react';
import React from 'react';

import { logger as baseLogger } from '@/core/logger/client';

const logger = baseLogger.child({
  type: 'UI',
  category: 'error-boundary',
  module: 'client-error-boundary',
});

type FallbackRender = (error: Error, reset: () => void) => ReactNode;

interface ClientErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | FallbackRender;
  onError?: (error: Error) => void;
}

interface ClientErrorBoundaryState {
  error: Error | null;
}

export class ClientErrorBoundary extends React.Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ClientErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
    logger.error(error, 'Client error boundary caught an error');
    Sentry.captureException(error);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) {
      return children;
    }

    if (typeof fallback === 'function') {
      return fallback(error, this.reset);
    }

    if (fallback) {
      return fallback;
    }

    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="font-semibold">Something went wrong.</div>
        {process.env.NODE_ENV !== 'production' && (
          <pre className="mt-2 max-w-full overflow-auto text-xs whitespace-pre-wrap">
            {error.message}
            {error.stack}
          </pre>
        )}
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }
}
