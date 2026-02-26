'use client';

import React, { useState } from 'react';

/**
 * Example of SSRF Protection.
 * Demonstrates: How secureFetch blocks untrusted or private hosts.
 */
export function ExternalFetchExample() {
  const [url, setUrl] = useState('https://clerk.com');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async (nextUrl?: string) => {
    const targetUrl = nextUrl ?? url;
    if (nextUrl) {
      setUrl(nextUrl);
    }

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(
        '/api/security-test/ssrf?url=' + encodeURIComponent(targetUrl),
      );

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

      if (response.ok) {
        setResult(JSON.stringify(data, null, 2));
      } else {
        setError(data.error || `Request failed with status ${response.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold">
        SSRF Protection (Outbound Firewall)
      </h3>
      <p className="mb-4 text-sm text-gray-600">
        Try fetching from an allowed host vs a blocked one or a local IP.
        <br />
        <span className="text-xs italic">
          Note: Clerk URLs vary between Dev (clerk.accounts.dev) and Prod
          (clerk.com).
        </span>
      </p>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded border p-2 font-mono text-sm"
          placeholder="https://..."
        />
        <button
          type="button"
          onClick={() => handleFetch()}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Testing...' : 'Test Fetch'}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => handleFetch('https://api.github.com/zen')}
          className="p-1 text-left text-blue-600 hover:underline"
        >
          • Allowed: api.github.com
        </button>
        <button
          type="button"
          onClick={() => handleFetch('https://api.clerk.com/v1/health')}
          className="p-1 text-left text-blue-600 hover:underline"
        >
          • Allowed: api.clerk.com
        </button>
        <button
          type="button"
          onClick={() => handleFetch('https://google.com')}
          className="p-1 text-left text-red-600 hover:underline"
        >
          • Blocked: google.com
        </button>
        <button
          type="button"
          onClick={() =>
            handleFetch('http://169.254.169.254/latest/meta-data/')
          }
          className="p-1 text-left text-red-600 hover:underline"
        >
          • Blocked: AWS Metadata (Private IP)
        </button>
      </div>

      {result && (
        <pre className="max-h-40 overflow-auto rounded border border-green-100 bg-green-50 p-3 text-xs">
          {result}
        </pre>
      )}
      {error && (
        <pre className="overflow-auto rounded border border-red-100 bg-red-50 p-3 text-xs text-red-600">
          {error}
        </pre>
      )}
    </div>
  );
}
