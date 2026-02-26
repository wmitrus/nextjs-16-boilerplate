import type {
  AuthorizationContext,
  AuthorizationService,
} from '@/core/contracts/authorization';

import type { UserRole } from '@/security/core/security-context';

export class AuthorizationError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthorizationFacade {
  constructor(private readonly authorizationService: AuthorizationService) {}

  ensureRequiredRole(
    currentRole: UserRole | undefined,
    requiredRole: UserRole,
  ) {
    if (!currentRole) {
      throw new AuthorizationError('Authentication required');
    }

    if (requiredRole === 'admin' && currentRole !== 'admin') {
      throw new AuthorizationError(`Required role: ${requiredRole}`);
    }
  }

  async can(context: AuthorizationContext): Promise<boolean> {
    return this.authorizationService.can(context);
  }

  async authorize(
    context: AuthorizationContext,
    message: string = 'Unauthorized',
  ): Promise<void> {
    const allowed = await this.can(context);
    if (!allowed) {
      throw new AuthorizationError(message);
    }
  }
}
