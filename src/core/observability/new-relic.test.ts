import { afterEach, describe, expect, it, vi } from 'vitest';

const { existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  const mockedFs = {
    ...(actual as Record<string, unknown>),
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
  };

  return {
    ...mockedFs,
    default: mockedFs,
  };
});

import {
  getBrowserSnippetSafe,
  resolveBrowserSnippetSource,
} from './new-relic';

describe('getBrowserSnippetSafe', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it('returns an empty string when the env var is unset', () => {
    vi.stubEnv('NEW_RELIC_BROWSER_SNIPPET', '');
    vi.stubEnv('NEW_RELIC_BROWSER_SNIPPET_BASE64', '');

    expect(getBrowserSnippetSafe()).toBe('');
  });

  it('preserves bare javascript snippets', () => {
    vi.stubEnv(
      'NEW_RELIC_BROWSER_SNIPPET',
      ';window.NREUM||(NREUM={});NREUM.init={ajax:{deny_list:["bam.eu01.nr-data.net"]}};',
    );
    vi.stubEnv('NEW_RELIC_BROWSER_SNIPPET_BASE64', '');

    expect(getBrowserSnippetSafe()).toBe(
      ';window.NREUM||(NREUM={});NREUM.init={ajax:{deny_list:["bam.eu01.nr-data.net"]}};',
    );
  });

  it('strips optional script wrappers from full html snippets', () => {
    vi.stubEnv(
      'NEW_RELIC_BROWSER_SNIPPET',
      '  <script type="text/javascript">\n;window.NREUM||(NREUM={});NREUM.init={};\n</script>  ',
    );
    vi.stubEnv('NEW_RELIC_BROWSER_SNIPPET_BASE64', '');

    expect(getBrowserSnippetSafe()).toBe(
      ';window.NREUM||(NREUM={});NREUM.init={};',
    );
  });

  it('prefers the base64-encoded snippet when present', () => {
    vi.stubEnv('NEW_RELIC_BROWSER_SNIPPET', '');
    vi.stubEnv(
      'NEW_RELIC_BROWSER_SNIPPET_BASE64',
      Buffer.from(';window.NREUM||(NREUM={});NREUM.init={};', 'utf8').toString(
        'base64',
      ),
    );

    expect(getBrowserSnippetSafe()).toBe(
      ';window.NREUM||(NREUM={});NREUM.init={};',
    );
  });

  it('treats a non-base64 BASE64 env value as raw javascript compatibility input', () => {
    vi.stubEnv('NEW_RELIC_BROWSER_SNIPPET', '');
    vi.stubEnv(
      'NEW_RELIC_BROWSER_SNIPPET_BASE64',
      ';window.NREUM||(NREUM={});NREUM.init={};',
    );

    expect(getBrowserSnippetSafe()).toBe(
      ';window.NREUM||(NREUM={});NREUM.init={};',
    );
  });

  it('recovers the full raw snippet from .env.local when dotenv truncates at a hash', () => {
    vi.stubEnv(
      'NEW_RELIC_BROWSER_SNIPPET',
      ';window.NREUM||(NREUM={});console.debug("https://example.com/docs#',
    );
    vi.stubEnv('NEW_RELIC_BROWSER_SNIPPET_BASE64', '');
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      'NEW_RELIC_BROWSER_SNIPPET=;window.NREUM||(NREUM={});console.debug("https://example.com/docs#anchor".concat("ok"));\n',
    );

    expect(getBrowserSnippetSafe()).toBe(
      ';window.NREUM||(NREUM={});console.debug("https://example.com/docs#anchor".concat("ok"));',
    );
  });
});

describe('resolveBrowserSnippetSource', () => {
  it('falls back to the env file value when it extends the truncated raw env prefix', () => {
    expect(
      resolveBrowserSnippetSource({
        rawSnippet: 'abc',
        rawEnvFileSnippet: 'abcdef',
      }),
    ).toBe('abcdef');
  });

  it('keeps the explicit raw env value when the env file value is different', () => {
    expect(
      resolveBrowserSnippetSource({
        rawSnippet: 'abc',
        rawEnvFileSnippet: 'xyzabcdef',
      }),
    ).toBe('abc');
  });
});
