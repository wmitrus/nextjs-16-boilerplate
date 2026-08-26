import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditLogsClient } from './AuditLogsClient';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PLATFORM_ADMIN_SCOPE = { isPlatformAdmin: true, tenantId: null };
const TENANT_SCOPE = { isPlatformAdmin: false, tenantId: 'acme' };

const EVENT_1 = {
  id: 1,
  occurredAt: '2026-01-02T10:00:00.000Z',
  category: 'auth',
  action: 'auth.signin_success',
  outcome: 'success',
  tenantId: 'acme',
  actorUserId: 'user-1',
  targetType: null,
  targetId: null,
  ip: '1.2.3.4',
  correlationId: 'corr-1',
  metadata: null,
};

const EVENT_2 = {
  id: 2,
  occurredAt: '2026-01-01T09:00:00.000Z',
  category: 'billing',
  action: 'billing.plan_changed',
  outcome: 'failure',
  tenantId: 'acme',
  actorUserId: 'user-2',
  targetType: 'subscription',
  targetId: 'sub-1',
  ip: null,
  correlationId: null,
  metadata: { plan: 'pro' },
};

describe('AuditLogsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists events and shows the platform-admin scope banner', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          events: [EVENT_1, EVENT_2],
          total: 2,
          limit: 25,
          offset: 0,
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditLogsClient />);

    expect(await screen.findByText('auth.signin_success')).toBeInTheDocument();
    expect(screen.getByText('billing.plan_changed')).toBeInTheDocument();
    expect(screen.getByText(/all tenants/i)).toBeInTheDocument();
  });

  it('shows the tenant-scope banner for an ABAC-authorized non-platform-admin', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          events: [EVENT_1],
          total: 1,
          limit: 25,
          offset: 0,
          scope: TENANT_SCOPE,
        },
      }),
    );

    render(<AuditLogsClient />);

    expect(await screen.findByText('auth.signin_success')).toBeInTheDocument();
    expect(screen.getByText(/your tenant/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no matching events', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          events: [],
          total: 0,
          limit: 25,
          offset: 0,
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditLogsClient />);

    expect(
      await screen.findByText('No audit events found for this filter.'),
    ).toBeInTheDocument();
  });

  it('surfaces a fetch error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403),
    );

    render(<AuditLogsClient />);

    expect(await screen.findByText(/Error: Forbidden/)).toBeInTheDocument();
  });

  it('expands a row to show metadata detail', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          events: [EVENT_2],
          total: 1,
          limit: 25,
          offset: 0,
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditLogsClient />);
    const row = await screen.findByText('billing.plan_changed');

    fireEvent.click(row);

    expect(await screen.findByText(/"plan": "pro"/)).toBeInTheDocument();
  });

  it('applies filters from the form on submit, resetting to offset 0', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          events: [],
          total: 0,
          limit: 25,
          offset: 0,
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditLogsClient />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'billing' },
    });
    fireEvent.change(screen.getByLabelText('Outcome'), {
      target: { value: 'failure' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    await waitFor(() => {
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('category=billing');
      expect(lastCall).toContain('outcome=failure');
    });
    const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('offset=0');
  });

  it('does not fetch while typing into a filter field, only on submit', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          events: [],
          total: 0,
          limit: 25,
          offset: 0,
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditLogsClient />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    // Regression for OZI-52: typing progressively into a text filter used to
    // fire one fetch per keystroke, exhausting the shared per-client API
    // rate limit before any search could complete.
    const targetTypeInput = screen.getByLabelText('Target type');
    fireEvent.change(targetTypeInput, { target: { value: 'a' } });
    fireEvent.change(targetTypeInput, { target: { value: 'au' } });
    fireEvent.change(targetTypeInput, { target: { value: 'aud' } });
    fireEvent.change(targetTypeInput, {
      target: { value: 'audit_log_setting' },
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('targetType=audit_log_setting');
  });

  it('paginates with Previous/Next, disabling at boundaries', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          events: [EVENT_1],
          total: 30,
          limit: 25,
          offset: 0,
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditLogsClient />);
    await screen.findByText('auth.signin_success');

    const prevButton = screen.getByRole('button', { name: 'Previous' });
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('offset=25');
  });
});
