import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class SupabaseRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = (async () => {
        throw new Error('SupabaseRequestIdentitySource: not implemented');
      })();
    }

    return this.cached;
  }
}
