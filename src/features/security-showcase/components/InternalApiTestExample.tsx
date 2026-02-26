'use client';

import React, { useState } from 'react';

/**
 * Example of Internal API Guard.
 * Demonstrates: Blocking requests that lack the required X-Internal-Key.
 */
export function InternalApiTestExample() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const testInternalApi = async (useKey: boolean) => {
    setLoading(true);
    setResult(null);
    try {
      const headers: Record<string, string> = {};
      if (useKey) {
        // In a real app, this key would never be exposed to the client!
        // This is purely for demonstration of the middleware guard.
        headers['x-internal-key'] = 'demo-internal-key';
      }

      const response = await fetch('/api/internal/health', { headers });

      const contentType = response.headers.get('content-type');
      let data;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(
          `Server returned non-JSON response (${response.status}): ${text.slice(0, 100)}`,
        );
      }

      setResult(
        `Status: ${response.status}\nBody: ${JSON.stringify(data, null, 2)}`,
      );
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold">Internal API Guard</h3>
      <p className="mb-4 text-sm text-gray-600">
        Endpoints under <code>/api/internal/*</code> are protected at the
        middleware level.
      </p>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => testInternalApi(false)}
          disabled={loading}
          className="flex-1 rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Test without Key (403)
        </button>
        <button
          type="button"
          onClick={() => testInternalApi(true)}
          disabled={loading}
          className="flex-1 rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
        >
          Test with Key (Success)
        </button>
      </div>

      {result && (
        <pre className="mt-4 rounded border bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}
