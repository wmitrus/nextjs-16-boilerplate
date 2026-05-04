import { describe, expect, it } from 'vitest';

import {
  buildBootstrapRedirectUrl,
  DEFAULT_APP_ENTRY_URL,
} from './post-auth-redirect';

describe('buildBootstrapRedirectUrl', () => {
  it('uses the default app entry when no requested URL exists', () => {
    expect(buildBootstrapRedirectUrl()).toBe(
      '/auth/bootstrap/start?redirect_url=%2Fdashboard',
    );
    expect(DEFAULT_APP_ENTRY_URL).toBe('/dashboard');
  });

  it('preserves an explicit internal target through bootstrap', () => {
    expect(buildBootstrapRedirectUrl('/admin')).toBe(
      '/auth/bootstrap/start?redirect_url=%2Fadmin',
    );
  });

  it('does not wrap the bootstrap route inside another bootstrap route', () => {
    expect(
      buildBootstrapRedirectUrl('/auth/bootstrap/start?redirect_url=%2Fadmin'),
    ).toBe('/auth/bootstrap/start?redirect_url=%2Fadmin');
  });

  it('sanitizes nested redirect_url values on bootstrap passthrough URLs', () => {
    expect(
      buildBootstrapRedirectUrl(
        '/auth/bootstrap/start?redirect_url=https://evil.example.com/phish',
      ),
    ).toBe('/auth/bootstrap/start?redirect_url=%2Fdashboard');
  });
});
