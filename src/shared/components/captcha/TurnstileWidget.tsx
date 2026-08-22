'use client';

import { useEffect, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

interface TurnstileGlobal {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
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
}

/**
 * Renders a Cloudflare Turnstile challenge in "Managed" mode -- Cloudflare's
 * own risk engine decides whether the visitor sees nothing, a single
 * checkbox, or an interactive puzzle. This component only handles loading
 * the script and wiring the token callback; verification always happens
 * server-side (`verifyTurnstileToken` in
 * `src/shared/lib/captcha/turnstile.ts`) -- a client-reported "verified"
 * state is never trusted on its own.
 */
export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onVerify,
          'expired-callback': onExpire,
          'error-callback': () => {
            if (!cancelled) setLoadError(true);
          },
          theme: 'auto',
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onVerify, onExpire]);

  return (
    <div>
      <div ref={containerRef} data-testid="turnstile-widget-container" />
      {loadError && (
        <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          Security check failed to load. Please refresh the page and try again.
        </p>
      )}
    </div>
  );
}
