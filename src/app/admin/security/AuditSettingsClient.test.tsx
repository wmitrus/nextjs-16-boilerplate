import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditSettingsClient } from './AuditSettingsClient';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PLATFORM_ADMIN_SCOPE = { isPlatformAdmin: true, tenantId: null };
const TENANT_SCOPE = { isPlatformAdmin: false, tenantId: 'acme' };

const AUTH_SETTING = {
  id: null,
  category: 'auth',
  tenantId: null,
  source: 'taxonomy-default' as const,
  enabled: true,
  retentionDays: 180,
  sampleRate: null,
  captureInputOnSuccess: false,
  updatedByUserId: null,
  updatedAt: null,
};

const WAITLIST_SETTING = {
  id: 'ov-1',
  category: 'waitlist',
  tenantId: null,
  source: 'global' as const,
  enabled: true,
  retentionDays: 45,
  sampleRate: null,
  captureInputOnSuccess: false,
  updatedByUserId: 'admin-1',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AuditSettingsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists categories and shows the platform-admin scope banner', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          settings: [AUTH_SETTING, WAITLIST_SETTING],
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditSettingsClient />);

    expect(await screen.findByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Waitlist')).toBeInTheDocument();
    expect(screen.getByText(/global defaults/i)).toBeInTheDocument();
  });

  it('shows the tenant-scope banner for an ABAC-authorized non-platform-admin', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: { settings: [AUTH_SETTING], scope: TENANT_SCOPE },
      }),
    );

    render(<AuditSettingsClient />);

    expect(await screen.findByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText(/your tenant/i)).toBeInTheDocument();
  });

  it('toggles a category on/off and refetches', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: { settings: [AUTH_SETTING], scope: PLATFORM_ADMIN_SCOPE },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { setting: { ...AUTH_SETTING, enabled: false } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            settings: [{ ...AUTH_SETTING, enabled: false }],
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      );

    render(<AuditSettingsClient />);
    await screen.findByText('Authentication');

    fireEvent.click(screen.getByRole('button', { name: 'On' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/audit-log-settings',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string) as {
      category: string;
      enabled: boolean;
    };
    expect(body).toMatchObject({ category: 'auth', enabled: false });
  });

  it('surfaces a toggle failure instead of silently reverting to On/Off', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: { settings: [AUTH_SETTING], scope: PLATFORM_ADMIN_SCOPE },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403),
      );

    render(<AuditSettingsClient />);
    await screen.findByText('Authentication');

    fireEvent.click(screen.getByRole('button', { name: 'On' }));

    expect(
      await screen.findByRole('button', { name: 'Failed — retry' }),
    ).toBeInTheDocument();
  });

  it('edits retention days and saves', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: { settings: [AUTH_SETTING], scope: PLATFORM_ADMIN_SCOPE },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { setting: { ...AUTH_SETTING, retentionDays: 90 } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            settings: [{ ...AUTH_SETTING, retentionDays: 90 }],
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      );

    render(<AuditSettingsClient />);
    await screen.findByText('Authentication');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Retention days'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/audit-log-settings',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'PATCH');
    const body = JSON.parse(patchCall![1]!.body as string) as {
      retentionDays: number;
    };
    expect(body.retentionDays).toBe(90);
  });

  it('only offers "Reset to default" for a category with a stored override', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          settings: [AUTH_SETTING, WAITLIST_SETTING],
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<AuditSettingsClient />);
    await screen.findByText('Authentication');

    // AUTH_SETTING is a taxonomy-default (no override) -> no reset button.
    // WAITLIST_SETTING is a global override -> reset button present.
    const resetButtons = screen.getAllByRole('button', {
      name: 'Reset to default',
    });
    expect(resetButtons).toHaveLength(1);
  });

  it('resets a category to its default and refetches', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: { settings: [WAITLIST_SETTING], scope: PLATFORM_ADMIN_SCOPE },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { deleted: true } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            settings: [
              { ...WAITLIST_SETTING, source: 'taxonomy-default', id: null },
            ],
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      );

    render(<AuditSettingsClient />);
    await screen.findByText('Waitlist');

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/audit-log-settings',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
