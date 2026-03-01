import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class AuthJsRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = (async () => {
        throw new Error('AuthJsRequestIdentitySource: not implemented');
      })();
    }

    return this.cached;
  }
}
