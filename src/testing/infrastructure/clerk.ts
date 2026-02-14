import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { vi } from 'vitest';

/**
 * Global Clerk Infrastructure Mocks.
 * Centralized singleton mocks for 10x scalability.
 */
export const mockAuth = vi.fn();
export const mockClerkClient = vi.fn();

type ClerkMiddlewareHandler = (
  auth: ClerkMiddlewareAuth,
  req: NextRequest,
) => Promise<unknown> | unknown;

export const mockClerkMiddleware = vi.fn((cb: ClerkMiddlewareHandler) => {
  return async (auth: ClerkMiddlewareAuth, req: NextRequest) => {
    return cb(auth, req);
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (cb: ClerkMiddlewareHandler) => mockClerkMiddleware(cb),
  auth: () => mockAuth(),
  clerkClient: () => mockClerkClient(),
}));

export function resetClerkMocks() {
  mockAuth.mockReset();
  mockClerkClient.mockReset();
  mockClerkMiddleware.mockClear();
  mockClerkMiddleware.mockImplementation((cb: ClerkMiddlewareHandler) => {
    return async (auth: ClerkMiddlewareAuth, req: NextRequest) => {
      return cb(auth, req);
    };
  });
}
