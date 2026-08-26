import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expandHome, loadConfig, MissingConfigError } from './config';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('expandHome', () => {
  it('expands a leading "~/" to HOME (verified: --env-file does NOT do this itself)', () => {
    process.env.HOME = '/home/testuser';
    expect(expandHome('~/.linear/inbox/capture.md')).toBe(
      '/home/testuser/.linear/inbox/capture.md',
    );
  });

  it('expands a bare "~"', () => {
    process.env.HOME = '/home/testuser';
    expect(expandHome('~')).toBe('/home/testuser');
  });

  it('leaves an absolute path untouched', () => {
    expect(expandHome('/already/absolute/path.md')).toBe(
      '/already/absolute/path.md',
    );
  });

  it('leaves a relative path without a leading ~ untouched', () => {
    expect(expandHome('relative/path.md')).toBe('relative/path.md');
  });

  it('does not mistakenly expand a path that merely contains a tilde mid-string', () => {
    expect(expandHome('/some/~weird/path')).toBe('/some/~weird/path');
  });

  it('throws a clear error when HOME/USERPROFILE are unset and expansion is actually needed', () => {
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    expect(() => expandHome('~/x')).toThrow(/HOME.*USERPROFILE/);
  });
});

describe('loadConfig — account-configurable, no hardcoded personal path', () => {
  it('resolves AI_INBOX_PATH written with ~ against the current account HOME', () => {
    process.env.HOME = '/home/testuser';
    process.env.AI_INBOX_PATH = '~/.linear/inbox/capture.md';
    const config = loadConfig();
    expect(config.inboxPath).toBe('/home/testuser/.linear/inbox/capture.md');
    expect(config.inboxDir).toBe('/home/testuser/.linear/inbox');
  });

  it('resolves AI_INBOX_LEDGER_DIR written with ~ against the current account HOME', () => {
    process.env.HOME = '/home/testuser';
    process.env.AI_INBOX_PATH = '/tmp/inbox.md';
    process.env.AI_INBOX_LEDGER_DIR = '~/.linear/reconcile';
    const config = loadConfig();
    expect(config.ledgerDir).toBe('/home/testuser/.linear/reconcile');
    expect(config.ledgerPath).toBe(
      path.join('/home/testuser/.linear/reconcile', 'reconcile-map.json'),
    );
  });

  it('falls back to ~/.local/state/ai-inbox-reconcile when AI_INBOX_LEDGER_DIR is unset', () => {
    process.env.HOME = '/home/testuser';
    process.env.AI_INBOX_PATH = '/tmp/inbox.md';
    delete process.env.AI_INBOX_LEDGER_DIR;
    const config = loadConfig();
    expect(config.ledgerDir).toBe(
      '/home/testuser/.local/state/ai-inbox-reconcile/inbox-reconcile',
    );
  });

  it('throws MissingConfigError when AI_INBOX_PATH is unset', () => {
    delete process.env.AI_INBOX_PATH;
    expect(() => loadConfig()).toThrow(MissingConfigError);
  });

  it(
    'rejects AI_INBOX_PATH pointing inside the repository — inboxDir is derived from ' +
      'the same value, so it cannot guard against this itself',
    () => {
      process.env.HOME = '/home/testuser';
      process.env.AI_INBOX_PATH = path.join(
        process.cwd(),
        'scripts/ai-tooling/some-tracked-file.md',
      );
      expect(() => loadConfig()).toThrow(
        /must not point inside the repository/,
      );
    },
  );

  it('never hardcodes any specific account path — two different HOME values resolve differently', () => {
    process.env.AI_INBOX_PATH = '~/.linear/inbox/capture.md';

    process.env.HOME = '/home/alice';
    expect(loadConfig().inboxPath).toBe('/home/alice/.linear/inbox/capture.md');

    process.env.HOME = '/home/bob';
    expect(loadConfig().inboxPath).toBe('/home/bob/.linear/inbox/capture.md');
  });
});
