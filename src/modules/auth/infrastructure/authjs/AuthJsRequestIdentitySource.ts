import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class AuthJsRequestIdentitySource implements RequestIdentitySource {
  async get(): Promise<RequestIdentitySourceData> {
    throw new Error('AuthJsRequestIdentitySource: not implemented');
  }
}
