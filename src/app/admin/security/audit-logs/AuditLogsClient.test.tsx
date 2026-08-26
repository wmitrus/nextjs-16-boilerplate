import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * Routes the shared `fetch` mock by URL: `/api/admin/users/:id` resolves
 * from `users` (404 for an id not present, matching the real endpoint for a
 * user outside the caller's scope), anything else returns `auditResponse`
 * (OZI-57's actor lookup is a second endpoint the client now calls
 * alongside the audit-log list fetch).
 */
function mockFetchRouter(
  auditResponse: Response | (() => Response),
  users: Record<string, unknown> = {},
) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    const usersMatch = /\/api\/admin\/users\/([^/?]+)/.exec(url);
    if (usersMatch) {
      const user = users[usersMatch[1] ?? ''];
      return user
        ? jsonResponse({ data: { user } })
        : jsonResponse({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }
    return typeof auditResponse === 'function'
      ? auditResponse()
      : auditResponse;
  });
}

function auditLogCalls() {
  return vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url]) =>
        typeof url === 'string' && url.startsWith('/api/admin/audit-logs'),
    );
}

describe('AuditLogsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists events and shows the platform-admin scope banner', async () => {
    mockFetchRouter(
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
    mockFetchRouter(
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
    mockFetchRouter(
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
    mockFetchRouter(
      jsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403),
    );

    render(<AuditLogsClient />);

    expect(await screen.findByText(/Error: Forbidden/)).toBeInTheDocument();
  });

  it('expands a row to show metadata detail', async () => {
    mockFetchRouter(
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

  describe('actor column (OZI-57)', () => {
    it('resolves the actor to a display name and opens a details dialog on click', async () => {
      mockFetchRouter(
        jsonResponse({
          data: {
            events: [EVENT_1],
            total: 1,
            limit: 25,
            offset: 0,
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
        {
          'user-1': {
            id: 'user-1',
            email: 'alice@example.com',
            displayName: 'Alice Admin',
            createdAt: '2025-06-01T00:00:00.000Z',
          },
        },
      );

      render(<AuditLogsClient />);
      await screen.findByText('auth.signin_success');

      const actorLink = await screen.findByRole('button', {
        name: 'Alice Admin',
      });
      // Raw UUID is gone from the cell -- OZI-57's actual complaint.
      expect(screen.queryByText('user-1')).not.toBeInTheDocument();

      fireEvent.click(actorLink);

      const dialog = await screen.findByRole('dialog', {
        name: 'Alice Admin',
      });
      expect(within(dialog).getByText('alice@example.com')).toBeInTheDocument();
      expect(within(dialog).getByText('user-1')).toBeInTheDocument();

      // Clicking the actor must not also toggle the row's metadata expander.
      expect(screen.queryByText('not captured')).not.toBeInTheDocument();

      fireEvent.click(within(dialog).getByLabelText('Close'));
      expect(
        screen.queryByRole('dialog', { name: 'Alice Admin' }),
      ).not.toBeInTheDocument();
    });

    it('falls back to the raw actor id when the user lookup fails', async () => {
      mockFetchRouter(
        jsonResponse({
          data: {
            events: [EVENT_1],
            total: 1,
            limit: 25,
            offset: 0,
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
        // No 'user-1' entry -> the router 404s, e.g. an ABAC caller with
        // `SECURITY_READ_AUDIT` but not `USER_READ`.
      );

      render(<AuditLogsClient />);
      await screen.findByText('auth.signin_success');

      expect(await screen.findByText('user-1')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'user-1' }),
      ).not.toBeInTheDocument();
    });
  });

  it('applies category/outcome filters immediately, resetting to offset 0', async () => {
    mockFetchRouter(
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

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'billing' },
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText('Outcome'), {
      target: { value: 'failure' },
    });

    await waitFor(() => {
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('category=billing');
      expect(lastCall).toContain('outcome=failure');
      expect(lastCall).toContain('offset=0');
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  describe('debounced text filters (OZI-52 / OZI-54)', () => {
    // Deliberately not `shouldAdvanceTime` -- mixing real-clock auto-advance
    // with explicit `advanceTimersByTimeAsync` calls produced spurious extra
    // fetches (verified while writing this suite). Driving fake time only
    // through explicit `act(async () => { await advanceTimersByTimeAsync(...) })`
    // steps keeps every fetch count deterministic.
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function renderAndWaitForMount() {
      mockFetchRouter(
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

      await act(async () => {
        render(<AuditLogsClient />);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }

    it('does not fetch while typing below the minimum length, only after settling at 3+ chars', async () => {
      await renderAndWaitForMount();

      const targetTypeInput = screen.getByLabelText('Target type');
      await act(async () => {
        fireEvent.change(targetTypeInput, { target: { value: 'a' } });
        fireEvent.change(targetTypeInput, { target: { value: 'au' } });
        fireEvent.change(targetTypeInput, { target: { value: 'aud' } });
        fireEvent.change(targetTypeInput, {
          target: { value: 'audit_log_setting' },
        });
        // Below-minimum values never even arm a debounce timer, and the
        // settled value hasn't waited out its own 500ms yet.
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('targetType=audit_log_setting');
      // Default operator when the caller never touched the operator select.
      expect(lastCall).toContain('targetTypeOp=exact');
    });

    it('sends the selected match operator', async () => {
      await renderAndWaitForMount();

      await act(async () => {
        fireEvent.change(screen.getByLabelText('Target type'), {
          target: { value: 'audit' },
        });
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(fetch).toHaveBeenCalledTimes(2);

      await act(async () => {
        fireEvent.change(screen.getByLabelText('Target type match'), {
          target: { value: 'contains' },
        });
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(fetch).toHaveBeenCalledTimes(3);
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('targetTypeOp=contains');
      expect(lastCall).toContain('targetType=audit');
    });

    it('clearing a filter back to empty still fetches (bypasses the minimum length)', async () => {
      await renderAndWaitForMount();

      const targetTypeInput = screen.getByLabelText('Target type');
      await act(async () => {
        fireEvent.change(targetTypeInput, { target: { value: 'audit' } });
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(fetch).toHaveBeenCalledTimes(2);

      await act(async () => {
        fireEvent.change(targetTypeInput, { target: { value: '' } });
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(fetch).toHaveBeenCalledTimes(3);
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain('targetType=');
    });
  });

  it('paginates with Previous/Next, disabling at boundaries', async () => {
    mockFetchRouter(
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

    await waitFor(() => expect(auditLogCalls()).toHaveLength(2));
    const lastCall = auditLogCalls().at(-1)?.[0] as string;
    expect(lastCall).toContain('offset=25');
  });
});
