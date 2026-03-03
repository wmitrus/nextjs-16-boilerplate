import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/core/db';

import { DrizzleUserRepository } from './DrizzleUserRepository';

function createMockDb(result: unknown[] = []) {
  const chain: Record<string, unknown> = {};

  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);

  ['from', 'where', 'limit', 'set', 'update'].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });

  return {
    select: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
  } as unknown as DrizzleDb;
}

describe('DrizzleUserRepository', () => {
  it('returns null when user does not exist', async () => {
    const db = createMockDb([]);
    const repository = new DrizzleUserRepository(db);

    const result = await repository.findById('user-1');

    expect(result).toBeNull();
  });

  it('maps database row to user domain object', async () => {
    const db = createMockDb([
      {
        id: 'user-1',
        email: 'user@example.com',
        onboardingComplete: true,
        targetLanguage: 'en',
        proficiencyLevel: 'b2',
        learningGoal: 'fluency',
      },
    ]);
    const repository = new DrizzleUserRepository(db);

    const result = await repository.findById('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      onboardingComplete: true,
      targetLanguage: 'en',
      proficiencyLevel: 'b2',
      learningGoal: 'fluency',
    });
  });
});
