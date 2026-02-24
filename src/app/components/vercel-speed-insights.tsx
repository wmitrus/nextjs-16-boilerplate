'use client';

import { env } from '@/core/env';

let SpeedInsights: React.ComponentType | null = null;

if (env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview') {
  try {
    const { SpeedInsights: SI } = await import('@vercel/speed-insights/next');
    SpeedInsights = SI;
  } catch {}
}

export function VercelSpeedInsights() {
  if (!SpeedInsights) return null;
  return <SpeedInsights />;
}
