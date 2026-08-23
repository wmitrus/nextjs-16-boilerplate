/**
 * A platform-level operational switch: a boolean an operator can flip to
 * degrade or re-tighten a control at runtime.
 *
 * Deliberately **not** `FeatureFlagService`. That contract takes an
 * `AuthorizationContext` (tenant + subject + resource + action), and the
 * controls these switches guard run *before* authentication -- sign-in,
 * sign-up, password reset. There is no tenant and no subject to pass, and
 * fabricating one at each call site is exactly the ad-hoc feature-flag
 * coupling this repository's architecture rules forbid. Translating this
 * port onto the tenant-scoped flag contract is an adapter's job, done once,
 * not the caller's.
 *
 * ## Resolution order and why the override is loosen-only
 *
 * An implementation may layer a runtime override (feature flag) over a
 * deploy-time base (env). The override may only ever return `true` to take
 * effect:
 *
 * ```
 * result = (override === true) ? true : base
 * ```
 *
 * This is not a stylistic choice. `FeatureFlagService.isEnabled()` returns a
 * plain `boolean`, and `ResilientFeatureFlagService` answers `false` when its
 * delegate throws -- so "the operator set this to false" and "the flag store
 * is unreachable" arrive as the same value. A two-directional override would
 * therefore flip the base config in an arbitrary direction during any flag
 * outage.
 *
 * Loosen-only makes the failure direction safe by construction: an
 * unreachable override cannot relax a security control, it can only fail to
 * relax one.
 */
export interface OperationalSwitch {
  /**
   * Resolves the switch named `key`.
   *
   * Implementations must not throw: an unresolvable switch falls back to its
   * deploy-time base rather than surfacing an error into the control it
   * guards.
   */
  isOn(key: OperationalSwitchKey): Promise<boolean>;
}

/**
 * The closed set of switches. A literal union rather than `string` so a typo
 * is a compile error and so every switch in the system is greppable from one
 * place -- these degrade security controls, and an unnoticed dead switch is
 * worse than no switch.
 */
export type OperationalSwitchKey = 'strict_rate_limit_degrade';

export const OPERATIONAL_SWITCH_KEYS = {
  /**
   * When on, strict rate limiting stops failing closed and falls back to the
   * process-local counter, as non-strict mode does.
   *
   * Intended for one situation: the durable secondary is itself misbehaving
   * (slow, contended, falsely rejecting) while the database is otherwise
   * healthy. It is **not** an escape hatch for "both stores are down" -- in
   * that case every endpoint guarded by strict mode already needs a database
   * it cannot reach, so nothing is gained by letting the rate limiter
   * through. See SEC-42.
   */
  STRICT_RATE_LIMIT_DEGRADE: 'strict_rate_limit_degrade',
} as const satisfies Record<string, OperationalSwitchKey>;
