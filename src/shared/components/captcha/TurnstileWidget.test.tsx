import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TurnstileWidgetProps } from './TurnstileWidget';

function getScriptElement(): HTMLScriptElement {
  const script = document.getElementById('cf-turnstile-script');
  if (!script) throw new Error('Turnstile script element was not appended');
  return script as HTMLScriptElement;
}

// The component keeps a module-level "script already loading" singleton so
// multiple widget instances on one page share a single <script> tag. Reset
// the module between tests (vi.resetModules() + a fresh dynamic import) so
// each test gets its own singleton instead of inheriting a pending promise
// left behind by a previous test -- same convention as
// auth.test.ts's getAuthorize() helper.
async function renderFreshWidget(props: TurnstileWidgetProps) {
  vi.resetModules();
  const { TurnstileWidget } = await import('./TurnstileWidget');
  return render(<TurnstileWidget {...props} />);
}

describe('TurnstileWidget', () => {
  beforeEach(() => {
    document.getElementById('cf-turnstile-script')?.remove();
    delete window.turnstile;
  });

  afterEach(() => {
    document.getElementById('cf-turnstile-script')?.remove();
    delete window.turnstile;
  });

  it('appends the Turnstile script exactly once', async () => {
    await renderFreshWidget({ siteKey: 'site-key', onVerify: vi.fn() });

    expect(getScriptElement().src).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js',
    );
  });

  it('renders the widget with the given site key once the script loads, and forwards a verified token', async () => {
    const onVerify = vi.fn();
    const renderMock = vi.fn().mockReturnValue('widget-1');
    const removeMock = vi.fn();

    await renderFreshWidget({ siteKey: 'site-key', onVerify });

    window.turnstile = { render: renderMock, remove: removeMock };
    getScriptElement().dispatchEvent(new Event('load'));

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    const [, options] = renderMock.mock.calls[0]!;
    expect(options.sitekey).toBe('site-key');

    options.callback('a-real-token');
    expect(onVerify).toHaveBeenCalledWith('a-real-token');
  });

  it('calls onExpire when the widget reports an expired token', async () => {
    const onExpire = vi.fn();
    const renderMock = vi.fn().mockReturnValue('widget-1');

    await renderFreshWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
      onExpire,
    });

    window.turnstile = { render: renderMock, remove: vi.fn() };
    getScriptElement().dispatchEvent(new Event('load'));

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    const [, options] = renderMock.mock.calls[0]!;
    options['expired-callback']?.();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when the script fails to load', async () => {
    await renderFreshWidget({ siteKey: 'site-key', onVerify: vi.fn() });

    getScriptElement().dispatchEvent(new Event('error'));

    expect(
      await screen.findByText(/security check failed to load/i),
    ).toBeInTheDocument();
  });

  it('removes the widget on unmount', async () => {
    const renderMock = vi.fn().mockReturnValue('widget-1');
    const removeMock = vi.fn();

    const { unmount } = await renderFreshWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
    });

    window.turnstile = { render: renderMock, remove: removeMock };
    getScriptElement().dispatchEvent(new Event('load'));
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));

    unmount();
    expect(removeMock).toHaveBeenCalledWith('widget-1');
  });
});
