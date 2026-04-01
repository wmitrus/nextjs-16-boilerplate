import { describe, expect, it, vi } from 'vitest';

vi.mock('./infrastructure/drizzle/DrizzleFeatureFlagService', () => ({
  DrizzleFeatureFlagService: vi.fn(),
}));

vi.mock('./infrastructure/growthbook/GrowthBookFeatureFlagService', () => ({
  GrowthBookFeatureFlagService: vi.fn(),
}));

import type { DrizzleDb } from '@/core/db';

import { createFeatureFlagService } from './factory';
import { DrizzleFeatureFlagService } from './infrastructure/drizzle/DrizzleFeatureFlagService';
import { GrowthBookFeatureFlagService } from './infrastructure/growthbook/GrowthBookFeatureFlagService';
import { StaticFeatureFlagService } from './infrastructure/static/StaticFeatureFlagService';

const fakeDb = {} as DrizzleDb;

describe('createFeatureFlagService', () => {
  it('returns StaticFeatureFlagService when provider is "static"', () => {
    const svc = createFeatureFlagService('static', {});

    expect(svc).toBeInstanceOf(StaticFeatureFlagService);
  });

  it('passes parsed static flags when provider is "static"', () => {
    const svc = createFeatureFlagService('static', {
      staticFlags: 'my-flag=true',
    });

    expect(svc).toBeInstanceOf(StaticFeatureFlagService);
  });

  it('returns DrizzleFeatureFlagService when provider is "db" and db is provided', () => {
    const svc = createFeatureFlagService('db', { db: fakeDb });

    expect(DrizzleFeatureFlagService).toHaveBeenCalledWith(fakeDb);
    expect(svc).toBeDefined();
  });

  it('throws when provider is "db" and db is missing', () => {
    expect(() => createFeatureFlagService('db', {})).toThrow(
      /FEATURE_FLAG_PROVIDER=db requires a database connection/,
    );
  });

  it('returns GrowthBookFeatureFlagService when provider is "growthbook" and clientKey is provided', () => {
    const svc = createFeatureFlagService('growthbook', {
      growthbookClientKey: 'sdk-key',
      growthbookApiHost: 'https://cdn.growthbook.io',
    });

    expect(GrowthBookFeatureFlagService).toHaveBeenCalledWith({
      clientKey: 'sdk-key',
      apiHost: 'https://cdn.growthbook.io',
    });
    expect(svc).toBeDefined();
  });

  it('uses default apiHost when growthbookApiHost is not provided', () => {
    createFeatureFlagService('growthbook', {
      growthbookClientKey: 'sdk-key',
    });

    expect(GrowthBookFeatureFlagService).toHaveBeenCalledWith({
      clientKey: 'sdk-key',
      apiHost: 'https://cdn.growthbook.io',
    });
  });

  it('throws when provider is "growthbook" and clientKey is missing', () => {
    expect(() => createFeatureFlagService('growthbook', {})).toThrow(
      /GROWTHBOOK_CLIENT_KEY/,
    );
  });

  it('falls back to StaticFeatureFlagService for unknown provider values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const svc = createFeatureFlagService('unknown' as 'static', {});

    expect(svc).toBeInstanceOf(StaticFeatureFlagService);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
