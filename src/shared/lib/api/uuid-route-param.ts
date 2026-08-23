import { z } from 'zod';

/**
 * App Router `context.params` values are untrusted strings. A presence check
 * (`if (!params.id)`) proves only that *a* string arrived, never that it is
 * valid for a Postgres `uuid` column -- and binding a malformed one raises
 * `22P02: invalid input syntax for type uuid` at parameter-binding time,
 * turning caller-controlled input into a 500 and bypassing the route's own
 * 400/404 handling.
 *
 * This is the single place that decision is made, deliberately: SEC-23 was
 * marked fixed while two routes still bound raw params, because the pattern
 * was written as advice to follow per route rather than as a function to
 * call. Advice does not survive the next route; a helper plus the guard test
 * in `uuid-route-param.guard.test.ts` does.
 *
 * See SEC-23 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */

const uuidSchema = z.uuid();

export type UuidRouteParamResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly fieldErrors: Record<string, string[]> };

/**
 * Validates one dynamic route segment as a UUID.
 *
 * Returns a discriminated result rather than throwing, so callers keep their
 * own response shape (`createValidationErrorResponse(result.fieldErrors)`)
 * and cannot accidentally let a rejected value through by ignoring an
 * exception.
 *
 * @param params - the awaited `context.params` object
 * @param name - the segment name, e.g. `'id'`, `'organizationId'`
 */
export function parseUuidRouteParam(
  params: Record<string, string | string[] | undefined>,
  name: string,
): UuidRouteParamResult {
  // `name` is always a literal written by the route author (the dynamic
  // segment's own name), never caller-controlled input, so there is no
  // injection surface here -- and the guard test asserts every route passes
  // a literal.
  // eslint-disable-next-line security/detect-object-injection
  const raw = params[name];

  // A repeated segment arrives as an array; it is never a single UUID, and
  // silently taking the first element would honour a request the route did
  // not define.
  if (typeof raw !== 'string') {
    return { ok: false, fieldErrors: { [name]: [`${name} is required`] } };
  }

  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: { [name]: [`${name} must be a valid UUID`] },
    };
  }

  return { ok: true, value: parsed.data };
}
