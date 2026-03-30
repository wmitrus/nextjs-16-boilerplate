import { describe, expect, it } from 'vitest';

import { shouldDropDevClientSentryEvent } from './sentry-dev-filters';

describe('shouldDropDevClientSentryEvent', () => {
  it('drops known Next/Turbopack negative timestamp noise in development', () => {
    expect(
      shouldDropDevClientSentryEvent(
        {
          exception: {
            values: [
              {
                value:
                  "Failed to execute 'measure' on 'Performance': 'BootstrapPage [Prerender]' cannot have a negative time stamp.",
                stacktrace: {
                  frames: [
                    {
                      filename:
                        'app:///_next/static/chunks/react-server-dom-turbopack-client.browser.development.js',
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        'development',
      ),
    ).toBe(true);
  });

  it('drops Prefetchable wasm abort noise in development', () => {
    expect(
      shouldDropDevClientSentryEvent(
        {
          exception: {
            values: [
              {
                value: 'Aborted(). Build with -sASSERTIONS for more info.',
                stacktrace: {
                  frames: [
                    {
                      filename: 'about:/Prefetchable/wasm://wasm/021ce0b2',
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        'development',
      ),
    ).toBe(true);
  });

  it('does not drop unrelated errors', () => {
    expect(
      shouldDropDevClientSentryEvent(
        {
          exception: {
            values: [
              {
                value: 'Something actually broke',
                stacktrace: {
                  frames: [{ filename: '/src/app/page.tsx' }],
                },
              },
            ],
          },
        },
        {},
        'development',
      ),
    ).toBe(false);
  });

  it('does not drop known noise outside development', () => {
    expect(
      shouldDropDevClientSentryEvent(
        {
          exception: {
            values: [
              {
                value:
                  "Failed to execute 'measure' on 'Performance': 'BootstrapPage [Prerender]' cannot have a negative time stamp.",
                stacktrace: {
                  frames: [
                    {
                      filename:
                        'app:///_next/static/chunks/react-server-dom-turbopack-client.browser.development.js',
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        'production',
      ),
    ).toBe(false);
  });
});
