import type {
  Identity,
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import { UserNotProvisionedError } from '@/core/contracts/identity';

import type { ExternalAuthProvider } from './ExternalIdentityMapper';
import type { InternalIdentityLookup } from './InternalIdentityLookup';

interface RequestScopedIdentityProviderOptions {
  lookup?: InternalIdentityLookup;
  provider?: ExternalAuthProvider;
}

export class RequestScopedIdentityProvider implements IdentityProvider {
  constructor(
    private readonly source: RequestIdentitySource,
    private readonly options: RequestScopedIdentityProviderOptions = {},
  ) {}

  async getCurrentIdentity(): Promise<Identity | null> {
    const { userId, email } = await this.source.get();

    if (!userId) {
      return null;
    }

    if (this.options.lookup && this.options.provider) {
      const internalUserId = await this.options.lookup.findInternalUserId(
        this.options.provider,
        userId,
      );

      if (internalUserId === null) {
        throw new UserNotProvisionedError();
      }

      return { id: internalUserId, email };
    }

    // Edge context-only fallback: no DB lookup configured.
    // Returns external provider ID for authentication-presence checks only.
    // identity.id here is NOT an internal UUID — must not be used for domain operations.
    // See Identity.id invariant in contracts/identity.ts for details.
    return { id: userId, email };
  }
}
