'use client';

import * as React from 'react';

export function CopyrightYear() {
  const [year, setYear] = React.useState<number | null>(null);

  React.useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  // Use a stable static fallback (e.g., build year) to avoid calling new Date()
  // during SSR/prerendering, which Next.js 16/19 flags as a dynamic error
  // if not wrapped in Suspense.
  return <>{year ?? 2026}</>;
}
