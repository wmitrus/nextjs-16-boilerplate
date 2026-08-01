import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock('./bootstrap-error', () => ({
  BootstrapErrorUI: ({
    error,
    redirectUrl,
  }: {
    error: string;
    redirectUrl?: string;
  }) => (
    <div data-testid="bootstrap-error" data-redirect-url={redirectUrl ?? ''}>
      {error}
    </div>
  ),
}));

vi.mock('./bootstrap-org-required', () => ({
  BootstrapOrgRequired: ({ redirectUrl }: { redirectUrl?: string }) => (
    <div
      data-testid="bootstrap-org-required"
      data-redirect-url={redirectUrl ?? ''}
    />
  ),
}));

import { BootstrapPageContent } from './page';

describe('BootstrapPageContent', () => {
  const makeProps = (params: Record<string, string> = {}) => ({
    searchParams: Promise.resolve(params),
  });

  it('renders org-required UI when state=org-required', async () => {
    render(await BootstrapPageContent(makeProps({ state: 'org-required' })));
    expect(screen.getByTestId('bootstrap-org-required')).toBeDefined();
    expect(screen.queryByTestId('bootstrap-error')).toBeNull();
  });

  it('passes redirect_url to BootstrapOrgRequired', async () => {
    render(
      await BootstrapPageContent(
        makeProps({ state: 'org-required', redirect_url: '/users' }),
      ),
    );
    expect(
      screen
        .getByTestId('bootstrap-org-required')
        .getAttribute('data-redirect-url'),
    ).toBe('/users');
  });

  it('passes undefined redirect_url to BootstrapOrgRequired when absent', async () => {
    render(await BootstrapPageContent(makeProps({ state: 'org-required' })));
    expect(
      screen
        .getByTestId('bootstrap-org-required')
        .getAttribute('data-redirect-url'),
    ).toBe('');
  });

  it('renders org-required UI when reason=org-required', async () => {
    render(await BootstrapPageContent(makeProps({ reason: 'org-required' })));
    expect(screen.getByTestId('bootstrap-org-required')).toBeDefined();
    expect(screen.queryByTestId('bootstrap-error')).toBeNull();
  });

  it('renders cross_provider_linking error UI', async () => {
    render(
      await BootstrapPageContent(
        makeProps({ error: 'cross_provider_linking' }),
      ),
    );
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'cross_provider_linking',
    );
  });

  it('renders quota_exceeded error UI', async () => {
    render(await BootstrapPageContent(makeProps({ error: 'quota_exceeded' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'quota_exceeded',
    );
  });

  it('renders tenant_config error UI', async () => {
    render(await BootstrapPageContent(makeProps({ error: 'tenant_config' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'tenant_config',
    );
  });

  it('renders db_error error UI', async () => {
    render(await BootstrapPageContent(makeProps({ error: 'db_error' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('passes redirect_url to BootstrapErrorUI', async () => {
    render(
      await BootstrapPageContent(
        makeProps({ error: 'db_error', redirect_url: '/dashboard' }),
      ),
    );
    expect(screen.getByTestId('bootstrap-error')).toHaveAttribute(
      'data-redirect-url',
      '/dashboard',
    );
  });

  it('defaults to db_error for an unknown error param', async () => {
    render(
      await BootstrapPageContent(makeProps({ error: 'something_unexpected' })),
    );
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('maps reason=tenant-lost to tenant_config UI', async () => {
    render(await BootstrapPageContent(makeProps({ reason: 'tenant-lost' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'tenant_config',
    );
  });

  it('maps reason=db-error to db_error UI', async () => {
    render(await BootstrapPageContent(makeProps({ reason: 'db-error' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('defaults to db_error for inherited prototype keys in reason', async () => {
    render(await BootstrapPageContent(makeProps({ reason: 'toString' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('redirects a bare bootstrap page request to the bootstrap start route', async () => {
    await expect(BootstrapPageContent(makeProps())).rejects.toThrow(
      'REDIRECT:/auth/bootstrap/start?redirect_url=%2Fdashboard',
    );
  });

  it('preserves redirect_url when redirecting a bare bootstrap page request', async () => {
    await expect(
      BootstrapPageContent(makeProps({ redirect_url: '/dashboard' })),
    ).rejects.toThrow(
      'REDIRECT:/auth/bootstrap/start?redirect_url=%2Fdashboard',
    );
  });
});
