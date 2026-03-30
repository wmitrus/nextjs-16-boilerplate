import type { DrizzleDb } from '@/core/db';

import { usersTable } from './schema';

export interface UserRecord {
  id: string;
  email: string;
}

export interface UserSeedResult {
  alice: UserRecord;
  bob: UserRecord;
}

const FIXTURES = {
  alice: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@example.com',
  },
  bob: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@example.com',
  },
} satisfies Record<string, UserRecord>;

export async function seedUsers(db: DrizzleDb): Promise<UserSeedResult> {
  await db
    .insert(usersTable)
    .values([FIXTURES.alice, FIXTURES.bob])
    .onConflictDoNothing();

  return FIXTURES;
}
