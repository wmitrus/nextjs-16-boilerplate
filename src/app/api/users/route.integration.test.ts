import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { GET } from './route';

vi.mock('@/core/logger/server', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('GET /api/users route', () => {
  it('returns ok response with users data and json content type', async () => {
    const request = new NextRequest('http://localhost/api/users');
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});
