import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  OrganizationSwitcher: ({
    hidePersonal,
    createOrganizationMode,
    afterSelectOrganizationUrl,
    afterCreateOrganizationUrl,
  }: {
    hidePersonal?: boolean;
    createOrganizationMode?: string;
    afterSelectOrganizationUrl?: string;
    afterCreateOrganizationUrl?: string;
  }) => (
    <div
      data-testid="org-switcher"
      data-hide-personal={String(hidePersonal)}
      data-create-mode={createOrganizationMode}
      data-after-select={afterSelectOrganizationUrl}
      data-after-create={afterCreateOrganizationUrl}
    />
  ),
}));

import { BootstrapOrgRequired } from './bootstrap-org-required';

describe('BootstrapOrgRequired', () => {
  it('renders the OrganizationSwitcher without crashing', () => {
    render(<BootstrapOrgRequired />);

    expect(screen.getByTestId('org-switcher')).toBeDefined();
  });

  it('passes afterSelectOrganizationUrl="/auth/bootstrap" to OrganizationSwitcher', () => {
    render(<BootstrapOrgRequired />);

    expect(screen.getByTestId('org-switcher')).toHaveAttribute(
      'data-after-select',
      '/auth/bootstrap',
    );
  });

  it('passes hidePersonal and createOrganizationMode="modal" to OrganizationSwitcher', () => {
    render(<BootstrapOrgRequired />);

    const switcher = screen.getByTestId('org-switcher');
    expect(switcher).toHaveAttribute('data-hide-personal', 'true');
    expect(switcher).toHaveAttribute('data-create-mode', 'modal');
  });
});
