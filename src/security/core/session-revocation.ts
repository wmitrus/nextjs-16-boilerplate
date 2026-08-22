/**
 * A stateless JWT cannot be withdrawn once minted, so "revoking" one means
 * refusing to honour it. `users.sessions_valid_from` is that refusal marker:
 * any session issued strictly before it is rejected, which is what turns a
 * completed password reset into an immediate logout of every other device
 * instead of a 30-day wait for the token to expire on its own.
 *
 * Deliberately fail-closed on a missing `iat`: the marker is only ever set
 * by an AuthJS-only flow (password reset 404s under any other provider), so
 * a user who has one and presents a session with no issue time is presenting
 * something we cannot age-check -- and an unverifiable session must not win.
 * Providers that revoke server-side (Clerk) never set the marker, so this
 * check stays inert for them.
 *
 * Compared in whole seconds because `iat` is stamped in seconds; a session
 * minted in the same second as the reset is treated as still valid, which is
 * the benign direction (the resetting user's own new session must survive).
 *
 * See SEC-36 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
 */
export function isSessionRevoked(
  sessionsValidFrom: Date | null | undefined,
  sessionIssuedAtSeconds: number | undefined,
): boolean {
  if (!sessionsValidFrom) {
    return false;
  }

  if (typeof sessionIssuedAtSeconds !== 'number') {
    return true;
  }

  const revokedBeforeSeconds = Math.floor(sessionsValidFrom.getTime() / 1000);
  return sessionIssuedAtSeconds < revokedBeforeSeconds;
}
