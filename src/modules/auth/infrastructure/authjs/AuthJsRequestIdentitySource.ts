import { getServerSession } from 'next-auth/next';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';
import { resolveServerLogger } from '@/core/logger/di';

import { authOptions } from './auth';

function getLogger() {
  return resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs-request-identity-source',
  });
}

export class AuthJsRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = this.resolveIdentity();
    }
    return this.cached;
  }

  private async resolveIdentity(): Promise<RequestIdentitySourceData> {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user) {
        getLogger().debug(
          { event: 'auth:identity_unauthenticated', provider: 'authjs' },
          'AuthJS session not found — unauthenticated request',
        );
        return {};
      }

      const userId = session.user.id;
      const email = session.user.email ?? undefined;
      const emailVerified = session.user.emailVerified === true;

      getLogger().debug(
        {
          event: 'auth:identity_claims_resolved',
          provider: 'authjs',
          hasUserId: Boolean(userId),
          hasEmail: Boolean(email),
          emailVerified,
        },
        'Resolved AuthJS identity claims from session',
      );

      return {
        userId,
        email,
        emailVerified,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      getLogger().error(
        {
          event: 'auth:identity_resolution_error',
          provider: 'authjs',
          errorMessage: error.message,
          errorName: error.name,
        },
        'Failed to resolve AuthJS identity from session',
      );
      return {};
    }
  }
}
