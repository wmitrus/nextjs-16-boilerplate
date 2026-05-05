import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SignUpClient } from './sign-up-client';

describe('AuthJS SignUpClient', () => {
  it('uses the same default bootstrap callback in invite sign-in links', () => {
    render(
      <SignUpClient
        invitationToken="invite-token"
        invitedEmail="invitee@example.com"
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Sign in instead' }),
    ).toHaveAttribute(
      'href',
      '/auth/signin?callbackUrl=%2Fauth%2Fbootstrap%2Fstart%3Fredirect_url%3D%252Fdashboard',
    );
  });
});
