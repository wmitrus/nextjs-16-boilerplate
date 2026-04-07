// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  parseCliFlag,
  parseOutputFormat,
  parsePositionalArgs,
  readStructuredInput,
  resolveLeantimeConfig,
  runLeantimeWebRequest,
} from './lib';

describe('leantime script helpers', () => {
  describe('parseCliFlag', () => {
    it('reads inline --flag=value arguments', () => {
      expect(parseCliFlag(['node', 'script', '--method=test'], 'method')).toBe(
        'test',
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
      ).toBe('json');
    });

    it('reads flags after pnpm script separator and before a later end-of-options marker', () => {
      expect(
        parseCliFlag(
          [
            'node',
            'script',
            '--',
            'run',
            'project.get',
            '--input',
            '{"id":2}',
            '--format=json',
            '--',
            'ignored',
          ],
          'input',
        ),
      ).toBe('{"id":2}');
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

  describe('parsePositionalArgs', () => {
    it('returns bare positional arguments while skipping supported flags', () => {
      expect(
        parsePositionalArgs([
          'node',
          'script',
          'run',
          'task.create',
          '--format=json',
          '--project',
          '123',
          '--input-file',
          'task.json',
        ]),
      ).toEqual(['run', 'task.create']);
    });

    it('supports pnpm script argument forwarding', () => {
      expect(
        parsePositionalArgs([
          'node',
          'script',
          '--',
          'run',
          'project.get',
          '--input',
          '{"id":2}',
          '--format=json',
        ]),
      ).toEqual(['run', 'project.get']);
    });
  });

  describe('readStructuredInput', () => {
    it('parses JSON passed after the pnpm separator', () => {
      expect(
        readStructuredInput([
          'node',
          'script',
          '--',
          'run',
          'project.get',
          '--input',
          '{"id":2}',
        ]),
      ).toEqual({ id: 2 });
    });
  });

  describe('resolveLeantimeConfig', () => {
    it('returns a validated config object', () => {
      expect(
        resolveLeantimeConfig({
          apiKey: 'lt_example',
          baseUrl: 'https://leantime.example.com',
          defaultAuthorId: '12',
          defaultProjectId: '34',
          rpcPath: 'api/jsonrpc',
          sessionCookie: 'LEANTIMESESSID=example',
          timeoutMs: '45000',
        }),
      ).toEqual({
        apiKey: 'lt_example',
        baseUrl: 'https://leantime.example.com/',
        defaultAuthorId: 12,
        defaultClientId: undefined,
        defaultProjectId: 34,
        rpcUrl: 'https://leantime.example.com/api/jsonrpc',
        sessionCookie: 'LEANTIMESESSID=example',
        timeoutMs: 45000,
      });
    });

    it('rejects missing base url', () => {
      expect(() =>
        resolveLeantimeConfig({
          apiKey: 'lt_example',
          baseUrl: '',
        }),
      ).toThrow('LEANTIME_URL');
    });

    it('rejects non-https non-local urls', () => {
      expect(() =>
        resolveLeantimeConfig({
          apiKey: 'lt_example',
          baseUrl: 'http://leantime.example.com',
        }),
      ).toThrow('must use https');
    });

    it('allows localhost over http for development', () => {
      expect(
        resolveLeantimeConfig({
          apiKey: 'lt_example',
          baseUrl: 'http://127.0.0.1:8080',
        }).rpcUrl,
      ).toBe('http://127.0.0.1:8080/api/jsonrpc');
    });
  });

  describe('runLeantimeWebRequest', () => {
    it('requires a session cookie for web-session operations', async () => {
      await expect(
        runLeantimeWebRequest(
          {
            apiKey: 'lt_example',
            baseUrl: 'https://leantime.example.com/',
            rpcUrl: 'https://leantime.example.com/api/jsonrpc',
            timeoutMs: 30000,
          },
          {
            path: '/ideas/boardDialog',
          },
        ),
      ).rejects.toThrow('LEANTIME_SESSION_COOKIE');
    });
  });
});
