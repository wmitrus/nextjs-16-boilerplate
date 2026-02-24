import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { vi } from 'vitest';

export const mockWithSecurityMiddleware = vi.fn(
  (_auth: ClerkMiddlewareAuth, _req: NextRequest) => {
    return Promise.resolve(NextResponse.next());
  },
);

export const mockWithSecurity = vi.fn(() => mockWithSecurityMiddleware);

export function resetWithSecurityMocks() {
  mockWithSecurity.mockClear();
  mockWithSecurityMiddleware.mockClear();
  mockWithSecurityMiddleware.mockResolvedValue(NextResponse.next());
}

vi.mock('./with-security', () => ({
  withSecurity: () => mockWithSecurity(),
}));
