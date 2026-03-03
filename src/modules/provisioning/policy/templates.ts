import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

/**
 * Current policy template version.
 * Increment this when adding or changing default policies.
 *
 * INVARIANT: Never decrement — stored versions in DB are compared with < operator.
 */
export const POLICY_TEMPLATE_VERSION = 1;

export interface PolicyTemplate {
  readonly effect: 'allow';
  readonly resource: string;
  readonly actions: string[];
  readonly conditions?: Record<string, unknown>;
}

/**
 * Default policies for the `owner` role.
 * Owners have full access to all application resources within their tenant.
 *
 * INVARIANT: No wildcard resources or actions (resource='*', actions=['*']).
 */
export const ownerPolicies: readonly PolicyTemplate[] = [
  {
    effect: 'allow',
    resource: RESOURCES.ROUTE,
    actions: [ACTIONS.ROUTE_ACCESS],
  },
  {
    effect: 'allow',
    resource: RESOURCES.USER,
    actions: [
      ACTIONS.USER_READ,
      ACTIONS.USER_UPDATE,
      ACTIONS.USER_INVITE,
      ACTIONS.USER_DEACTIVATE,
    ],
  },
  {
    effect: 'allow',
    resource: RESOURCES.TENANT,
    actions: [
      ACTIONS.TENANT_READ,
      ACTIONS.TENANT_UPDATE,
      ACTIONS.TENANT_MANAGE_MEMBERS,
    ],
  },
  {
    effect: 'allow',
    resource: RESOURCES.BILLING,
    actions: [ACTIONS.BILLING_READ, ACTIONS.BILLING_UPDATE],
  },
  {
    effect: 'allow',
    resource: RESOURCES.SECURITY,
    actions: [ACTIONS.SECURITY_READ_AUDIT, ACTIONS.SECURITY_MANAGE_POLICIES],
  },
];

/**
 * Default policies for the `member` role.
 * Members have read-only access to tenant resources and can manage their own profile.
 *
 * Self-access conditions restrict user:read and user:update to the requesting user's own record.
 *
 * INVARIANT: No wildcard resources or actions (resource='*', actions=['*']).
 */
export const memberPolicies: readonly PolicyTemplate[] = [
  {
    effect: 'allow',
    resource: RESOURCES.ROUTE,
    actions: [ACTIONS.ROUTE_ACCESS],
  },
  {
    effect: 'allow',
    resource: RESOURCES.USER,
    actions: [ACTIONS.USER_READ],
    conditions: { 'subject.userId': { $eq: 'resource.userId' } },
  },
  {
    effect: 'allow',
    resource: RESOURCES.USER,
    actions: [ACTIONS.USER_UPDATE],
    conditions: { 'subject.userId': { $eq: 'resource.userId' } },
  },
  {
    effect: 'allow',
    resource: RESOURCES.TENANT,
    actions: [ACTIONS.TENANT_READ],
  },
  {
    effect: 'allow',
    resource: RESOURCES.BILLING,
    actions: [ACTIONS.BILLING_READ],
  },
];
