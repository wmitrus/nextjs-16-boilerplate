import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardToolsTable } from './DashboardToolsTable';
import type { DashboardToolRow } from './tools-inventory';

const tools: DashboardToolRow[] = [
  {
    id: 'sentry',
    name: 'Sentry',
    group: 'Observability',
    footprint: 'runtime',
    statusLabel: 'configured',
    statusTone: 'configured',
    description: 'Error tracking and alerting.',
    dashboardHref: 'https://sentry.io/',
    dashboardLabel: 'Open Sentry',
    internalHref: '/env-summary',
    internalLabel: 'Inspect runtime env',
    signals: ['env', 'runtime'],
  },
];

describe('DashboardToolsTable', () => {
  it('renders the refined table shell and distinct badge treatments', () => {
    render(<DashboardToolsTable tools={tools} />);

    const tableShell = screen.getByTestId('dashboard-tools-table');
    expect(tableShell.classList.contains('rounded-2xl')).toBe(true);

    const statusBadge = screen.getByTestId('tool-status-sentry');
    expect(statusBadge.classList.contains('rounded-md')).toBe(true);

    const signalBadge = screen.getByText('env');
    expect(signalBadge.classList.contains('rounded-full')).toBe(true);
  });

  it('renders the external and internal tool links', () => {
    render(<DashboardToolsTable tools={tools} />);

    expect(screen.getByRole('link', { name: /open sentry/i })).toHaveAttribute(
      'href',
      'https://sentry.io/',
    );
    expect(
      screen.getByRole('link', { name: /inspect runtime env/i }),
    ).toHaveAttribute('href', '/env-summary');
  });
});
