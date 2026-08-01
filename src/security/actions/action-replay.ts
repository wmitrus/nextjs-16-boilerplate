import 'server-only';

import { Redis } from '@upstash/redis';

import { env } from '@/core/env';

import type { SecurityContext } from '@/security/core/security-context';

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const REPLAY_KEY_PREFIX = 'replay:server-action';

const shouldUseReplayRedisStore =
  env.NODE_ENV === 'production' &&
  Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

const replayRedis = shouldUseReplayRedisStore
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : undefined;

const localReplayTokens = new Map<string, number>();

function buildReplayKey(nonce: string): string {
  return `${REPLAY_KEY_PREFIX}:${nonce}`;
}

function cleanupLocalReplayTokens(now: number): void {
  for (const [nonce, expiresAt] of localReplayTokens.entries()) {
    if (expiresAt <= now) {
      localReplayTokens.delete(nonce);
    }
  }
}

async function markReplayNonce(nonce: string, now: number): Promise<void> {
  const expiresAt = now + REPLAY_WINDOW_MS;

  if (replayRedis) {
    const created = await replayRedis.set(buildReplayKey(nonce), '1', {
      nx: true,
      ex: Math.ceil(REPLAY_WINDOW_MS / 1000),
    });

    if (created !== 'OK') {
      throw new Error('Replay token already used');
    }

    return;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Replay protection unavailable: configure Upstash Redis in production',
    );
  }

  cleanupLocalReplayTokens(now);
  if (localReplayTokens.has(nonce)) {
    throw new Error('Replay token already used');
  }

  localReplayTokens.set(nonce, expiresAt);
}

export function resetReplayProtectionStoreForTests(): void {
  localReplayTokens.clear();
}

/**
 * Replay protection logic for Server Actions.
 * In a production environment, nonces should be stored in a short-lived cache (e.g., Redis)
 * to prevent double-spending or replay attacks within a time window.
 */
export async function validateReplayToken(
  token: string | undefined,
  _context: SecurityContext,
): Promise<void> {
  if (!token) {
    throw new Error('Replay protection token missing');
  }

  const [timestampStr, nonce] = token.split('|');
  const timestamp = parseInt(timestampStr ?? '0', 10);
  const now = Date.now();

  if (!nonce || nonce.length < 8) {
    throw new Error('Replay token nonce missing or invalid');
  }

  if (isNaN(timestamp) || Math.abs(now - timestamp) > REPLAY_WINDOW_MS) {
    throw new Error('Action expired or invalid timestamp');
  }

  await markReplayNonce(nonce, now);
}
