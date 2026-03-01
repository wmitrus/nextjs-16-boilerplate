import type {
  AuthorizationContext,
  AuthorizationService,
} from '@/core/contracts/authorization';

export class AuthorizationError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthorizationFacade {
  constructor(private readonly authorizationService: AuthorizationService) {}

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
