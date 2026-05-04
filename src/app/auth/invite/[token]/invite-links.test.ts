import { describe, expect, it } from 'vitest';

import {
  buildInviteReturnPath,
  buildInviteSignInUrl,
  buildInviteSignUpUrl,
} from './invite-links';

describe('invite-links', () => {
  it('builds the invite return path from the token', () => {
    expect(buildInviteReturnPath('invite token')).toBe(
      '/auth/invite/invite%20token',
    );
  });

  it('preserves invite context for authjs sign in', () => {
    expect(buildInviteSignInUrl('invite-token', 'authjs')).toBe(
      '/auth/signin?callbackUrl=%2Fauth%2Finvite%2Finvite-token',
    );
  });

  it('preserves invite context for clerk sign in', () => {
    expect(buildInviteSignInUrl('invite-token', 'clerk')).toBe(
      '/sign-in?redirect_url=%2Fauth%2Finvite%2Finvite-token',
    );
  });

  it('builds provider-specific sign up urls', () => {
    expect(buildInviteSignUpUrl('invite-token', 'authjs')).toBe(
      '/auth/signup?invitation_token=invite-token',
    );
    expect(buildInviteSignUpUrl('invite-token', 'clerk')).toBe(
      '/sign-up?invitation_token=invite-token',
    );
  });
});
