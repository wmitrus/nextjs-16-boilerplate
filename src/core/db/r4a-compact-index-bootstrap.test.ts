import { describe, expect, it } from 'vitest';

import { runMigrations } from './migrations/run-migrations';
import {
  assertR4aBootstrapTargetIdentity,
  bootstrapR4aSchemaAConcurrent,
  isLocalR4aBootstrapTarget,
  R4A_SYSTEM_IDENTIFIER_SQL,
} from './r4a-compact-index-bootstrap';
import type { R4aCompactIndexExecutorRunner } from './r4a-compact-index-executor';
import type { DrizzleDb } from './types';

describe('R4a schema A bootstrap target guard (OZI-219)', () => {
  it.each([
    'postgres://u:p@127.0.0.1:5433/app_test',
    'postgres://u:p@localhost:5432/app_dev',
    'postgresql://u:p@[::1]:5432/app',
  ])('accepts a loopback target %s', (url) => {
    expect(isLocalR4aBootstrapTarget(url)).toBe(true);
  });

  it.each([
    'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require',
    'postgresql://u:p@127.0.0.1.attacker.test/app',
    'postgresql://u:p@10.0.0.5/app',
    'not a url',
  ])('refuses a non-loopback target %s', (url) => {
    expect(isLocalR4aBootstrapTarget(url)).toBe(false);
  });

  it('runMigrations refuses a remote bootstrap before the migrator runs', async () => {
    const db = {
      execute: () => {
        throw new Error('the migrator must not run');
      },
    } as unknown as DrizzleDb;
    await expect(
      runMigrations(db, 'postgres', {
        postgresUrl:
          'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require',
        r4aSchemaA: 'bootstrap',
      }),
    ).rejects.toThrow('refuses a non-loopback PostgreSQL target');
  });

  it('runMigrations refuses a loopback bootstrap without an identity proof before the migrator runs', async () => {
    const db = {
      execute: () => {
        throw new Error('the migrator must not run');
      },
    } as unknown as DrizzleDb;
    await expect(
      runMigrations(db, 'postgres', {
        postgresUrl: 'postgres://u:p@127.0.0.1:5433/app_test',
        r4aSchemaA: 'bootstrap',
      }),
    ).rejects.toThrow('a loopback hostname is not proof');
  });
  it('runMigrations refuses a localhost tunnel to another cluster before the migrator runs', async () => {
    const executed: string[] = [];
    const db = {
      execute: async (query: unknown) => {
        const text = JSON.stringify(query);
        executed.push(text);
        if (text.includes('pg_control_system'))
          return [{ id: '7400000000000000001' }];
        throw new Error('the migrator must not run');
      },
    } as unknown as DrizzleDb;
    await expect(
      runMigrations(db, 'postgres', {
        postgresUrl: 'postgres://u:p@127.0.0.1:5432/app_dev',
        r4aSchemaA: 'bootstrap',
        r4aTargetSystemIdentifier: '7619451615054913566',
      }),
    ).rejects.toThrow('not the trusted local cluster');
    expect(executed).toHaveLength(1);
  });
});

describe('R4a schema A bootstrap target identity (OZI-219)', () => {
  const LOCAL = '7619451615054913566';
  const REMOTE = '7400000000000000001';

  /** A session whose server reports `serverId` (or fails to); records every statement. */
  function session(serverId: string | Error) {
    const statements: string[] = [];
    const runner: R4aCompactIndexExecutorRunner = {
      query: async <T>(text: string) => {
        statements.push(text);
        if (text !== R4A_SYSTEM_IDENTIFIER_SQL)
          throw new Error(`unexpected statement after refusal: ${text}`);
        if (serverId instanceof Error) throw serverId;
        return [{ id: serverId }] as T[];
      },
      queryWithParams: async <T>(text: string) => {
        statements.push(text);
        throw new Error(`unexpected statement after refusal: ${text}`);
        return [] as T[];
      },
    };
    return { runner, statements };
  }

  it('accepts the session whose cluster matches the trusted identity', async () => {
    await expect(
      assertR4aBootstrapTargetIdentity(session(LOCAL).runner, LOCAL),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['a localhost tunnel to another cluster', REMOTE],
    ['an unreadable identity (pg_control_system denied)', new Error('42501')],
  ])('refuses %s with no DDL', async (_label, serverId) => {
    const { runner, statements } = session(serverId);
    await expect(
      bootstrapR4aSchemaAConcurrent(runner, {
        expectedSystemIdentifier: LOCAL,
      }),
    ).rejects.toThrow('not the trusted local cluster');
    expect(statements).toEqual([R4A_SYSTEM_IDENTIFIER_SQL]);
  });

  it.each(['', 'not-a-number', ' 1 '])(
    'refuses a missing or malformed proof %j before touching the session',
    async (expected) => {
      const { runner, statements } = session(LOCAL);
      await expect(
        bootstrapR4aSchemaAConcurrent(runner, {
          expectedSystemIdentifier: expected,
        }),
      ).rejects.toThrow('requires a trusted target identity proof');
      expect(statements).toEqual([]);
    },
  );
});
