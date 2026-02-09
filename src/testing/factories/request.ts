import { NextRequest } from 'next/server';

/**
 * Creates a mock NextRequest for testing.
 * Professional Factory Pattern for generic HTTP primitives.
 */
export function createMockRequest(
  options: {
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): NextRequest {
  const { path = '/', method = 'GET', headers = {}, body } = options;
  const url = `http://localhost${path}`;

  return new NextRequest(url, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
}
