import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TurnstileWidgetProps } from './TurnstileWidget';

function getScriptElement(): HTMLScriptElement {
  const script = document.getElementById('cf-turnstile-script');
  if (!script) throw new Error('Turnstile script element was not appended');
  return script as HTMLScriptElement;
}

function makeTurnstileMock() {
  return {
    render: vi.fn().mockReturnValue('widget-1'),
    remove: vi.fn(),
    reset: vi.fn(),
  };
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
  const result = render(<TurnstileWidget {...props} />);
  return {
    ...result,
    rerenderWidget: (nextProps: TurnstileWidgetProps) =>
      result.rerender(<TurnstileWidget {...nextProps} />),
  };
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
    const turnstile = makeTurnstileMock();

    await renderFreshWidget({ siteKey: 'site-key', onVerify });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    const [, options] = turnstile.render.mock.calls[0]!;
    expect(options.sitekey).toBe('site-key');

    options.callback('a-real-token');
    expect(onVerify).toHaveBeenCalledWith('a-real-token');
  });

  it('calls onExpire when the widget reports an expired token', async () => {
    const onExpire = vi.fn();
    const turnstile = makeTurnstileMock();

    await renderFreshWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
      onExpire,
    });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    const [, options] = turnstile.render.mock.calls[0]!;
    options['expired-callback']?.();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  // Regression guard for the solve -> remount -> solve loop: when the render
  // effect depended on the callback props, a parent re-rendering with fresh
  // inline closures (which onVerify's own setState guarantees) tore the
  // widget down and re-rendered it, restarting the challenge forever.
  it('does not remount the widget when the parent passes new callback identities', async () => {
    const turnstile = makeTurnstileMock();

    const { rerenderWidget } = await renderFreshWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
      onExpire: () => undefined,
    });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));

    rerenderWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
      onExpire: () => undefined,
    });
    rerenderWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
      onExpire: () => undefined,
    });

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    expect(turnstile.remove).not.toHaveBeenCalled();
  });

  it('always calls the latest onVerify even though the effect never re-runs', async () => {
    const firstOnVerify = vi.fn();
    const latestOnVerify = vi.fn();
    const turnstile = makeTurnstileMock();

    const { rerenderWidget } = await renderFreshWidget({
      siteKey: 'site-key',
      onVerify: firstOnVerify,
    });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));

    rerenderWidget({ siteKey: 'site-key', onVerify: latestOnVerify });

    const [, options] = turnstile.render.mock.calls[0]!;
    options.callback('token-after-rerender');

    expect(latestOnVerify).toHaveBeenCalledWith('token-after-rerender');
    expect(firstOnVerify).not.toHaveBeenCalled();
  });

  it('resets the widget when resetSignal changes, without re-rendering it', async () => {
    const turnstile = makeTurnstileMock();

    const { rerenderWidget } = await renderFreshWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
      resetSignal: 0,
    });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));

    rerenderWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
      resetSignal: 1,
    });

    await waitFor(() =>
      expect(turnstile.reset).toHaveBeenCalledWith('widget-1'),
    );
    expect(turnstile.render).toHaveBeenCalledTimes(1);
  });

  it("surfaces Cloudflare's error code from error-callback", async () => {
    const turnstile = makeTurnstileMock();

    await renderFreshWidget({ siteKey: 'site-key', onVerify: vi.fn() });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));

    const [, options] = turnstile.render.mock.calls[0]!;
    options['error-callback']?.('110200');

    expect(
      await screen.findByText(/security check failed \(code 110200\)/i),
    ).toBeInTheDocument();
  });

  it('clears a previous error once the challenge is solved', async () => {
    const turnstile = makeTurnstileMock();

    await renderFreshWidget({ siteKey: 'site-key', onVerify: vi.fn() });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));

    const [, options] = turnstile.render.mock.calls[0]!;
    options['error-callback']?.('110600');
    expect(
      await screen.findByText(/security check failed \(code 110600\)/i),
    ).toBeInTheDocument();

    options.callback('recovered-token');
    await waitFor(() =>
      expect(screen.queryByText(/security check failed/i)).toBeNull(),
    );
  });

  it('shows an error message when the script fails to load', async () => {
    await renderFreshWidget({ siteKey: 'site-key', onVerify: vi.fn() });

    getScriptElement().dispatchEvent(new Event('error'));

    expect(
      await screen.findByText(
        /security check failed \(code script-load-failed\)/i,
      ),
    ).toBeInTheDocument();
  });

  it('removes the widget on unmount', async () => {
    const turnstile = makeTurnstileMock();

    const { unmount } = await renderFreshWidget({
      siteKey: 'site-key',
      onVerify: vi.fn(),
    });

    window.turnstile = turnstile;
    getScriptElement().dispatchEvent(new Event('load'));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));

    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
  });
});
