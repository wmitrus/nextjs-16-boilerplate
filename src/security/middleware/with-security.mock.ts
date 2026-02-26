import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { vi } from 'vitest';

export const mockWithSecurityMiddleware = vi.fn(async (_req: NextRequest) => {
  return NextResponse.next();
});

export const mockWithSecurity = vi.fn(
  (_handler?: (req: NextRequest) => Promise<NextResponse>) => {
    return async (req: NextRequest) => {
      return mockWithSecurityMiddleware(req);
    };
  },
);

export function resetWithSecurityMocks() {
  mockWithSecurity.mockClear();
  mockWithSecurityMiddleware.mockClear();
  mockWithSecurityMiddleware.mockResolvedValue(NextResponse.next());
}

vi.mock('./with-security', () => ({
  withSecurity: (handler?: (req: NextRequest) => Promise<NextResponse>) =>
    mockWithSecurity(handler),
}));
