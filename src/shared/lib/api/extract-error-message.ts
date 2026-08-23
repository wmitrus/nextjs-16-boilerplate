import type { ApiResponse } from '@/shared/types/api-response';

/**
 * Pulls a displayable message out of any response envelope.
 *
 * Exists because the envelope has two error channels -- `server_error`
 * carries `error`, `form_errors` carries `errors` keyed by field -- and a
 * client that only reads `.error` silently shows its generic fallback for
 * every validation failure. That is a quiet, easy mistake for each caller to
 * make separately, so the extraction lives here once.
 *
 * Returns `undefined` when the body carries no message, so the caller keeps
 * ownership of its own fallback wording.
 */
export function extractApiErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const envelope = body as Partial<ApiResponse<unknown>> & {
    error?: unknown;
    errors?: unknown;
  };

  if (typeof envelope.error === 'string' && envelope.error.length > 0) {
    return envelope.error;
  }

  if (typeof envelope.errors === 'object' && envelope.errors !== null) {
    const first = Object.values(envelope.errors as Record<string, unknown>)
      .flatMap((messages) => (Array.isArray(messages) ? messages : []))
      .find((message): message is string => typeof message === 'string');

    return first;
  }

  return undefined;
}
