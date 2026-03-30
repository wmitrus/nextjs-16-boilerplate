import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class AuthJsRequestIdentitySource implements RequestIdentitySource {
  get(): Promise<RequestIdentitySourceData> {
    throw new Error(
      '[authModule] AUTH_PROVIDER=authjs is not yet implemented. ' +
        'Implement AuthJsRequestIdentitySource.get() before using this provider.',
    );
  }
}
