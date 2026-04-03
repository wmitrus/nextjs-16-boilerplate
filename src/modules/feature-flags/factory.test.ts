import { describe, expect, it, vi } from 'vitest';

vi.mock('./infrastructure/drizzle/DrizzleFeatureFlagService', () => ({
  DrizzleFeatureFlagService: vi.fn(),
}));

vi.mock('./infrastructure/growthbook/GrowthBookFeatureFlagService', () => ({
  GrowthBookFeatureFlagService: vi.fn(),
}));

const mockLogger = vi.hoisted(() => {
  const warn = vi.fn();
  const child = vi.fn();
  const instance = { warn, child };
  child.mockReturnValue(instance);
  return instance;
});

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => mockLogger,
}));

import type { DrizzleDb } from '@/core/db';

import { createFeatureFlagService } from './factory';
import { DrizzleFeatureFlagService } from './infrastructure/drizzle/DrizzleFeatureFlagService';
import { GrowthBookFeatureFlagService } from './infrastructure/growthbook/GrowthBookFeatureFlagService';
import { ResilientFeatureFlagService } from './infrastructure/resilient/ResilientFeatureFlagService';

const fakeDb = {} as DrizzleDb;

describe('createFeatureFlagService', () => {
  it('always wraps the adapter in ResilientFeatureFlagService', () => {
    const svc = createFeatureFlagService('static', {});
    expect(svc).toBeInstanceOf(ResilientFeatureFlagService);
  });

  it('creates a static adapter when provider is "static"', () => {
    const svc = createFeatureFlagService('static', { staticFlags: 'f=true' });
    expect(svc).toBeInstanceOf(ResilientFeatureFlagService);
  });

  it('creates a DrizzleFeatureFlagService when provider is "db" and db is provided', () => {
    createFeatureFlagService('db', { db: fakeDb });
    expect(DrizzleFeatureFlagService).toHaveBeenCalledWith(fakeDb);
  });

  it('throws when provider is "db" and db is missing', () => {
    expect(() => createFeatureFlagService('db', {})).toThrow(
      /FEATURE_FLAG_PROVIDER=db requires a database connection/,
    );
  });

  it('creates a GrowthBookFeatureFlagService when provider is "growthbook" and clientKey is provided', () => {
    createFeatureFlagService('growthbook', {
      growthbookClientKey: 'sdk-key',
      growthbookApiHost: 'https://cdn.growthbook.io',
    });

    expect(GrowthBookFeatureFlagService).toHaveBeenCalledWith({
      clientKey: 'sdk-key',
      apiHost: 'https://cdn.growthbook.io',
    });
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

  it('falls back to static (all off) for unknown provider values', () => {
    const svc = createFeatureFlagService('unknown' as 'static', {});

    expect(svc).toBeInstanceOf(ResilientFeatureFlagService);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'feature-flag:unknown-provider' }),
      expect.any(String),
    );
  });

  it('throws when GROWTHBOOK_API_HOST uses http: protocol', () => {
    expect(() =>
      createFeatureFlagService('growthbook', {
        growthbookClientKey: 'sdk-key',
        growthbookApiHost: 'http://cdn.growthbook.io',
      }),
    ).toThrow(/must use https: protocol/);
  });

  it('accepts an on-prem https host for GrowthBook', () => {
    expect(() =>
      createFeatureFlagService('growthbook', {
        growthbookClientKey: 'sdk-key',
        growthbookApiHost: 'https://growthbook.mycompany.com',
      }),
    ).not.toThrow();
  });

  it('throws when GROWTHBOOK_API_HOST is not a valid URL', () => {
    expect(() =>
      createFeatureFlagService('growthbook', {
        growthbookClientKey: 'sdk-key',
        growthbookApiHost: 'not-a-url',
      }),
    ).toThrow(/Invalid GROWTHBOOK_API_HOST/);
  });
});
