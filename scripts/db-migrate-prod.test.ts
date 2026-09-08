import { afterEach, describe, expect, it } from 'vitest';

import {
  describeMigrationTarget,
  resolveMigrationUrl,
  resolveMigrationUrlWithSource,
  run,
} from './db-migrate-prod';

describe('db-migrate-prod migration URL resolution', () => {
  it('prefers DATABASE_URL_UNPOOLED over DATABASE_URL', () => {
    const resolved = resolveMigrationUrlWithSource(
      'postgresql://runtime:[REDACTED]@ep-main-pooler.example.test/app',
      'postgresql://direct:[REDACTED]@ep-branch.example.test/app',
    );

    expect(resolved).toEqual({
      source: 'DATABASE_URL_UNPOOLED',
      url: 'postgresql://direct:[REDACTED]@ep-branch.example.test/app',
    });
    expect(
      resolveMigrationUrl(
        'postgresql://runtime:[REDACTED]@ep-main-pooler.example.test/app',
        'postgresql://direct:[REDACTED]@ep-branch.example.test/app',
      ),
    ).toBe('postgresql://direct:[REDACTED]@ep-branch.example.test/app');
  });

  it('describes the migration target without exposing credentials', () => {
    const resolved = resolveMigrationUrlWithSource(
      'postgresql://runtime:[REDACTED]@ep-main-pooler.example.test/app',
      undefined,
    );

    expect(resolved).toBeDefined();

    if (!resolved) {
      throw new Error('Expected migration URL to resolve');
    }

    const target = describeMigrationTarget(resolved);

    expect(target).toEqual({
      source: 'DATABASE_URL',
      protocol: 'postgresql:',
      hostname: 'ep-main-pooler.example.test',
      database: 'app',
      pooled: true,
    });
    expect(JSON.stringify(target)).not.toContain('runtime');
    expect(JSON.stringify(target)).not.toContain('[REDACTED]');
  });
});

describe('db-migrate-prod fails closed on connection configuration (fix 2)', () => {
  const savedUrl = process.env.DATABASE_URL;
  const savedUnpooled = process.env.DATABASE_URL_UNPOOLED;

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    if (savedUnpooled === undefined) delete process.env.DATABASE_URL_UNPOOLED;
    else process.env.DATABASE_URL_UNPOOLED = savedUnpooled;
  });

  it('rejects a pooled migration URL BEFORE running any migration', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL =
      'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/app';
    await expect(run([])).rejects.toThrow(/DIRECT \(unpooled\)/i);
  });

  it('requires a migration URL', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    await expect(run([])).rejects.toThrow(
      /DATABASE_URL_UNPOOLED or DATABASE_URL is required/i,
    );
  });
});
