'use client';

import { useReportWebVitals } from '@logtail/next/webVitals';

export function BetterStackWebVitalsProvider() {
  useReportWebVitals();
  return null;
}
