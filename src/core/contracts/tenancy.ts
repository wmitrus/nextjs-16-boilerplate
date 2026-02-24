import type { Identity } from './identity';

export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
}

export interface TenantResolver {
  resolve(identity: Identity): Promise<TenantContext>;
}
