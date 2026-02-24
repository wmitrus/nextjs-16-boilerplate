export const AUTH = {
  IDENTITY_PROVIDER: Symbol('IdentityProvider'),
  TENANT_RESOLVER: Symbol('TenantResolver'),
};

export const AUTHORIZATION = {
  SERVICE: Symbol('AuthorizationService'),
  ROLE_REPOSITORY: Symbol('RoleRepository'),
  PERMISSION_REPOSITORY: Symbol('PermissionRepository'),
  MEMBERSHIP_REPOSITORY: Symbol('MembershipRepository'),
  POLICY_REPOSITORY: Symbol('PolicyRepository'),
};
