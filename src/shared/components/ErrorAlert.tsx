import React, { useState } from 'react';

import { ApiClientError } from '@/shared/lib/api/api-client';

interface ErrorAlertProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  onRetry,
  title,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  let message = 'An unexpected error occurred';
  let details: string[] = [];
  let code: string | undefined;
  let correlationId: string | undefined;
  let stack: string | undefined;

  if (error instanceof ApiClientError) {
    message = error.message;
    code = error.code;
    correlationId = error.correlationId ?? undefined;
    if (error.errors) {
      details = Object.entries(error.errors).flatMap(([field, msgs]) =>
        msgs.map((m) => `${field}: ${m}`),
      );
    }
  } else if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  } else if (typeof error === 'string') {
    message = error;
  }

  const copyToClipboard = () => {
    if (correlationId) {
      navigator.clipboard.writeText(correlationId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="alert"
      className="my-4 overflow-hidden rounded-md border border-red-200 bg-red-50"
    >
      <div className="p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-red-800">
              {title || message}
            </h3>
            {title && message !== title && (
              <p className="mt-1 text-sm text-red-700">{message}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-red-600">
              {code && <span>CODE: {code}</span>}
              {correlationId && (
                <div className="flex items-center gap-1">
                  <span>ID: {correlationId}</span>
                  <button
                    onClick={copyToClipboard}
                    className="hover:text-red-800 focus:outline-none"
                    title="Copy Correlation ID"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>

            {details.length > 0 && (
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-inside list-disc space-y-1">
                  {details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200 focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:outline-none"
                >
                  Retry Action
                </button>
              )}
              {(stack || details.length > 0 || code) && (
                <button
                  type="button"
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs font-medium text-red-600 hover:text-red-800 focus:outline-none"
                >
                  {showDetails ? 'Hide Details' : 'Show Technical Details'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDetails && (stack || code || correlationId) && (
        <div className="border-t border-red-200 bg-red-100/50 p-4">
          <pre className="overflow-x-auto text-[10px] text-red-800">
            {JSON.stringify(
              {
                code,
                correlationId,
                message,
                stack: stack?.split('\n').slice(0, 5),
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
};
