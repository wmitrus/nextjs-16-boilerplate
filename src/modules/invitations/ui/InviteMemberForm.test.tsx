import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InviteMemberForm } from './InviteMemberForm';

describe('InviteMemberForm', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a fallback message when the error response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
      text: vi.fn().mockResolvedValue(''),
    });

    render(<InviteMemberForm roles={[{ id: 'role-1', name: 'Member' }]} />);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Invitation' }));

    await waitFor(() => {
      expect(
        screen.getByText('Request failed: 500 Internal Server Error'),
      ).toBeInTheDocument();
    });
  });
});
