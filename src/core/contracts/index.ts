export const INFRASTRUCTURE = {
  DB: Symbol('Database'),
};

export const AUTH = {
  IDENTITY_SOURCE: Symbol('IdentitySource'),
  IDENTITY_PROVIDER: Symbol('IdentityProvider'),
  TENANT_RESOLVER: Symbol('TenantResolver'),
  USER_REPOSITORY: Symbol('UserRepository'),
};

export const AUTHORIZATION = {
  SERVICE: Symbol('AuthorizationService'),
  ROLE_REPOSITORY: Symbol('RoleRepository'),
  MEMBERSHIP_REPOSITORY: Symbol('MembershipRepository'),
  POLICY_REPOSITORY: Symbol('PolicyRepository'),
  TENANT_ATTRIBUTES_REPOSITORY: Symbol('TenantAttributesRepository'),
};

export const FEATURE_FLAGS = {
  SERVICE: Symbol('FeatureFlagService'),
};

export const LOGGER = {
  SERVER: Symbol('ServerLogger'),
  EDGE: Symbol('EdgeLogger'),
};
