import { afterEach, describe, expect, it, vi } from 'vitest';

import { createReplayToken } from './replay-token';

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'crypto',
);

function setCrypto(value: Crypto | undefined): void {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value,
  });
}

describe('createReplayToken', () => {
  afterEach(() => {
    vi.useRealTimers();
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
    }
  });

  it('uses randomUUID when available', () => {
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));

    setCrypto({
      randomUUID: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
    } as unknown as Crypto);

    expect(createReplayToken()).toBe(
      '1784980800000|11111111-1111-4111-8111-111111111111',
    );
  });

  it('falls back to getRandomValues and applies UUID v4 bits', () => {
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));

    setCrypto({
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        return bytes;
      }),
    } as unknown as Crypto);

    expect(createReplayToken()).toBe(
      '1784980800000|00010203-0405-4607-8809-0a0b0c0d0e0f',
    );
  });

  it('throws when Web Crypto is unavailable', () => {
    setCrypto(undefined);

    expect(() => createReplayToken()).toThrow(
      'Replay token generation requires Web Crypto',
    );
  });
});
