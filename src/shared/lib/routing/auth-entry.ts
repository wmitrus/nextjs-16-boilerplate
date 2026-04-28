import { env } from '@/core/env';

export function getSignInPath(): string {
  return env.AUTH_PROVIDER === 'authjs' ? '/auth/signin' : '/sign-in';
}
