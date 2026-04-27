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

  const activeOrg = organizations.find((o) => o.id === active);

  async function handleSelect(orgId: string) {
    setActive(orgId);
    setIsOpen(false);

    await fetch('/api/auth/active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: orgId }),
    });

    window.location.reload();
  }

  if (organizations.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select workspace"
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
