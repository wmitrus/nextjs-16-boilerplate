/** @vitest-environment node */
import '@/testing/infrastructure/env';

import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getBetterStackIngestingUrl,
  getBetterStackSourceToken,
  isBetterStackEnabled,
  isBetterStackWebVitalsEnabled,
} from './better-stack';

import { mockEnv } from '@/testing/infrastructure/env';

describe('isBetterStackEnabled', () => {
  beforeEach(() => {
    mockEnv.BETTERSTACK_ENABLED = false;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = undefined;
  });

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
  beforeEach(() => {
    mockEnv.BETTERSTACK_ENABLED = false;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = undefined;
  });

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
  beforeEach(() => {
    mockEnv.BETTER_STACK_INGESTING_URL = 'https://in.logs.betterstack.com';
  });

  it('returns the default URL', () => {
    mockEnv.BETTER_STACK_INGESTING_URL = 'https://in.logs.betterstack.com';
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
  beforeEach(() => {
    mockEnv.BETTERSTACK_ENABLED = false;
    mockEnv.BETTER_STACK_SOURCE_TOKEN = undefined;
    mockEnv.BETTERSTACK_WEB_VITALS_ENABLED = false;
  });

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
