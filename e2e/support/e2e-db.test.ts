import { describe, expect, it } from 'vitest';

import { resolveLocalE2EDatabaseUrl } from './e2e-db';

describe('resolveLocalE2EDatabaseUrl', () => {
  it.each([
    'postgres://postgres:postgres@127.0.0.1:5433/app_test',
    'postgresql://postgres:postgres@localhost:55433/app_test',
    'postgres://postgres:postgres@[::1]:5433/app_test',
  ])('accepts the local container URL %s', (url) => {
    expect(resolveLocalE2EDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it.each([
    ['unset', undefined, /not set/],
    ['PGlite path', 'file:./data/e2e/single', /postgres:\/\//],
    [
      'remote host',
      'postgres://u:p@ep-example.eu-central-1.aws.neon.tech/neondb',
      /loopback/,
    ],
    ['not a URL', 'postgres://', /not a valid URL|loopback/],
  ])('refuses %s', (_label, url, message) => {
    expect(() => resolveLocalE2EDatabaseUrl({ DATABASE_URL: url })).toThrow(
      message,
    );
  });
});
