'use client';

import { useState } from 'react';

interface Organization {
  id: string;
  name: string;
}

interface AuthJsWorkspaceSwitcherProps {
  organizations: Organization[];
  activeOrganizationId?: string;
}

/**
 * DB-based workspace (organization) switcher for AUTH_PROVIDER=authjs.
 *
 * Reads organizations passed from the server and stores the active selection
 * in a cookie (handled by the API route).
 */
export function AuthJsWorkspaceSwitcher({
  organizations,
  activeOrganizationId,
}: AuthJsWorkspaceSwitcherProps) {
  const [active, setActive] = useState(activeOrganizationId);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeOrg = organizations.find((o) => o.id === active);

  async function handleSelect(orgId: string) {
    if (orgId === active) {
      setIsOpen(false);
      return;
    }

    setErrorMessage(null);
    setIsOpen(false);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/active-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? 'Failed to switch organization');
      }

      setActive(orgId);
      window.location.reload();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (organizations.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {errorMessage ? (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{activeOrg?.name ?? 'Select organization'}</span>
        <svg
          className="h-4 w-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {organizations.map((org) => (
            <li key={org.id} role="option" aria-selected={org.id === active}>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSelect(org.id)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {org.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
