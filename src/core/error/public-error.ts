/**
 * An error whose message was written **for the end user** and is therefore
 * safe to return to a client verbatim.
 *
 * Exposure is an authoring decision, expressed by choosing this class --
 * never a property anyone can set on an arbitrary `Error`, and never a
 * substring match on someone else's exception text. A `.includes(...)`
 * allowlist is exactly the pattern this replaces (see SEC-37): it inverts
 * the safe default, so every message nobody thought to filter leaks, and it
 * silently starts leaking again the day a library rewords its errors.
 *
 * Everything that is *not* a `PublicError` is treated as internal: the
 * client gets a generic message plus a correlation id, and the full detail
 * goes to the server log under that same id.
 */
export class PublicError extends Error {
  /**
   * Discriminant, checked by `isPublicError`. Present so the guard keeps
   * working across module/realm boundaries where `instanceof` can fail
   * (bundler duplication, a rethrow across a serialization boundary).
   */
  readonly exposeToClient = true as const;

  readonly code: string;

  constructor(message: string, code = 'PUBLIC_ERROR') {
    super(message);
    this.name = 'PublicError';
    this.code = code;
  }
}

export function isPublicError(error: unknown): error is PublicError {
  return (
    error instanceof PublicError ||
    (typeof error === 'object' &&
      error !== null &&
      'exposeToClient' in error &&
      (error as { exposeToClient?: unknown }).exposeToClient === true)
  );
}
