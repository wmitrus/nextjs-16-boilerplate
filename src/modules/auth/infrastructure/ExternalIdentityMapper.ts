export type ExternalAuthProvider = 'clerk' | 'authjs' | 'supabase';

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
}
