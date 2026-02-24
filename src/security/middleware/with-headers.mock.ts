import type { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

export const mockWithHeaders = vi.fn<
  (req: NextRequest, res: NextResponse) => NextResponse
>((_req, res) => res);

export function resetWithHeadersMocks() {
  mockWithHeaders.mockReset();
  mockWithHeaders.mockImplementation((_req, res) => res);
}

vi.mock('./with-headers', () => ({
  withHeaders: (req: NextRequest, res: NextResponse) =>
    mockWithHeaders(req, res),
}));
