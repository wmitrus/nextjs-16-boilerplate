'use client';

import { useSearchParams } from 'next/navigation';

export default function E2eErrorPage() {
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
