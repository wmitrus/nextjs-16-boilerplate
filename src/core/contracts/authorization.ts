import type { TenantContext } from './tenancy';

export interface SubjectContext {
  id: string;
  attributes?: Record<string, unknown>;
}

export interface ResourceContext {
  type: string;
  id?: string;
  attributes?: Record<string, unknown>;
}

export interface AuthorizationContext {
  tenant: TenantContext;
  subject: SubjectContext;
  resource: ResourceContext;
  action: string;
  attributes?: Record<string, unknown>;
}

export interface AuthorizationService {
  can(context: AuthorizationContext): Promise<boolean>;
}
