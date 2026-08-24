import { env, isDeployedEnvironmentValues } from '@/core/env';
import { hasAppSecurityMasterKey } from '@/core/security/app-keys';

/**
 * Step-up policy constants (SEC-48).
 *
 * Deliberately **not** environment-configurable. A tunable freshness window
 * is one more security knob that can be set wrong, and this repository has no
 * use case that needs a different value: 15 minutes is one policy, expressed
 * once, in code.
 */
export const STEP_UP_TTL_SECONDS = 15 * 60;

/**
 * The assurance level an admin mutation requires.
 *
 * `mfa` means *two distinct factors, verified recently*. A password alone
 * never satisfies it, no matter how recently it was typed -- that is
 * re-authentication, not multi-factor authentication.
 */
export const REQUIRED_ASSURANCE = 'mfa' as const;
export type AssuranceLevel = typeof REQUIRED_ASSURANCE;

/**
 * Authentication methods, named the way OIDC's `amr` names them, so the proof
 * describes *what kind of factor* was verified rather than which provider or
 * SDK verified it. Nothing downstream may branch on "Clerk" or "otplib".
 */
export type AuthenticationMethod = 'pwd' | 'otp' | 'recovery';

export type StepUpEnforcement =
  | { readonly mode: 'required' }
  | { readonly mode: 'bypassed'; readonly reason: 'local-only-bypass' }
  | { readonly mode: 'unavailable'; readonly reason: 'missing_key_material' };

/**
 * Resolves how the guard must behave in this environment.
 *
 * Three outcomes, and the ordering between them is the whole point:
 *
 * - `bypassed` is reachable **only** on a non-deployed environment. The env
 *   schema already rejects the bypass in production/preview at startup
 *   (`validateAppSecurityConfigValues`); this second, runtime check is
 *   deliberate defence in depth, because a bypass that depends on exactly one
 *   check being correct is a bypass one mistake away from production.
 * - `unavailable` (no key material) is **not** a bypass. It fails closed: a
 *   proof can neither be minted nor verified, so the mutation is refused.
 *   Missing configuration means required, never permitted.
 * - `required` is the default for everything else, including an unset
 *   variable.
 */
export function resolveStepUpEnforcement(): StepUpEnforcement {
  const deployed = isDeployedEnvironmentValues(env.NODE_ENV, env.VERCEL_ENV);

  if (env.ADMIN_STEP_UP_MODE === 'bypass-local-only' && !deployed) {
    return { mode: 'bypassed', reason: 'local-only-bypass' };
  }

  if (!hasAppSecurityMasterKey()) {
    return { mode: 'unavailable', reason: 'missing_key_material' };
  }

  return { mode: 'required' };
}
