import { act, fireEvent, render, screen } from '@testing-library/react';
// import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ApiClientError } from '@/shared/lib/api/api-client';

import { ErrorAlert } from './ErrorAlert';

describe('ErrorAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders nothing when error is null', () => {
    const { container } = render(<ErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a simple error message', () => {
    render(<ErrorAlert error={new Error('Simple error')} />);
    expect(screen.getByText('Simple error')).toBeInTheDocument();
  });

  it('renders ApiClientError with code and details', () => {
    const apiError = new ApiClientError(
      {
        status: 'form_errors',
        errors: { email: ['is required'], password: ['is too short'] },
      },
      400,
    );
    apiError.code = 'VALIDATION_FAILED';

    render(<ErrorAlert error={apiError} />);

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText('CODE: VALIDATION_FAILED')).toBeInTheDocument();
    expect(screen.getByText('email: is required')).toBeInTheDocument();
    expect(screen.getByText('password: is too short')).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorAlert error="Error" onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: /retry action/i });
    button.click();

    expect(onRetry).toHaveBeenCalled();
  });

  it('copies correlation ID to clipboard', async () => {
    const apiError = new ApiClientError(
      { status: 'server_error', error: 'Fail' },
      500,
      'corr-123',
    );
    render(<ErrorAlert error={apiError} />);

    const copyButton = screen.getByTitle('Copy Correlation ID');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('corr-123');
    expect(screen.getByText('Copied!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
  });

  it('toggles technical details', () => {
    const error = new Error('Technical error');
    error.stack = 'Error stack trace';
    render(<ErrorAlert error={error} />);

    const toggleButton = screen.getByText('Show Technical Details');
    fireEvent.click(toggleButton);

    expect(screen.getByText(/Error stack trace/)).toBeInTheDocument();
    expect(screen.getByText('Hide Details')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Hide Details'));
    expect(screen.queryByText(/Error stack trace/)).not.toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<ErrorAlert error="Error" title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });
});
