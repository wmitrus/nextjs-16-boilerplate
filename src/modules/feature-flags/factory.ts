import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import type { DrizzleDb } from '@/core/db';
import { resolveServerLogger } from '@/core/logger/di';

import { DrizzleFeatureFlagService } from './infrastructure/drizzle/DrizzleFeatureFlagService';
import { GrowthBookFeatureFlagService } from './infrastructure/growthbook/GrowthBookFeatureFlagService';
import { ResilientFeatureFlagService } from './infrastructure/resilient/ResilientFeatureFlagService';
import {
  StaticFeatureFlagService,
  parseStaticFlagsEnv,
} from './infrastructure/static/StaticFeatureFlagService';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'flags',
  module: 'feature-flags',
});

export interface FeatureFlagFactoryOptions {
  staticFlags?: string;
  db?: DrizzleDb;
  growthbookClientKey?: string;
  growthbookApiHost?: string;
}

function assertSafeGrowthBookApiHost(apiHost: string): void {
  let parsed: URL;
  try {
    parsed = new URL(apiHost);
  } catch {
    throw new Error(
      `[feature-flags] Invalid GROWTHBOOK_API_HOST: "${apiHost}"`,
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[feature-flags] GROWTHBOOK_API_HOST must use https: protocol. Received: "${parsed.protocol}"`,
    );
  }
}

export function createFeatureFlagService(
  provider: 'static' | 'db' | 'growthbook',
  opts: FeatureFlagFactoryOptions = {},
): FeatureFlagService {
  const delegate = createDelegate(provider, opts);
  return new ResilientFeatureFlagService(delegate);
}

function createDelegate(
  provider: 'static' | 'db' | 'growthbook',
  opts: FeatureFlagFactoryOptions,
): FeatureFlagService {
  switch (provider) {
    case 'static':
      return new StaticFeatureFlagService(
        parseStaticFlagsEnv(opts.staticFlags),
      );

    case 'db': {
      if (!opts.db) {
        throw new Error(
          '[feature-flags] FEATURE_FLAG_PROVIDER=db requires a database connection. ' +
            'Ensure DATABASE_URL is set and the DB is reachable.',
        );
      }
      return new DrizzleFeatureFlagService(opts.db);
    }

    case 'growthbook': {
      if (!opts.growthbookClientKey) {
        throw new Error(
          '[feature-flags] FEATURE_FLAG_PROVIDER=growthbook requires GROWTHBOOK_CLIENT_KEY to be set.',
        );
      }
      const apiHost = opts.growthbookApiHost ?? 'https://cdn.growthbook.io';
      assertSafeGrowthBookApiHost(apiHost);
      return new GrowthBookFeatureFlagService({
        clientKey: opts.growthbookClientKey,
        apiHost,
      });
    }

    default: {
      logger.warn(
        { event: 'feature-flag:unknown-provider' },
        '[feature-flags] Unknown FEATURE_FLAG_PROVIDER value. Falling back to static (all flags off).',
      );
      return new StaticFeatureFlagService({});
    }
  }
}
