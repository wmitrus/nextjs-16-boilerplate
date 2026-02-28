import { auth } from '@clerk/nextjs/server';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class ClerkRequestIdentitySource implements RequestIdentitySource {
  async get(): Promise<RequestIdentitySourceData> {
    const { userId, orgId, sessionClaims } = await auth();

    return {
      userId: userId ?? undefined,
      orgId: orgId ?? undefined,
      email:
        typeof sessionClaims?.email === 'string'
          ? sessionClaims.email
          : undefined,
    };
  }
}
