import type { z } from 'zod';

/**
 * Flattens a `ZodError` into the `Record<string, string[]>` shape that
 * `createValidationErrorResponse` expects, keyed by the first path segment.
 *
 * Lives here rather than beside one route family because it is a generic
 * Zod-to-envelope adapter: every API surface that validates a body needs it,
 * and a second copy is how two API families drift into two error shapes.
 */
export function getFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors = new Map<string, string[]>();

  for (const issue of error.issues) {
    const [firstPathSegment] = issue.path;
    if (typeof firstPathSegment !== 'string') {
      continue;
    }

    const currentErrors = fieldErrors.get(firstPathSegment) ?? [];
    fieldErrors.set(firstPathSegment, [...currentErrors, issue.message]);
  }

  return Object.fromEntries(fieldErrors);
}
