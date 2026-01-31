'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Thrower() {
  const params = useSearchParams();
  const shouldThrow = params.get('throw') === '1';

  if (shouldThrow) {
    throw new Error('E2E forced error');
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">E2E Error Page</h1>
      <p>Use ?throw=1 to trigger the error boundary.</p>
    </div>
  );
}

export default function E2eErrorPage() {
  const e2eEnabled = process.env.NEXT_PUBLIC_E2E_ENABLED === 'true';

  if (!e2eEnabled) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <Thrower />
    </Suspense>
  );
}
