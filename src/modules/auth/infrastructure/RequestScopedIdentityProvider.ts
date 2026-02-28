import type {
  Identity,
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';

export class RequestScopedIdentityProvider implements IdentityProvider {
  constructor(private readonly source: RequestIdentitySource) {}

  async getCurrentIdentity(): Promise<Identity | null> {
    const { userId, email } = await this.source.get();

    if (!userId) {
      return null;
    }

    return { id: userId, email };
  }
}
