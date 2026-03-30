import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class SupabaseRequestIdentitySource implements RequestIdentitySource {
  get(): Promise<RequestIdentitySourceData> {
    throw new Error(
      '[authModule] AUTH_PROVIDER=supabase is not yet implemented. ' +
        'Implement SupabaseRequestIdentitySource.get() before using this provider.',
    );
  }
}
