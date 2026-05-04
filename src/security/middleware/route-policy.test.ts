import { describe, expect, it } from 'vitest';

import { matchesAnyRoutePrefix, matchesRoutePrefix } from './route-policy';

describe('route-policy', () => {
  it('matches exact and nested route prefixes after stripping query and hash', () => {
    expect(
      matchesRoutePrefix(
        '/auth/signup?redirect_url=%2Fdashboard',
        '/auth/signup',
      ),
    ).toBe(true);
    expect(matchesRoutePrefix('/auth/signup#fragment', '/auth/signup')).toBe(
      true,
    );
    expect(matchesRoutePrefix('/auth/signup/extra?x=1', '/auth/signup')).toBe(
      true,
    );
  });

  it('does not treat the root prefix as matching non-root routes with query strings', () => {
    expect(matchesRoutePrefix('/dashboard?from=home', '/')).toBe(false);
    expect(matchesAnyRoutePrefix('/?hello=1', ['/'])).toBe(true);
  });
});
