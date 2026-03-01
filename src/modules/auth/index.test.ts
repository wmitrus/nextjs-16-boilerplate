import { describe, expect, it } from 'vitest';

import { createContainer } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { UserRepository } from '@/core/contracts/user';

import { ClerkUserRepository } from './infrastructure/ClerkUserRepository';

import { createAuthModule } from './index';

describe('createAuthModule', () => {
  it('registers Clerk user repository for clerk provider', () => {
    const container = createContainer();
    const authModule = createAuthModule({ authProvider: 'clerk' });

    authModule.register(container);

    const userRepository = container.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
    );

    expect(userRepository).toBeInstanceOf(ClerkUserRepository);
  });

  it('fails fast for authjs until dedicated user repository exists', () => {
    const container = createContainer();
    const authModule = createAuthModule({ authProvider: 'authjs' });

    expect(() => authModule.register(container)).toThrow(
      'AUTH_PROVIDER=authjs requires a dedicated UserRepository implementation.',
    );
  });

  it('fails fast for supabase until dedicated user repository exists', () => {
    const container = createContainer();
    const authModule = createAuthModule({ authProvider: 'supabase' });

    expect(() => authModule.register(container)).toThrow(
      'AUTH_PROVIDER=supabase requires a dedicated UserRepository implementation.',
    );
  });
});
