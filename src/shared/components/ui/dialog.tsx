'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Shared modal shell, extracted from the step-up dialogs (SEC-48, see
 * `StepUpProvider.tsx`) once a third consumer (OZI-57's audit-log actor
 * dialog) needed the same chrome -- rather than a third copy of it.
 *
 * `onClose` is optional: the step-up dialogs it was extracted from require an
 * explicit in-dialog choice (Cancel / Not now) and must not be dismissable by
 * a stray click or Escape, so they omit it and keep that behavior unchanged.
 * A purely informational dialog (like the actor-details dialog) passes it to
 * get Escape/backdrop-click/close-button dismissal for free.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-1 shrink-0 rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
