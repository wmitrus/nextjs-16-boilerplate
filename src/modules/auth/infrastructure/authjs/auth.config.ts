import type { NextAuthOptions } from 'next-auth';

export const AUTHJS_SIGNIN_PAGE = '/auth/signin';

/**
 * Edge-safe Auth.js configuration.
 *
 * IMPORTANT: This file must remain Edge-safe.
 * - No bcrypt, no DB imports, no Node-only APIs.
 * - Used in proxy.ts (Edge runtime) via AuthJsEdgeIdentitySource.
 * - Extended by auth.ts (Node runtime) with the Credentials provider.
 */
export const authConfig: Pick<
  NextAuthOptions,
  'pages' | 'session' | 'cookies'
> = {
  pages: {
    signIn: AUTHJS_SIGNIN_PAGE,
    error: AUTHJS_SIGNIN_PAGE,
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
};
