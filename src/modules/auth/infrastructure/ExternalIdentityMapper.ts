import type { ExternalAuthProvider } from '@/core/contracts/identity';

export type { ExternalAuthProvider } from '@/core/contracts/identity';

export interface ExternalIdentityMapper {
  resolveOrCreateInternalUserId(args: {
    provider: ExternalAuthProvider;
    externalUserId: string;
    email?: string;
  }): Promise<string>;

  resolveOrCreateInternalTenantId(args: {
    provider: ExternalAuthProvider;
    externalTenantId: string;
  }): Promise<string>;

  ensureTenantAccess(args: {
    internalUserId: string;
    internalTenantId: string;
  }): Promise<void>;
}
