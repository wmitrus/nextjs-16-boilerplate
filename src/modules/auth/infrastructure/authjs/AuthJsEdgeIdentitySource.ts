import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';
import { env } from '@/core/env';

/**
 * Edge-safe identity source for AuthJS sessions.
 *
 * Used in proxy.ts (Edge runtime) to extract session identity from the JWT cookie.
 * Reads the session token directly without requiring a Node.js DB connection.
 *
 * IMPORTANT: Only import auth.config.ts (not auth.ts) in Edge context.
 */
export class AuthJsEdgeIdentitySource implements RequestIdentitySource {
  constructor(private readonly request: NextRequest) {}

  async get(): Promise<RequestIdentitySourceData> {
    try {
      const token = await getToken({
        req: this.request,
        secret:
          env.NEXTAUTH_SECRET ??
          (env.NODE_ENV === 'development'
            ? 'dev-secret-change-in-production'
            : undefined),
      });

      if (!token) {
        return {};
      }

      const userId =
        typeof token.id === 'string'
          ? token.id
          : typeof token.sub === 'string'
            ? token.sub
            : undefined;
      const email = typeof token.email === 'string' ? token.email : undefined;
      const emailVerified = token.emailVerified === true;

      return {
        userId,
        email,
        emailVerified,
      };
    } catch {
      return {};
    }
  }
}
