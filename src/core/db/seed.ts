import type { DrizzleDb } from './types';

import {
  seedAuthorization,
  type AuthSeedResult,
} from '@/modules/authorization/infrastructure/drizzle/seed';
import {
  seedBilling,
  type BillingSeedResult,
} from '@/modules/billing/infrastructure/drizzle/seed';
import {
  seedUsers,
  type UserSeedResult,
} from '@/modules/user/infrastructure/drizzle/seed';

export type { UserSeedResult, AuthSeedResult, BillingSeedResult };

export interface SeedAllResult {
  users: UserSeedResult;
  authorization: AuthSeedResult;
  billing: BillingSeedResult;
}

export async function seedAll(db: DrizzleDb): Promise<SeedAllResult> {
  const users = await seedUsers(db);
  const authorization = await seedAuthorization(db, { users });
  const billing = await seedBilling(db, { tenants: authorization.tenants });

  return { users, authorization, billing };
}
