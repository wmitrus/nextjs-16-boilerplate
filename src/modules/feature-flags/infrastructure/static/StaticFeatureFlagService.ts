import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

export function parseStaticFlagsEnv(
  raw: string | undefined,
): Record<string, boolean> {
  if (!raw) return {};

  const result: Record<string, boolean> = {};

  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!key) continue;

    result[key] = value === 'true';
  }

  return result;
}

export class StaticFeatureFlagService implements FeatureFlagService {
  private readonly flagMap: Map<string, boolean>;

  constructor(flags: Record<string, boolean> = {}) {
    this.flagMap = new Map(Object.entries(flags));
  }

  async isEnabled(
    flag: string,
    _context: AuthorizationContext,
  ): Promise<boolean> {
    return this.flagMap.get(flag) ?? false;
  }
}
