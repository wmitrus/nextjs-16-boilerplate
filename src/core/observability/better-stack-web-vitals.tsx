'use client';

import { useReportWebVitals } from 'next/web-vitals';

const PROXY_PATH = '/_betterstack/web-vitals';

export function BetterStackWebVitalsProvider() {
  useReportWebVitals((metric) => {
    const token = process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN;
    if (!token) return;

    const body = JSON.stringify({ webVital: metric });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(PROXY_PATH, body);
        return;
      } catch {
        // fall through to fetch
      }
    }

    void fetch(PROXY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  });

  return null;
}
