import { describe, expect, it } from 'vitest';

import { scanForCredentialShapedContent } from './security';

describe('scanForCredentialShapedContent', () => {
  it('flags an AWS access key shape', () => {
    expect(
      scanForCredentialShapedContent('key is AKIAABCDEFGHIJKLMNOP').safe,
    ).toBe(false);
  });

  it('flags a GitHub token shape', () => {
    expect(
      scanForCredentialShapedContent('token ghp_abcdefghijklmnopqrstuvwx').safe,
    ).toBe(false);
  });

  it('flags a JWT shape', () => {
    expect(
      scanForCredentialShapedContent(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      ).safe,
    ).toBe(false);
  });

  it('flags a PEM private key block', () => {
    expect(
      scanForCredentialShapedContent('-----BEGIN RSA PRIVATE KEY-----').safe,
    ).toBe(false);
  });

  it('flags an inline password field', () => {
    expect(scanForCredentialShapedContent('password: hunter2').safe).toBe(
      false,
    );
  });

  it('does not flag ordinary task-description text', () => {
    const result = scanForCredentialShapedContent(
      'Saw stale org name in invite email after renaming org in staging',
    );
    expect(result.safe).toBe(true);
    expect(result.matchedPatterns).toEqual([]);
  });

  it('does not flag a safe run/job pointer', () => {
    expect(
      scanForCredentialShapedContent('run 32757908931 / job 97529603309').safe,
    ).toBe(true);
  });
});
