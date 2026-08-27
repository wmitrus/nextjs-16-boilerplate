export type AdminOrganizationsScope =
  | {
      kind: 'organization';
      organizationId: string;
    }
  | {
      kind: 'active-tenant';
      activeOrganizationId: string;
    };

export function createAdminOrganizationsScope(input: {
  activeOrganizationId: string;
  isPlatformAdmin: boolean;
}): AdminOrganizationsScope {
  if (input.isPlatformAdmin) {
    return {
      kind: 'active-tenant',
      activeOrganizationId: input.activeOrganizationId,
    };
  }

  return {
    kind: 'organization',
    organizationId: input.activeOrganizationId,
  };
}
