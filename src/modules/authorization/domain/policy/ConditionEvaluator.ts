import type { AuthorizationContext } from '@/core/contracts/repositories';

/**
 * Pure ABAC condition builders.
 *
 * Each function returns a Policy-compatible condition:
 *   condition: (ctx: AuthorizationContext) => boolean
 *
 * Rules:
 * - No side effects.
 * - No framework imports.
 * - No async unless unavoidable.
 * - Compose freely inside Policy definitions.
 */

/**
 * Allow only if the subject is the owner of the resource.
 * Compares subject.id with resource.id.
 */
export function isOwner(ctx: AuthorizationContext): boolean {
  return ctx.resource.id !== undefined && ctx.subject.id === ctx.resource.id;
}

/**
 * Allow only if the subject has a specific attribute value.
 *
 * @example
 * condition: (ctx) => hasAttribute(ctx, 'plan', 'pro')
 */
export function hasAttribute(
  ctx: AuthorizationContext,
  key: string,
  value: unknown,
): boolean {
  const attributes = ctx.subject.attributes;
  if (!attributes) {
    return false;
  }

  for (const [attributeName, attributeValue] of Object.entries(attributes)) {
    if (attributeName === key) {
      return attributeValue === value;
    }
  }

  return false;
}

/**
 * Allow only if the request time is before the given hour (0–23, UTC).
 *
 * @example
 * condition: (ctx) => isBeforeHour(ctx, 18) // deny after 18:00 UTC
 */
export function isBeforeHour(ctx: AuthorizationContext, hour: number): boolean {
  const time = ctx.environment?.time ?? new Date();
  return time.getUTCHours() < hour;
}

/**
 * Allow only if the request time is after the given hour (0–23, UTC).
 *
 * @example
 * condition: (ctx) => isAfterHour(ctx, 8) // deny before 08:00 UTC
 */
export function isAfterHour(ctx: AuthorizationContext, hour: number): boolean {
  const time = ctx.environment?.time ?? new Date();
  return time.getUTCHours() >= hour;
}

/**
 * Allow only if the request IP is in the provided allow-list.
 * Performs exact string match. For CIDR ranges, use a dedicated IP library.
 *
 * @example
 * condition: (ctx) => isFromAllowedIp(ctx, ['127.0.0.1', '10.0.0.1'])
 */
export function isFromAllowedIp(
  ctx: AuthorizationContext,
  allowList: string[],
): boolean {
  const ip = ctx.environment?.ip;
  if (!ip) return false;
  return allowList.includes(ip);
}

/**
 * Allow only if the request IP is NOT in the provided block-list.
 *
 * Denies when the request IP cannot be established at all -- see the note in
 * the body.
 *
 * @example
 * condition: (ctx) => isNotFromBlockedIp(ctx, ['192.168.1.100'])
 */
export function isNotFromBlockedIp(
  ctx: AuthorizationContext,
  blockList: string[],
): boolean {
  const ip = ctx.environment?.ip;
  // SEC-43: an unidentifiable client fails this condition rather than passing
  // it. This branch used to be unreachable -- `getIP()` returned `127.0.0.1`
  // when it had nothing, so `ip` was always set -- and it returned `true`,
  // meaning "not blocked". Once an unknown client became a real state, that
  // reading would have let anyone whose IP cannot be established walk past
  // an IP block-list simply by arriving without a trustworthy header.
  //
  // "I cannot tell whether you are blocked" is not "you are not blocked".
  if (!ip) return false;
  return !blockList.includes(ip);
}
