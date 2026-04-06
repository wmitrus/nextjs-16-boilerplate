// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  extractNrqlFromArgv,
  getNumericValue,
  parseCliFlag,
  parseOutputFormat,
  parsePositionalArgs,
  parseView,
  resolveNerdGraphConfig,
} from './lib';

describe('new-relic script helpers', () => {
  describe('parseCliFlag', () => {
    it('reads inline --flag=value arguments', () => {
      expect(parseCliFlag(['node', 'script', '--account=123'], 'account')).toBe(
        '123',
      );
    });

    it('reads split --flag value arguments', () => {
      expect(
        parseCliFlag(['node', 'script', '--format', 'json'], 'format'),
      ).toBe('json');
    });

    it('does not treat tokens after -- as flags', () => {
      expect(
        parseCliFlag(['node', 'script', '--', '--format=json'], 'format'),
      ).toBeUndefined();
    });
  });

  describe('parseOutputFormat', () => {
    it('defaults to table output', () => {
      expect(parseOutputFormat(['node', 'script'])).toBe('table');
    });

    it('supports json output', () => {
      expect(parseOutputFormat(['node', 'script', '--format=json'])).toBe(
        'json',
      );
    });
  });

  describe('parseView', () => {
    it('defaults to full view', () => {
      expect(parseView(['node', 'script'])).toBe('full');
    });

    it('supports compact view', () => {
      expect(parseView(['node', 'script', '--view=compact'])).toBe('compact');
    });
  });

  describe('extractNrqlFromArgv', () => {
    it('prefers the explicit --nrql flag', () => {
      expect(
        extractNrqlFromArgv([
          'node',
          'script',
          '--nrql=SELECT count(*) FROM Transaction',
        ]),
      ).toBe('SELECT count(*) FROM Transaction');
    });

    it('accepts positional NRQL after --', () => {
      expect(
        extractNrqlFromArgv([
          'node',
          'script',
          '--format=json',
          '--',
          'SELECT',
          'count(*)',
          'FROM',
          'Transaction',
        ]),
      ).toBe('SELECT count(*) FROM Transaction');
    });

    it('throws when no query is provided', () => {
      expect(() => extractNrqlFromArgv(['node', 'script'])).toThrow(
        'Missing NRQL query',
      );
    });
  });

  describe('parsePositionalArgs', () => {
    it('returns bare positional arguments while skipping supported flags', () => {
      expect(
        parsePositionalArgs([
          'node',
          'script',
          'run',
          'baseline',
          '--format=json',
          '--view=compact',
          '--account',
          '1234567',
        ]),
      ).toEqual(['run', 'baseline']);
    });

    it('treats all tokens after -- as positional arguments', () => {
      expect(
        parsePositionalArgs([
          'node',
          'script',
          'run',
          '--',
          '--format=json',
          'SELECT',
          'count(*)',
        ]),
      ).toEqual(['run', '--format=json', 'SELECT', 'count(*)']);
    });
  });

  describe('resolveNerdGraphConfig', () => {
    it('returns a validated config object', () => {
      expect(
        resolveNerdGraphConfig({
          accountId: '1234567',
          apiUrl: 'https://api.eu.newrelic.com/graphql',
          userApiKey: 'NRAK_test',
        }),
      ).toEqual({
        accountId: 1234567,
        apiUrl: 'https://api.eu.newrelic.com/graphql',
        userApiKey: 'NRAK_test',
      });
    });

    it('rejects missing api url', () => {
      expect(() =>
        resolveNerdGraphConfig({
          accountId: 123,
          apiUrl: '',
          userApiKey: 'NRAK_test',
        }),
      ).toThrow('NEW_RELIC_NERDGRAPH_API_URL');
    });

    it('rejects invalid account ids', () => {
      expect(() =>
        resolveNerdGraphConfig({
          accountId: 'abc',
          apiUrl: 'https://api.newrelic.com/graphql',
          userApiKey: 'NRAK_test',
        }),
      ).toThrow('NEW_RELIC_ACCOUNT_ID');
    });

    it('rejects non-https NerdGraph urls', () => {
      expect(() =>
        resolveNerdGraphConfig({
          accountId: '1234567',
          apiUrl: 'http://api.newrelic.com/graphql',
          userApiKey: 'NRAK_test',
        }),
      ).toThrow('must use https');
    });

    it('rejects unexpected NerdGraph hosts', () => {
      expect(() =>
        resolveNerdGraphConfig({
          accountId: '1234567',
          apiUrl: 'https://evil.example.com/graphql',
          userApiKey: 'NRAK_test',
        }),
      ).toThrow('api.newrelic.com or api.eu.newrelic.com');
    });
  });

  describe('getNumericValue', () => {
    it('prefers named keys before falling back to any numeric field', () => {
      expect(
        getNumericValue({ count: 9, transactionCount: 12 }, [
          'transactionCount',
        ]),
      ).toBe(12);
    });
  });
});
