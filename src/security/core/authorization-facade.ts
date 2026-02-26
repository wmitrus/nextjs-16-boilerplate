import type {
  AuthorizationContext,
  AuthorizationService,
} from '@/core/contracts/authorization';
import { ROLE_HIERARCHY } from '@/core/contracts/roles';
import type { UserRole } from '@/core/contracts/roles';

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

    const currentLevel = ROLE_HIERARCHY[currentRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

    if (currentLevel < requiredLevel) {
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
