import type * as Sentry from '@sentry/nextjs';

function getHintMessage(hint: Sentry.EventHint): string | undefined {
  const originalException = hint.originalException;
  if (originalException instanceof Error) {
    return originalException.message;
  }

  return undefined;
}

function getEventMessage(event: Sentry.Event): string | undefined {
  const exceptionValue = event.exception?.values?.[0]?.value;
  if (typeof exceptionValue === 'string' && exceptionValue.length > 0) {
    return exceptionValue;
  }

  return event.message;
}

function getEventStack(event: Sentry.Event): string {
  return (
    event.exception?.values
      ?.flatMap(
        (value) =>
          value.stacktrace?.frames?.map((frame) => frame.filename ?? '') ?? [],
      )
      .join('\n') ?? ''
  );
}

export function shouldDropDevClientSentryEvent(
  event: Sentry.Event,
  hint: Sentry.EventHint,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv !== 'development') {
    return false;
  }

  const message = `${getEventMessage(event) ?? ''}\n${getHintMessage(hint) ?? ''}`;
  const stack = getEventStack(event);

  const isNextTurbopackPerfNoise =
    /cannot have a negative time stamp/i.test(message) &&
    /react-server-dom-turbopack/i.test(stack);

  const isPrefetchableWasmAbort =
    /aborted\(\)\. build with -sassertions/i.test(message) &&
    /about:\/prefetchable\/wasm/i.test(stack);

  return isNextTurbopackPerfNoise || isPrefetchableWasmAbort;
}
