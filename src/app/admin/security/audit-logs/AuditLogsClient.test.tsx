import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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

describe('AuditLogsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists events and shows the platform-admin scope banner', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
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
    vi.mocked(fetch).mockImplementation(async () =>
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
    vi.mocked(fetch).mockImplementation(async () =>
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
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403),
    );

    render(<AuditLogsClient />);

    expect(await screen.findByText(/Error: Forbidden/)).toBeInTheDocument();
  });

  it('expands a row to show metadata detail', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
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

  it('applies category/outcome filters immediately, resetting to offset 0', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
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
      vi.mocked(fetch).mockImplementation(async () =>
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
    vi.mocked(fetch).mockImplementation(async () =>
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
