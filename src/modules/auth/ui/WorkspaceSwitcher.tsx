'use client';

import { OrganizationSwitcher } from '@clerk/nextjs';

import { AuthJsWorkspaceSwitcher } from './authjs/AuthJsWorkspaceSwitcher';

interface WorkspaceSwitcherProps {
  hidePersonal?: boolean;
  createOrganizationMode?: 'modal';
  afterSelectOrganizationUrl?: string;
  afterCreateOrganizationUrl?: string;
  authProvider?: string;
  authjsOrganizations?: Array<{ id: string; name: string }>;
  authjsActiveOrganizationId?: string;
}

/**
 * Provider-agnostic workspace switcher component.
 *
 * - AUTH_PROVIDER=clerk: delegates to Clerk's OrganizationSwitcher.
 * - AUTH_PROVIDER=authjs: renders AuthJsWorkspaceSwitcher (DB-based).
 *
 * Components outside src/modules/auth/ MUST import from here — never from
 * @clerk/nextjs directly. This preserves provider-switching capability.
 */
export function WorkspaceSwitcher({
  hidePersonal,
  createOrganizationMode,
  afterSelectOrganizationUrl,
  afterCreateOrganizationUrl,
  authProvider,
  authjsOrganizations,
  authjsActiveOrganizationId,
}: WorkspaceSwitcherProps) {
  if (authProvider === 'authjs') {
    return (
      <AuthJsWorkspaceSwitcher
        organizations={authjsOrganizations ?? []}
        activeOrganizationId={authjsActiveOrganizationId}
      />
    );
  }

  return (
    <OrganizationSwitcher
      hidePersonal={hidePersonal}
      createOrganizationMode={createOrganizationMode}
      afterSelectOrganizationUrl={afterSelectOrganizationUrl}
      afterCreateOrganizationUrl={afterCreateOrganizationUrl}
    />
  );
}
