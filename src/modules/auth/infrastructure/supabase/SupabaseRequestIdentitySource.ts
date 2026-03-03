import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class SupabaseRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = (async (): Promise<RequestIdentitySourceData> => {
        // TODO: Implement Supabase session resolution.
        // Supabase does not provide org/tenant claims by default.
        // tenantExternalId and tenantRole are always undefined for this provider.
        return {
          userId: undefined,
          email: undefined,
          emailVerified: undefined,
          tenantExternalId: undefined,
          tenantRole: undefined,
        };
      })();
    }

    return this.cached;
  }
}
