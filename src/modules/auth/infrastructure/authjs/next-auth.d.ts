import type { DefaultSession, DefaultUser } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      emailVerified?: boolean;
      /**
       * The JWT's own `iat` claim (Unix seconds), surfaced so the central
       * access evaluators can compare it against `users.sessions_valid_from`
       * and reject sessions minted before a password reset. See SEC-36.
       */
      sessionIssuedAt?: number;
    };
  }

  interface User extends DefaultUser {
    emailVerified?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string;
    emailVerified?: boolean;
  }
}
