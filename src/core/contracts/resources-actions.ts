import { createAction, isAction } from './authorization';

export const RESOURCES = {
  ROUTE: 'route',
  USER: 'user',
  TENANT: 'tenant',
  BILLING: 'billing',
  SECURITY: 'security',
  PROVISIONING: 'provisioning',
} as const;

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES];

export const ACTIONS = {
  ROUTE_ACCESS: createAction(RESOURCES.ROUTE, 'access'),

  USER_READ: createAction(RESOURCES.USER, 'read'),
  USER_UPDATE: createAction(RESOURCES.USER, 'update'),
  USER_INVITE: createAction(RESOURCES.USER, 'invite'),
  USER_DEACTIVATE: createAction(RESOURCES.USER, 'deactivate'),

  TENANT_READ: createAction(RESOURCES.TENANT, 'read'),
  TENANT_UPDATE: createAction(RESOURCES.TENANT, 'update'),
  TENANT_MANAGE_MEMBERS: createAction(RESOURCES.TENANT, 'manage_members'),

  BILLING_READ: createAction(RESOURCES.BILLING, 'read'),
  BILLING_UPDATE: createAction(RESOURCES.BILLING, 'update'),

  SECURITY_READ_AUDIT: createAction(RESOURCES.SECURITY, 'read_audit'),
  SECURITY_MANAGE_POLICIES: createAction(RESOURCES.SECURITY, 'manage_policies'),

  PROVISIONING_ENSURE: createAction(RESOURCES.PROVISIONING, 'ensure'),
} as const;

export type ActionKey = keyof typeof ACTIONS;
export type AppAction = (typeof ACTIONS)[ActionKey];

export { isAction };
