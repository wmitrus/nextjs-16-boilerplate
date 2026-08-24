import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

import { MfaEnrollmentClient } from './MfaEnrollmentClient';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('MfaEnrollmentClient', () => {
  it('offers setup when nothing is enrolled', () => {
    render(<MfaEnrollmentClient initiallyEnrolled={false} />);

    expect(
      screen.getByRole('button', { name: 'Set up authenticator app' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Remove two-factor authentication',
      }),
    ).toBeNull();
  });

  it('shows the QR and the manual key, then the recovery codes once confirmed', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: 'ok',
          data: {
            secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
            enrollmentUri: 'otpauth://totp/example',
            qrDataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: 'ok',
          data: { recoveryCodes: ['ABCDEF-GHJKMNPQRSTVWXYZ2'] },
        }),
      );

    render(<MfaEnrollmentClient initiallyEnrolled={false} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Set up authenticator app' }),
    );

    expect(
      await screen.findByAltText('Two-factor authentication setup QR code'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText('Enter the 6-digit code to finish'),
      { target: { value: '123456' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText('ABCDEF-GHJKMNPQRSTVWXYZ2'),
    ).toBeInTheDocument();
    expect(screen.getByText(/only time they are shown/i)).toBeInTheDocument();
  });

  it('keeps the pending state and explains a rejected confirmation code', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: 'ok',
          data: {
            secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
            enrollmentUri: 'otpauth://totp/example',
            qrDataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          status: 'server_error',
          error: 'That code is not valid',
          code: 'MFA_CODE_INVALID',
        }),
      );

    render(<MfaEnrollmentClient initiallyEnrolled={false} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Set up authenticator app' }),
    );
    fireEvent.change(
      await screen.findByLabelText('Enter the 6-digit code to finish'),
      { target: { value: '000000' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText('That code is not valid'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Enter the 6-digit code to finish'),
    ).toBeInTheDocument();
  });

  it('offers removal and new recovery codes once enrolled', () => {
    render(<MfaEnrollmentClient initiallyEnrolled />);

    expect(
      screen.getByRole('button', { name: 'Issue new recovery codes' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove two-factor authentication' }),
    ).toBeInTheDocument();
  });

  it('routes removal through the step-up challenge', async () => {
    // Removing a factor lowers assurance, so the server challenges it and
    // this subtree has to be able to answer -- hence its own StepUpProvider.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(403, {
          status: 'server_error',
          code: 'STEP_UP_REQUIRED',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { status: 'ok' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { status: 'ok', data: { disabled: true } }),
      );

    render(<MfaEnrollmentClient initiallyEnrolled />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove two-factor authentication' }),
    );

    fireEvent.change(await screen.findByLabelText('Authentication code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Set up authenticator app' }),
      ).toBeInTheDocument(),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/step-up');
  });
});
