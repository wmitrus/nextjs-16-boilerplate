import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class AuthJsRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = (async (): Promise<RequestIdentitySourceData> => {
        // TODO: Implement Auth.js session resolution.
        // Auth.js does not provide org/tenant claims by default.
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
