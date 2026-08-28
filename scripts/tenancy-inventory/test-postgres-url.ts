/**
 * OZI-79 Phase B2, Codex review round 11: a committed source line
 * containing a complete, parseable `scheme://user:pass@host/db`-shaped
 * literal is itself "credential-shaped" and prohibited by this
 * repository's own invariants (see `resolveRemoteUrl`'s doc comment in
 * `readonly-db-remote.ts`) -- regardless of how obviously synthetic the
 * embedded username/password values are. Round 10 renamed the embedded
 * values to a self-evidently-fake `ozi79-test-only-*` convention; that
 * was not enough, because the *shape* of the committed line, not its
 * content, is what a secret scanner (and this repository's own policy)
 * actually flags.
 *
 * This builds the URL through the platform `URL` API's `username`/
 * `password` setters instead: no line of source text anywhere in this
 * module or its callers ever writes `user:pass@host` as one adjacent,
 * parseable literal -- the credential-bearing string only exists as a
 * runtime value assembled from separately-named, clearly-labeled parts.
 * The resulting URL is byte-for-byte identical to what the old template-
 * literal form produced (verified empirically before converting every
 * call site), so this changes nothing about what is actually tested.
 *
 * Every test fixture in this directory that needs a `postgres://`-shaped
 * URL with a username/password should build it through this function,
 * never through a template literal that assembles the full URI shape
 * directly.
 */
export function buildTestPostgresUrl(parts: {
  readonly username: string;
  readonly password: string;
  readonly host: string;
  readonly port?: string;
  /** Omit only for a fixture that deliberately needs no database path. */
  readonly database?: string;
}): string {
  const url = new URL('postgres://placeholder-host');
  url.hostname = parts.host;
  if (parts.port) {
    url.port = parts.port;
  }
  url.username = parts.username;
  url.password = parts.password;
  if (parts.database) {
    url.pathname = `/${parts.database}`;
  }
  return url.toString();
}
