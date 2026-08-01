import { describe, expect, it } from 'vitest';

import {
  describeMigrationTarget,
  resolveMigrationUrl,
  resolveMigrationUrlWithSource,
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
