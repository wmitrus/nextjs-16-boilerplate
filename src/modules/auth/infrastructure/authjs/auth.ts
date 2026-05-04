import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { AuthOptions, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { userCredentialsTable } from '../drizzle/schema';

import { authConfig } from './auth.config';

import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

function getLogger() {
  return resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs',
  });
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

function getDb(): DrizzleDb {
  return getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);
}

export const authOptions: AuthOptions = {
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        try {
          const db = getDb();

          const [credRecord] = await db
            .select({
              userId: userCredentialsTable.userId,
              hashedPassword: userCredentialsTable.hashedPassword,
              emailVerified: userCredentialsTable.emailVerified,
            })
            .from(userCredentialsTable)
            .where(eq(userCredentialsTable.email, email))
            .limit(1);

          if (!credRecord) {
            const [userExists] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.email, email))
              .limit(1);

            if (userExists) {
              throw new Error('NoCredentials');
            }

            return null;
          }

          const passwordValid = await compare(
            password,
            credRecord.hashedPassword,
          );
          if (!passwordValid) {
            return null;
          }

          const [user] = await db
            .select({ id: usersTable.id, email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.id, credRecord.userId))
            .limit(1);

          if (!user) {
            return null;
          }

          if (!credRecord.emailVerified) {
            throw new Error('EmailNotVerified');
          }

          getLogger().debug(
            {
              event: 'auth:credentials_sign_in',
              provider: 'authjs',
              emailVerified: credRecord.emailVerified,
            },
            'AuthJS credentials sign-in successful',
          );

          return {
            id: user.email,
            email: user.email,
            emailVerified: credRecord.emailVerified,
          };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));

          if (
            error.message === 'NoCredentials' ||
            error.message === 'EmailNotVerified'
          ) {
            throw error;
          }

          getLogger().error(
            {
              event: 'auth:credentials_sign_in_error',
              errorMessage: error.message,
              errorName: error.name,
            },
            'AuthJS credentials sign-in error',
          );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      const typedUser = user as
        | { id?: string; emailVerified?: boolean }
        | undefined;
      if (typedUser) {
        token.id = typedUser.id;
        token.emailVerified = typedUser.emailVerified ?? false;
      }
      return token;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? '';
        session.user.emailVerified =
          (token.emailVerified as boolean | undefined) ?? false;
      }
      return session;
    },
  },
  secret:
    env.NEXTAUTH_SECRET ??
    (env.NODE_ENV === 'development'
      ? 'dev-secret-change-in-production'
      : undefined),
};
