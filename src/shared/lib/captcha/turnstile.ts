import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;

let _logger:
  | ReturnType<ReturnType<typeof resolveServerLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'turnstile',
  });
  return _logger;
}

interface TurnstileSiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

/**
 * `true` once both the server-only secret key and the public site key are
 * set. Callers must treat "not configured" as "skip the CAPTCHA gate" (not
 * as "deny everyone") -- see the `SEC-34` rule in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`: a login-abuse fix must not
 * hard-fail every login in an environment (local dev, most CI) where no
 * Turnstile keys are configured.
 */
export function isTurnstileConfigured(): boolean {
  return Boolean(
    env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
}

/**
 * Verifies a Cloudflare Turnstile response token server-side via the
 * `siteverify` endpoint. Returns `false` (never throws) on any
 * network/parse/timeout failure -- a CAPTCHA gate must fail closed (treat an
 * unverifiable token as invalid), not silently let the caller through.
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY || !token) {
    return false;
  }

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      getLogger().warn(
        { event: 'turnstile:verify_http_error', status: response.status },
        'Turnstile siteverify returned a non-OK status',
      );
      return false;
    }

    const data = (await response.json()) as TurnstileSiteverifyResponse;
    return data.success === true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    getLogger().warn(
      {
        event: 'turnstile:verify_error',
        errorMessage: err.message,
        errorName: err.name,
      },
      'Turnstile siteverify request failed',
    );
    return false;
  }
}
