import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withRegistrationMode } from './with-registration-mode';

import { mockEnv } from '@/testing';

const ctx = {
  pathname: '/sign-up',
  isPublic: true,
  requiresAuth: false,
};

function createRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe('withRegistrationMode', () => {
  beforeEach(() => {
    mockEnv.REGISTRATION_MODE = 'open';
  });

  it('passes through when registration is open', async () => {
    const next = vi.fn().mockResolvedValue(new Response('next'));
    const handler = withRegistrationMode(next);

    const response = await handler(createRequest('/sign-up'), ctx);

    expect(next).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('next');
  });

  it('passes through non-sign-up paths in restricted modes', async () => {
    mockEnv.REGISTRATION_MODE = 'disabled';
    const next = vi.fn().mockResolvedValue(new Response('next'));
    const handler = withRegistrationMode(next);

    await handler(createRequest('/dashboard'), {
      ...ctx,
      pathname: '/dashboard',
    });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('redirects sign-up paths when registration is disabled', async () => {
    mockEnv.REGISTRATION_MODE = 'disabled';
    const next = vi.fn();
    const handler = withRegistrationMode(next);

    const response = await handler(createRequest('/auth/signup'), ctx);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain(
      '/auth/registration-closed',
    );
  });

  it('redirects invite-only sign-up without an invitation token to waitlist', async () => {
    mockEnv.REGISTRATION_MODE = 'invite-only';
    const next = vi.fn();
    const handler = withRegistrationMode(next);

    const response = await handler(createRequest('/sign-up'), ctx);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/waitlist');
  });

  it('allows invite-only sign-up with an invitation token', async () => {
    mockEnv.REGISTRATION_MODE = 'invite-only';
    const next = vi.fn().mockResolvedValue(new Response('next'));
    const handler = withRegistrationMode(next);

    const response = await handler(
      createRequest('/sign-up?invitation_token=invite-1'),
      ctx,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('next');
  });
});
