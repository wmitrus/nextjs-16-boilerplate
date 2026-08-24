import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StepUpProvider, useStepUpFetch } from './StepUpProvider';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function Subject() {
  const stepUpFetch = useStepUpFetch();
  return (
    <button
      type="button"
      onClick={() => {
        void stepUpFetch('/api/admin/users/1', { method: 'PATCH' });
      }}
    >
      Mutate
    </button>
  );
}

function renderSubject() {
  render(
    <StepUpProvider>
      <Subject />
    </StepUpProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('StepUpProvider', () => {
  it('does not prompt when the mutation succeeds', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'ok' }));

    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Mutate' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not prompt for a 403 that is not a step-up refusal', async () => {
    // A plain authorization failure must surface as one. Prompting here would
    // send a user who genuinely lacks permission around a challenge loop.
    fetchMock.mockResolvedValue(
      jsonResponse(403, { status: 'server_error', code: 'FORBIDDEN' }),
    );

    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Mutate' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('prompts, verifies, and replays the original request once', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(403, {
          status: 'server_error',
          code: 'STEP_UP_REQUIRED',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'ok' }));

    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Mutate' }));

    const codeField = await screen.findByLabelText('Authentication code');
    fireEvent.change(codeField, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/step-up');
    // The replay is the original request, unchanged.
    expect(fetchMock.mock.calls[2]).toEqual([
      '/api/admin/users/1',
      { method: 'PATCH' },
    ]);
  });

  it('does not replay when the challenge is cancelled', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { status: 'server_error', code: 'STEP_UP_REQUIRED' }),
    );

    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Mutate' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the prompt open and shows why a code was rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(403, {
          status: 'server_error',
          code: 'STEP_UP_REQUIRED',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          status: 'server_error',
          error: 'That code is not valid',
          code: 'MFA_CODE_INVALID',
        }),
      );

    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Mutate' }));

    const codeField = await screen.findByLabelText('Authentication code');
    fireEvent.change(codeField, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(
      await screen.findByText('That code is not valid'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Authentication code')).toBeInTheDocument();
    // Two calls: the refused mutation and the failed challenge. No replay.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends an un-enrolled admin to enrollment instead of a challenge', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        status: 'server_error',
        code: 'MFA_ENROLLMENT_REQUIRED',
      }),
    );

    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: 'Mutate' }));

    expect(
      await screen.findByRole('link', {
        name: 'Set up two-factor authentication',
      }),
    ).toHaveAttribute('href', '/account/security/mfa?reason=admin');
    expect(screen.queryByLabelText('Authentication code')).toBeNull();
  });
});
