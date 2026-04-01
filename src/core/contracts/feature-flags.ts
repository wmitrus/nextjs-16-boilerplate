import type { AuthorizationContext } from './authorization';

/**
 * Contract for feature flag evaluation.
 *
 * FAIL-SAFE GUARANTEE:
 * Implementations registered via the factory are wrapped in ResilientFeatureFlagService.
 * `isEnabled()` MUST NEVER reject — any infrastructure error (DB unreachable, table
 * missing, SDK timeout, etc.) returns `false` (the "off" state) and logs a warning.
 *
 * Callers must NOT wrap flag evaluation in try/catch. The contract guarantees safety.
 * Missing flags always return `false`.
 */
export interface FeatureFlagService {
  isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>;
}
