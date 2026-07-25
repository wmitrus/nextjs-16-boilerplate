import { beforeEach, describe, expect, it } from 'vitest';

import { isEnvBasedPlatformAdmin } from './platform-admin';

import { mockEnv } from '@/testing';

describe('isEnvBasedPlatformAdmin', () => {
  beforeEach(() => {
    mockEnv.ADMIN_USER_EMAILS = '';
  });

  it('returns false when no email or admin list is configured', () => {
    expect(isEnvBasedPlatformAdmin(undefined)).toBe(false);
    expect(isEnvBasedPlatformAdmin('admin@example.com')).toBe(false);
  });

  it('matches configured admin emails case-insensitively', () => {
    mockEnv.ADMIN_USER_EMAILS = ' admin@example.com, Ops@Example.com ';

    expect(isEnvBasedPlatformAdmin('ADMIN@example.com')).toBe(true);
    expect(isEnvBasedPlatformAdmin('ops@example.com')).toBe(true);
    expect(isEnvBasedPlatformAdmin('user@example.com')).toBe(false);
  });
});
