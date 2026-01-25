'use client';

import { useState } from 'react';

import { browserLogger } from '@/core/logger/browser';

export default function BrowserLoggerProbe() {
  const [count, setCount] = useState(0);

  const emitLog = () => {
    const nextCount = count + 1;
    setCount(nextCount);
    browserLogger.info({ e2e: true, count: nextCount }, 'browser logger e2e');
  };

  return (
    <div className="flex flex-col items-center gap-2 text-xs text-zinc-500 sm:items-start">
      <button
        type="button"
        onClick={emitLog}
        className="rounded-md border border-zinc-300 px-3 py-1 text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-600 dark:text-zinc-200"
        data-testid="browser-logger-button"
      >
        Emit browser log
      </button>
      <span data-testid="browser-logger-count">{count}</span>
    </div>
  );
}
