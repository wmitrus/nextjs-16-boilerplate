import type { Level, LogEvent } from 'pino';

export type ClientLogSource = 'browser' | 'edge';

export type ClientLogPayload = {
  level: Level;
  message: string;
  context: Record<string, unknown>;
  source: ClientLogSource;
};

const normalizeBindings = (
  bindings: LogEvent['bindings'],
): Record<string, unknown> => {
  if (!bindings) {
    return {};
  }

  if (Array.isArray(bindings)) {
    return bindings.reduce<Record<string, unknown>>((acc, entry) => {
      if (entry && typeof entry === 'object') {
        Object.assign(acc, entry);
      }
      return acc;
    }, {});
  }

  if (typeof bindings === 'object' && bindings !== null) {
    return Object.fromEntries(
      Object.entries(bindings as Record<string, unknown>),
    );
  }

  return {};
};

export function buildClientLogPayload({
  level,
  logEvent,
  source,
  defaultMessage,
}: {
  level: Level;
  logEvent: LogEvent;
  source: ClientLogSource;
  defaultMessage: string;
}): ClientLogPayload {
  const messages = logEvent.messages ?? [];
  const textMessage = messages.find((entry) => typeof entry === 'string') as
    | string
    | undefined;
  const objectMessage = messages.find(
    (entry) => entry && typeof entry === 'object',
  ) as Record<string, unknown> | undefined;
  const bindings = normalizeBindings(logEvent.bindings);

  return {
    level,
    message:
      textMessage ??
      (objectMessage ? JSON.stringify(objectMessage) : defaultMessage),
    context: {
      ...bindings,
      ...(objectMessage ?? {}),
      ...(objectMessage ? { data: objectMessage } : {}),
    },
    source,
  };
}
