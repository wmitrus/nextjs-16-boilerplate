import type { AuthorizationContext } from './authorization';

export type { AuthorizationContext };

export interface RoleRepository {
  getRoles(subjectId: string, tenantId: string): Promise<string[]>;
}

export interface PermissionRepository {
  getPermissions(roleId: string): Promise<string[]>;
}

export interface MembershipRepository {
  getMemberships(subjectId: string): Promise<string[]>;
}

export interface Policy {
  effect: 'allow' | 'deny';
  actions: string[];
  resource: string;
  condition?: (context: AuthorizationContext) => Promise<boolean> | boolean;
}

export interface PolicyRepository {
  getPolicies(context: AuthorizationContext): Promise<Policy[]>;
}
