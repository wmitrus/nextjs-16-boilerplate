import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class SupabaseRequestIdentitySource implements RequestIdentitySource {
  async get(): Promise<RequestIdentitySourceData> {
    throw new Error('SupabaseRequestIdentitySource: not implemented');
  }
}
