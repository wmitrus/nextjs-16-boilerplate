import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class SystemIdentitySource implements RequestIdentitySource {
  async get(): Promise<RequestIdentitySourceData> {
    return {
      userId: 'system',
      orgId: 'system',
      email: undefined,
    };
  }
}
