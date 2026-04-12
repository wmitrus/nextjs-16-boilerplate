import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/core/env', () => ({ env: {} }));

import {
  getBetterStackIngestingUrl,
  getBetterStackSourceToken,
  isBetterStackEnabled,
  isBetterStackWebVitalsEnabled,
} from './better-stack';

import { mockEnv } from '@/testing/infrastructure/env';

describe('isBetterStackEnabled', () => {
  it('returns false when disabled', () => {
    mockEnv.BETTERSTACK_ENABLED = false;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = 'token123';
    expect(isBetterStackEnabled()).toBe(false);
  });

  it('returns false when token is missing', () => {
    mockEnv.BETTERSTACK_ENABLED = true;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = undefined;
    expect(isBetterStackEnabled()).toBe(false);
  });

  it('returns true when enabled and token present', () => {
    mockEnv.BETTERSTACK_ENABLED = true;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = 'token123';
    expect(isBetterStackEnabled()).toBe(true);
  });
});

describe('getBetterStackSourceToken', () => {
  it('returns null when disabled', () => {
    mockEnv.BETTERSTACK_ENABLED = false;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = 'token123';
    expect(getBetterStackSourceToken()).toBeNull();
  });

  it('returns token when enabled', () => {
    mockEnv.BETTERSTACK_ENABLED = true;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = 'token123';
    expect(getBetterStackSourceToken()).toBe('token123');
  });
});

describe('getBetterStackIngestingUrl', () => {
  it('returns default URL when not set', () => {
    mockEnv.BETTER_STACK_INGESTING_URL = undefined;
    expect(getBetterStackIngestingUrl()).toBe(
      'https://in.logs.betterstack.com',
    );
  });

  it('returns custom URL when set', () => {
    mockEnv.BETTER_STACK_INGESTING_URL = 'https://custom.betterstack.com';
    expect(getBetterStackIngestingUrl()).toBe('https://custom.betterstack.com');
  });
});

describe('isBetterStackWebVitalsEnabled', () => {
  it('returns false when better stack disabled', () => {
    mockEnv.BETTERSTACK_ENABLED = false;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = 'token123';
    mockEnv.BETTERSTACK_WEB_VITALS_ENABLED = true;
    expect(isBetterStackWebVitalsEnabled()).toBe(false);
  });

  it('returns false when web vitals disabled', () => {
    mockEnv.BETTERSTACK_ENABLED = true;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = 'token123';
    mockEnv.BETTERSTACK_WEB_VITALS_ENABLED = false;
    expect(isBetterStackWebVitalsEnabled()).toBe(false);
  });

  it('returns true when both enabled', () => {
    mockEnv.BETTERSTACK_ENABLED = true;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = 'token123';
    mockEnv.BETTERSTACK_WEB_VITALS_ENABLED = true;
    expect(isBetterStackWebVitalsEnabled()).toBe(true);
  });
});
