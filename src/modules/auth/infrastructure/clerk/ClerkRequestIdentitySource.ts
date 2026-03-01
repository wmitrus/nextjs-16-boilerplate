import { auth } from '@clerk/nextjs/server';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class ClerkRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = auth().then(({ userId, orgId, sessionClaims }) => ({
        userId: userId ?? undefined,
        orgId: orgId ?? undefined,
        email:
          typeof sessionClaims?.email === 'string'
            ? sessionClaims.email
            : undefined,
      }));
    }

    return this.cached;
  }
}
