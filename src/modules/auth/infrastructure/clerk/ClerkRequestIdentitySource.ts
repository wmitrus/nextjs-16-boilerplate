import { auth } from '@clerk/nextjs/server';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class ClerkRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = auth().then(
        ({ userId, orgId, orgRole, sessionClaims }) => ({
          userId: userId ?? undefined,
          email:
            typeof sessionClaims?.email === 'string'
              ? sessionClaims.email
              : undefined,
          tenantExternalId: orgId ?? undefined,
          tenantRole: orgRole ?? undefined,
        }),
      );
    }

    return this.cached;
  }
}
