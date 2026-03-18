import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./bootstrap-error', () => ({
  BootstrapErrorUI: ({ error }: { error: string }) => (
    <div data-testid="bootstrap-error">{error}</div>
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

import BootstrapPage from './page';

describe('BootstrapPage', () => {
  const makeProps = (params: Record<string, string> = {}) => ({
    searchParams: Promise.resolve(params),
  });

  it('renders org-required UI when state=org-required', async () => {
    render(await BootstrapPage(makeProps({ state: 'org-required' })));
    expect(screen.getByTestId('bootstrap-org-required')).toBeDefined();
    expect(screen.queryByTestId('bootstrap-error')).toBeNull();
  });

  it('passes redirect_url to BootstrapOrgRequired', async () => {
    render(
      await BootstrapPage(
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
    render(await BootstrapPage(makeProps({ state: 'org-required' })));
    expect(
      screen
        .getByTestId('bootstrap-org-required')
        .getAttribute('data-redirect-url'),
    ).toBe('');
  });

  it('renders cross_provider_linking error UI', async () => {
    render(await BootstrapPage(makeProps({ error: 'cross_provider_linking' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'cross_provider_linking',
    );
  });

  it('renders quota_exceeded error UI', async () => {
    render(await BootstrapPage(makeProps({ error: 'quota_exceeded' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'quota_exceeded',
    );
  });

  it('renders tenant_config error UI', async () => {
    render(await BootstrapPage(makeProps({ error: 'tenant_config' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'tenant_config',
    );
  });

  it('renders db_error error UI', async () => {
    render(await BootstrapPage(makeProps({ error: 'db_error' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('defaults to db_error for an unknown error param', async () => {
    render(await BootstrapPage(makeProps({ error: 'something_unexpected' })));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('defaults to db_error when no params are provided', async () => {
    render(await BootstrapPage(makeProps()));
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });
});
