'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { logger as baseLogger } from '@/core/logger/client';

const logger = baseLogger.child({
  type: 'UI',
  category: 'error-boundary',
  module: 'global-error',
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(
      {
        err: error,
        digest: error.digest,
      },
      'Global Error caught',
    );

    if (error instanceof Error) {
      Sentry.captureException(error, {
        contexts: {
          error_boundary: {
            level: 'global',
            digest: error.digest,
          },
        },
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Application Error</title>
      </head>
      <body style={bodyStyles}>
        <div style={containerStyles}>
          <div style={iconContainerStyles}>
            <svg
              style={iconStyles}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 style={headingStyles}>Critical Error</h1>
          <p style={paragraphStyles}>
            A critical system error has occurred. Please try refreshing the
            page.
          </p>

          {error.digest && (
            <div style={digestContainerStyles}>
              <p style={digestLabelStyles}>Error Reference ID</p>
              <p style={digestValueStyles}>{error.digest}</p>
            </div>
          )}

          <button
            onClick={() => reset()}
            style={buttonStyles}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#bb2d3b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626';
            }}
          >
            Refresh Application
          </button>
        </div>
      </body>
    </html>
  );
}

const bodyStyles: React.CSSProperties = {
  display: 'flex',
  minHeight: '100vh',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  textAlign: 'center',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  backgroundColor: '#f9fafb',
  margin: 0,
  color: '#111827',
};

const containerStyles: React.CSSProperties = {
  maxWidth: '28rem',
  width: '100%',
};

const iconContainerStyles: React.CSSProperties = {
  marginBottom: '1.5rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

const iconStyles: React.CSSProperties = {
  width: '2.5rem',
  height: '2.5rem',
  color: '#dc2626',
};

const headingStyles: React.CSSProperties = {
  fontSize: '1.875rem',
  fontWeight: 'bold',
  color: '#111827',
  marginBottom: '0.5rem',
};

const paragraphStyles: React.CSSProperties = {
  marginTop: '0.75rem',
  marginBottom: '1.5rem',
  color: '#4b5563',
  fontSize: '0.95rem',
  lineHeight: '1.5',
};

const digestContainerStyles: React.CSSProperties = {
  marginTop: '1rem',
  marginBottom: '1.5rem',
  padding: '1rem',
  borderRadius: '0.375rem',
  backgroundColor: '#f3f4f6',
  textAlign: 'left',
};

const digestLabelStyles: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: '600',
  color: '#374151',
};

const digestValueStyles: React.CSSProperties = {
  marginTop: '0.25rem',
  wordBreak: 'break-all',
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  color: '#6b7280',
};

const buttonStyles: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  fontSize: '1rem',
  fontWeight: '500',
  color: 'white',
  backgroundColor: '#dc2626',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  transition: 'background-color 150ms ease-in-out',
};
