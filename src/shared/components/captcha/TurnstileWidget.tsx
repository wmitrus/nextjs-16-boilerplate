'use client';

import { useEffect, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: (errorCode?: string) => void;
  theme?: 'light' | 'dark' | 'auto';
  action?: string;
}

interface TurnstileGlobal {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

let scriptLoadPromise: Promise<TurnstileGlobal> | null = null;

/**
 * Loads Cloudflare's Turnstile script at most once per page, regardless of
 * how many `<TurnstileWidget>` instances mount. `challenges.cloudflare.com`
 * is already allowlisted in `script-src`/`connect-src`/`frame-src` (see
 * `CLOUDFLARE_DOMAINS` in `src/security/middleware/with-headers.ts`) -- no
 * CSP changes are needed to use this component.
 */
function loadTurnstileScript(): Promise<TurnstileGlobal> {
  if (typeof window !== 'undefined' && window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const onReady = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(
          new Error('Turnstile script loaded but window.turnstile is missing'),
        );
      }
    };

    const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Turnstile script')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', onReady, { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load Turnstile script')),
      { once: true },
    );
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export interface TurnstileWidgetProps {
  /** Public Turnstile site key (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`). */
  siteKey: string;
  /** Called with the response token once the visitor passes the challenge. */
  onVerify: (token: string) => void;
  /** Called when a previously-issued token expires (Turnstile tokens are short-lived). */
  onExpire?: () => void;
  /**
   * Increment to discard the current token and re-run the challenge.
   * Turnstile tokens are **single-use**: once the server has redeemed one via
   * `siteverify`, the widget must be reset before the visitor can submit
   * again, or the next submit replays an already-spent token and always
   * fails. See SEC-34 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
   */
  resetSignal?: number;
}

/**
 * Renders a Cloudflare Turnstile challenge in "Managed" mode -- Cloudflare's
 * own risk engine decides whether the visitor sees nothing, a single
 * checkbox, or an interactive puzzle. This component only handles loading
 * the script and wiring the token callback; verification always happens
 * server-side (`verifyTurnstileToken` in
 * `src/shared/lib/captcha/turnstile.ts`) -- a client-reported "verified"
 * state is never trusted on its own.
 *
 * The render effect deliberately depends on `siteKey` ALONE. Depending on
 * the callback props instead would tear down and re-render the widget every
 * time the parent re-renders with a fresh inline closure -- and because
 * `onVerify` itself sets parent state, that re-render is guaranteed on every
 * successful solve, producing an endless solve -> remount -> solve loop.
 * Callbacks are therefore read through refs that are kept current by their
 * own effect.
 */
export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  resetSignal = 0,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            if (cancelled) return;
            setErrorCode(null);
            onVerifyRef.current(token);
          },
          'expired-callback': () => {
            if (cancelled) return;
            onExpireRef.current?.();
          },
          // Cloudflare passes a numeric error code here (110200 = domain not
          // authorized for this sitekey, 110100/110110 = bad/unknown sitekey,
          // 110600 = challenge timeout, 6xxxxx = client execution error).
          // Surfacing it is the difference between "something broke" and a
          // one-line diagnosis, so it is both logged and shown in the UI.
          'error-callback': (code) => {
            if (cancelled) return;
            const resolved = code ?? 'unknown';
            console.error('[Turnstile] challenge error', {
              errorCode: resolved,
              hostname: window.location.hostname,
            });
            setErrorCode(resolved);
          },
          action: 'signin',
          theme: 'auto',
        });
      })
      .catch(() => {
        if (!cancelled) setErrorCode('script-load-failed');
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal === 0 || !widgetIdRef.current) return;
    // Only the imperative reset here -- clearing `errorCode` is left to the
    // solve/error callbacks, so this effect never sets state synchronously
    // (which would risk a cascading render, the very class of bug that made
    // this widget loop in the first place).
    window.turnstile?.reset(widgetIdRef.current);
  }, [resetSignal]);

  return (
    <div>
      <div ref={containerRef} data-testid="turnstile-widget-container" />
      {errorCode && (
        <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          Security check failed (code {errorCode}). Please refresh the page and
          try again.
        </p>
      )}
    </div>
  );
}
