import type { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

export const mockWithHeaders = vi.fn<
  (req: NextRequest, res: NextResponse, nonce?: string) => NextResponse
>((_req, res) => res);

export const mockBuildContentSecurityPolicy = vi.fn<(nonce?: string) => string>(
  (nonce) => (nonce ? `script-src 'nonce-${nonce}'` : "script-src 'self'"),
);

export function resetWithHeadersMocks() {
  mockWithHeaders.mockReset();
  mockWithHeaders.mockImplementation((_req, res) => res);
  mockBuildContentSecurityPolicy.mockReset();
  mockBuildContentSecurityPolicy.mockImplementation((nonce) =>
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'self'",
  );
}

vi.mock('./with-headers', () => ({
  withHeaders: (req: NextRequest, res: NextResponse, nonce?: string) =>
    mockWithHeaders(req, res, nonce),
  buildContentSecurityPolicy: (nonce?: string) =>
    mockBuildContentSecurityPolicy(nonce),
}));
