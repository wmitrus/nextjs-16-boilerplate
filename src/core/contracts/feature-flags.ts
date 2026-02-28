import type { AuthorizationContext } from './authorization';

export interface FeatureFlagService {
  isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>;
}
