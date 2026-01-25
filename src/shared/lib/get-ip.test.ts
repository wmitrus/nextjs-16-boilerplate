import { describe, expect, it } from 'vitest';

import { getIP } from './get-ip';

describe('getIP', () => {
  it('should return x-forwarded-for if present', async () => {
    const headers = new Headers({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    const ip = await getIP(headers);
    expect(ip).toBe('1.2.3.4');
  });

  it('should return x-real-ip if x-forwarded-for is missing', async () => {
    const headers = new Headers({
      'x-real-ip': '9.10.11.12',
    });
    const ip = await getIP(headers);
    expect(ip).toBe('9.10.11.12');
  });

  it('should return cf-connecting-ip if others are missing', async () => {
    const headers = new Headers({
      'cf-connecting-ip': '13.14.15.16',
    });
    const ip = await getIP(headers);
    expect(ip).toBe('13.14.15.16');
  });

  it('should return fallback if no headers are present', async () => {
    const headers = new Headers();
    const ip = await getIP(headers);
    expect(ip).toBe('127.0.0.1');
  });
});
