'use client';

import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Provider-agnostic sign-out hook.
 *
 * Wraps the active auth provider's sign-out mechanism.
 * Currently delegates to Clerk. Phase 7 will swap in AuthJS equivalent.
 *
 * Callers outside src/modules/auth/ MUST import from here — never from
 * @clerk/nextjs directly. This preserves provider-switching capability.
 */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useClerk();
  const router = useRouter();

  return useCallback(async () => {
    try {
      await signOut();
      router.push('/sign-in');
    } catch {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full-reload fallback: signOut() itself failed, so a client-side router transition cannot be trusted to reflect a clean auth state; force the browser to refetch everything.
      window.location.href = '/sign-in';
    }
  }, [signOut, router]);
}
