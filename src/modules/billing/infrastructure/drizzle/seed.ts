import type { DrizzleDb } from '@/core/db';

import { subscriptionsTable } from './schema';

import type { AuthSeedResult } from '@/modules/authorization/infrastructure/drizzle/seed';

export interface SubscriptionRecord {
  id: string;
  tenantId: string;
  provider: string;
  providerSubscriptionId: string;
  status: 'active';
}

export interface BillingSeedResult {
  subscriptions: {
    acme: SubscriptionRecord;
    globex: SubscriptionRecord;
  };
}

function buildSubscriptions(
  tenants: AuthSeedResult['tenants'],
): Record<'acme' | 'globex', SubscriptionRecord> {
  return {
    acme: {
      id: '40000000-0000-0000-0000-000000000001',
      tenantId: tenants.acme.id,
      provider: 'stripe',
      providerSubscriptionId: 'sub_acme_dev_001',
      status: 'active',
    },
    globex: {
      id: '40000000-0000-0000-0000-000000000002',
      tenantId: tenants.globex.id,
      provider: 'stripe',
      providerSubscriptionId: 'sub_globex_dev_001',
      status: 'active',
    },
  };
}

export async function seedBilling(
  db: DrizzleDb,
  deps: { tenants: AuthSeedResult['tenants'] },
): Promise<BillingSeedResult> {
  const subscriptions = buildSubscriptions(deps.tenants);

  await db
    .insert(subscriptionsTable)
    .values(Object.values(subscriptions))
    .onConflictDoNothing();

  return { subscriptions };
}
