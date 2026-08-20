import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagsClient } from './FeatureFlagsClient';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PLATFORM_ADMIN_SCOPE = { isPlatformAdmin: true, tenantId: null };
const TENANT_SCOPE = { isPlatformAdmin: false, tenantId: 'acme' };

const FLAG = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  key: 'my-flag',
  tenantId: null,
  enabled: true,
  description: 'a flag',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('FeatureFlagsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists flags and shows the active provider on load', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          flags: [FLAG],
          activeProvider: 'db',
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<FeatureFlagsClient />);

    expect(await screen.findByText('my-flag')).toBeInTheDocument();
    expect(screen.getByText('db')).toBeInTheDocument();
  });

  it('disables mutation controls and warns when the active provider is not db', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          flags: [FLAG],
          activeProvider: 'static',
          scope: PLATFORM_ADMIN_SCOPE,
        },
      }),
    );

    render(<FeatureFlagsClient />);

    await screen.findByText('my-flag');
    expect(screen.getByText(/no effect/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create flag' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'On' })).toBeDisabled();
  });

  it('creates a flag and refetches the list on success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { flag: FLAG } }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [FLAG],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      );

    render(<FeatureFlagsClient />);

    await waitFor(() =>
      expect(screen.getByText('No feature flags found.')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Key'), {
      target: { value: 'my-flag' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create flag' }));

    expect(await screen.findByText('my-flag')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/feature-flags',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces the duplicate-flag error message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            status: 'server_error',
            error: 'A feature flag with this key already exists for this scope',
            code: 'DUPLICATE_FEATURE_FLAG',
          },
          409,
        ),
      );

    render(<FeatureFlagsClient />);
    await waitFor(() =>
      expect(screen.getByText('No feature flags found.')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Key'), {
      target: { value: 'dup' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create flag' }));

    expect(
      await screen.findByText(
        'A feature flag with this key already exists for this scope',
      ),
    ).toBeInTheDocument();
  });

  it('toggles a flag and refetches', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [FLAG],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { flag: { ...FLAG, enabled: false } } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [{ ...FLAG, enabled: false }],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      );

    render(<FeatureFlagsClient />);
    await screen.findByText('my-flag');

    fireEvent.click(screen.getByRole('button', { name: 'On' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/admin/feature-flags/${FLAG.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ enabled: false }),
        }),
      ),
    );
  });

  it('surfaces a toggle failure instead of silently reverting to On/Off', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [FLAG],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403),
      );

    render(<FeatureFlagsClient />);
    await screen.findByText('my-flag');

    fireEvent.click(screen.getByRole('button', { name: 'On' }));

    expect(
      await screen.findByRole('button', { name: 'Failed — retry' }),
    ).toBeInTheDocument();
  });

  it('deletes a flag after confirmation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [FLAG],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { deleted: true } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            flags: [],
            activeProvider: 'db',
            scope: PLATFORM_ADMIN_SCOPE,
          },
        }),
      );

    render(<FeatureFlagsClient />);
    await screen.findByText('my-flag');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/admin/feature-flags/${FLAG.id}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  describe('SEC-26 follow-up: ABAC-authorized non-platform-admin scope', () => {
    const ownFlag = {
      ...FLAG,
      id: 'own-flag-id',
      key: 'own-flag',
      tenantId: 'acme',
    };
    const globalFlag = {
      ...FLAG,
      id: 'global-flag-id',
      key: 'global-flag',
      tenantId: null,
    };

    it('marks a global row read-only and disables its mutation controls', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          data: {
            flags: [ownFlag, globalFlag],
            activeProvider: 'db',
            scope: TENANT_SCOPE,
          },
        }),
      );

      render(<FeatureFlagsClient />);
      await screen.findByText('own-flag');
      await screen.findByText('global-flag');

      expect(screen.getByText(/read-only/i)).toBeInTheDocument();

      const toggleButtons = screen.getAllByRole('button', {
        name: /^(On|Off)$/,
      });
      // Own-tenant row's toggle stays enabled; the global row's is disabled.
      expect(toggleButtons.some((btn) => !btn.hasAttribute('disabled'))).toBe(
        true,
      );
      expect(toggleButtons.some((btn) => btn.hasAttribute('disabled'))).toBe(
        true,
      );

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      expect(editButtons.some((btn) => btn.hasAttribute('disabled'))).toBe(
        true,
      );
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      expect(deleteButtons.some((btn) => btn.hasAttribute('disabled'))).toBe(
        true,
      );
    });

    it("locks the create form's Tenant ID field to the caller's own tenant", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          data: { flags: [], activeProvider: 'db', scope: TENANT_SCOPE },
        }),
      );

      render(<FeatureFlagsClient />);
      await waitFor(() =>
        expect(screen.getByText('No feature flags found.')).toBeInTheDocument(),
      );

      const tenantInput = screen.getByLabelText(
        'Tenant ID (your tenant)',
      ) as HTMLInputElement;
      expect(tenantInput).toBeDisabled();
      expect(tenantInput.value).toBe('acme');
    });
  });
});
