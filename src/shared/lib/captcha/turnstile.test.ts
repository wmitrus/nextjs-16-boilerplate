import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isTurnstileConfigured, verifyTurnstileToken } from './turnstile';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => ({
    child: () => ({ warn: vi.fn() }),
  }),
}));

describe('turnstile', () => {
  beforeEach(() => {
    resetEnvMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('isTurnstileConfigured', () => {
    it('is false when neither key is set', () => {
      expect(isTurnstileConfigured()).toBe(false);
    });

    it('is false when only the secret key is set', () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      expect(isTurnstileConfigured()).toBe(false);
    });

    it('is false when only the site key is set', () => {
      mockEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site';
      expect(isTurnstileConfigured()).toBe(false);
    });

    it('is true when both keys are set', () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      mockEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site';
      expect(isTurnstileConfigured()).toBe(true);
    });
  });

  describe('verifyTurnstileToken', () => {
    it('returns false without calling the network when the secret key is unset', async () => {
      const result = await verifyTurnstileToken('some-token');
      expect(result).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns false without calling the network when the token is missing', async () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      const result = await verifyTurnstileToken(undefined);
      expect(result).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns true when Cloudflare reports success', async () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const result = await verifyTurnstileToken('valid-token');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns false when Cloudflare reports failure', async () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            'error-codes': ['invalid-input-response'],
          }),
          { status: 200 },
        ),
      );

      const result = await verifyTurnstileToken('bad-token');
      expect(result).toBe(false);
    });

    it('fails closed (returns false) on a non-OK HTTP response', async () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }));

      const result = await verifyTurnstileToken('some-token');
      expect(result).toBe(false);
    });

    it('fails closed (returns false) when the network call throws', async () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));

      const result = await verifyTurnstileToken('some-token');
      expect(result).toBe(false);
    });

    it('includes remoteip when provided', async () => {
      mockEnv.TURNSTILE_SECRET_KEY = 'secret';
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      await verifyTurnstileToken('valid-token', '203.0.113.1');

      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      const sentBody = (init?.body as URLSearchParams).toString();
      expect(sentBody).toContain('remoteip=203.0.113.1');
    });
  });
});
