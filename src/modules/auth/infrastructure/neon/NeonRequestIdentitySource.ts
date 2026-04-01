import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

/**
 * Placeholder adapter for a future Neon Auth integration.
 *
 * This fails fast intentionally. Neon is not yet wired into the current
 * session, proxy, or sign-in/sign-up delivery boundaries.
 */
export class NeonRequestIdentitySource implements RequestIdentitySource {
  get(): Promise<RequestIdentitySourceData> {
    throw new Error(
      '[authModule] AUTH_PROVIDER=neon is not yet implemented. ' +
        'Implement NeonRequestIdentitySource.get() and the Neon-specific session/UI integration before using this provider.',
    );
  }
}
