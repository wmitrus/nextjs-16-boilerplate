import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { Policy } from '@/core/contracts/repositories';

import {
  hasAttribute,
  isFromAllowedIp,
  isNotFromBlockedIp,
  isOwner,
} from '../../domain/policy/ConditionEvaluator';

type ConditionDescriptor =
  | { type: 'hasAttribute'; key: string; value: unknown }
  | { type: 'isOwner' }
  | { type: 'isFromAllowedIp'; ips: string[] }
  | { type: 'isNotFromBlockedIp'; ips: string[] };

export function deserializeCondition(
  conditions: Record<string, unknown> | null | undefined,
): Policy['condition'] {
  if (!conditions) return undefined;

  const descriptor = conditions as ConditionDescriptor;

  switch (descriptor.type) {
    case 'hasAttribute':
      return (ctx: AuthorizationContext) =>
        hasAttribute(ctx, descriptor.key, descriptor.value);
    case 'isOwner':
      return (ctx: AuthorizationContext) => isOwner(ctx);
    case 'isFromAllowedIp':
      return (ctx: AuthorizationContext) =>
        isFromAllowedIp(ctx, descriptor.ips);
    case 'isNotFromBlockedIp':
      return (ctx: AuthorizationContext) =>
        isNotFromBlockedIp(ctx, descriptor.ips);
    default:
      return undefined;
  }
}
