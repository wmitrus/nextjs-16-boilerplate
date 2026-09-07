import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagsClient } from './FeatureFlagsClient';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PLATFORM_ADMIN_SCOPE = { isPlatformAdmin: true, organizationId: null };
const ORG_SCOPE = { isPlatformAdmin: false, organizationId: 'acme-org' };

const FLAG = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  key: 'my-flag',
  tenantId: null,
  organizationId: null,
  enabled: true,
  description: 'a flag',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** A page response for a given flags array — total defaults to the array's
 * own length (an unpaginated single page), overridable for pagination tests. */
function pageResponse(
  flags: unknown[],
  scope: typeof PLATFORM_ADMIN_SCOPE | typeof ORG_SCOPE,
  overrides: { total?: number; offset?: number; activeProvider?: string } = {},
) {
  return jsonResponse({
    data: {
      flags,
      total: overrides.total ?? flags.length,
      offset: overrides.offset ?? 0,
      activeProvider: overrides.activeProvider ?? 'db',
      scope,
    },
  });
}

describe('FeatureFlagsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists flags and shows the active provider on load', async () => {
    vi.mocked(fetch).mockResolvedValue(
      pageResponse([FLAG], PLATFORM_ADMIN_SCOPE),
    );

    render(<FeatureFlagsClient />);

    expect(await screen.findByText('my-flag')).toBeInTheDocument();
    expect(screen.getByText('db')).toBeInTheDocument();
  });

  it('disables mutation controls and warns when the active provider is not db', async () => {
    vi.mocked(fetch).mockResolvedValue(
      pageResponse([FLAG], PLATFORM_ADMIN_SCOPE, { activeProvider: 'static' }),
    );

    render(<FeatureFlagsClient />);

    await screen.findByText('my-flag');
    expect(screen.getByText(/no effect/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create flag' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'On' })).toBeDisabled();
  });

  it('creates a flag and refetches the list on success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(pageResponse([], PLATFORM_ADMIN_SCOPE))
      .mockResolvedValueOnce(jsonResponse({ data: { flag: FLAG } }, 201))
      .mockResolvedValueOnce(pageResponse([FLAG], PLATFORM_ADMIN_SCOPE));

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
      .mockResolvedValueOnce(pageResponse([], PLATFORM_ADMIN_SCOPE))
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
      .mockResolvedValueOnce(pageResponse([FLAG], PLATFORM_ADMIN_SCOPE))
      .mockResolvedValueOnce(
        jsonResponse({ data: { flag: { ...FLAG, enabled: false } } }),
      )
      .mockResolvedValueOnce(
        pageResponse([{ ...FLAG, enabled: false }], PLATFORM_ADMIN_SCOPE),
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
      .mockResolvedValueOnce(pageResponse([FLAG], PLATFORM_ADMIN_SCOPE))
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
      .mockResolvedValueOnce(pageResponse([FLAG], PLATFORM_ADMIN_SCOPE))
      .mockResolvedValueOnce(jsonResponse({ data: { deleted: true } }))
      .mockResolvedValueOnce(pageResponse([], PLATFORM_ADMIN_SCOPE));

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

  describe('pagination', () => {
    const manyFlags = Array.from({ length: 25 }, (_, i) => ({
      ...FLAG,
      id: `flag-${i}`,
      key: `flag-${i}`,
    }));

    it('requests limit=25 (PAGE_SIZE) and offset=0 on initial load', async () => {
      vi.mocked(fetch).mockResolvedValue(
        pageResponse(manyFlags, PLATFORM_ADMIN_SCOPE, { total: 60 }),
      );

      render(<FeatureFlagsClient />);
      await screen.findByText('flag-0');

      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/feature-flags?limit=25&offset=0',
      );
    });

    it('shows "Showing X–Y of Z" and enables Next when more pages exist', async () => {
      vi.mocked(fetch).mockResolvedValue(
        pageResponse(manyFlags, PLATFORM_ADMIN_SCOPE, { total: 60 }),
      );

      render(<FeatureFlagsClient />);
      await screen.findByText('flag-0');

      expect(screen.getByText('Showing 1–25 of 60')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    });

    it('Next advances offset by PAGE_SIZE and refetches', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          pageResponse(manyFlags, PLATFORM_ADMIN_SCOPE, { total: 60 }),
        )
        .mockResolvedValueOnce(
          pageResponse(manyFlags, PLATFORM_ADMIN_SCOPE, {
            total: 60,
            offset: 25,
          }),
        );

      render(<FeatureFlagsClient />);
      await screen.findByText('flag-0');

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/feature-flags?limit=25&offset=25',
        ),
      );
      expect(
        await screen.findByText('Showing 26–50 of 60'),
      ).toBeInTheDocument();
    });

    it('Next is disabled when the current page already covers the total', async () => {
      // Next's disabled check is `offset(0, client-tracked) + flags.length
      // >= total` -- a single page whose flags already cover `total` starts
      // disabled with no navigation needed.
      const tenFlags = manyFlags.slice(0, 10);
      vi.mocked(fetch).mockResolvedValue(
        pageResponse(tenFlags, PLATFORM_ADMIN_SCOPE, { total: 10 }),
      );

      render(<FeatureFlagsClient />);
      await screen.findByText('flag-0');
      expect(screen.getByText('Showing 1–10 of 10')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    it('Next then Previous returns to offset 0 (round trip)', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          pageResponse(manyFlags, PLATFORM_ADMIN_SCOPE, { total: 35 }),
        )
        .mockResolvedValueOnce(
          pageResponse(manyFlags.slice(0, 10), PLATFORM_ADMIN_SCOPE, {
            total: 35,
            offset: 25,
          }),
        )
        .mockResolvedValueOnce(
          pageResponse(manyFlags, PLATFORM_ADMIN_SCOPE, { total: 35 }),
        );

      render(<FeatureFlagsClient />);
      await screen.findByText('flag-0');

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/feature-flags?limit=25&offset=25',
        ),
      );
      await screen.findByText('Showing 26–35 of 35');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          '/api/admin/feature-flags?limit=25&offset=0',
        ),
      );
      await screen.findByText('Showing 1–25 of 35');
    });
  });

  describe('SEC-26 follow-up: ABAC-authorized non-platform-admin scope', () => {
    const ownFlag = {
      ...FLAG,
      id: 'own-flag-id',
      key: 'own-flag',
      organizationId: 'acme-org',
    };
    const globalFlag = {
      ...FLAG,
      id: 'global-flag-id',
      key: 'global-flag',
      organizationId: null,
    };

    it('marks a global row read-only and disables its mutation controls', async () => {
      vi.mocked(fetch).mockResolvedValue(
        pageResponse([ownFlag, globalFlag], ORG_SCOPE),
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

    it("locks the create form's Organization ID field to the caller's own organization", async () => {
      vi.mocked(fetch).mockResolvedValue(pageResponse([], ORG_SCOPE));

      render(<FeatureFlagsClient />);
      await waitFor(() =>
        expect(screen.getByText('No feature flags found.')).toBeInTheDocument(),
      );

      const orgInput = screen.getByLabelText(
        'Organization ID (your organization)',
      ) as HTMLInputElement;
      expect(orgInput).toBeDisabled();
      expect(orgInput.value).toBe('acme-org');
    });
  });
});
