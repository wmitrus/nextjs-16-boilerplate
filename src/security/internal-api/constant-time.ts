/**
 * Constant-time secret comparison for the Edge runtime.
 *
 * `crypto.timingSafeEqual` is Node-only and the internal-API guard runs in
 * the Edge proxy (`src/proxy.ts`), so it is unavailable here. Digesting both
 * inputs first is the standard substitute and buys two things: the comparison
 * runs over fixed-width buffers regardless of what the caller sent, so the
 * *length* of a guess leaks nothing either, and the loop below has no early
 * exit, so neither does the position of the first differing byte.
 *
 * A plain `!==` on the raw strings leaks both. That is a weak oracle over
 * HTTP -- network jitter dwarfs the signal -- but it is free to remove, and
 * "hard to exploit" is not a property worth defending. See SEC-44.
 */
export async function constantTimeEquals(
  a: string,
  b: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);

  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);

  // Both are SHA-256, so always 32 bytes; the guard is here so a future
  // change of digest cannot silently turn this into a prefix comparison.
  if (viewA.length !== viewB.length) return false;

  // `.at()` rather than `[i]`: same cost and same lack of an early exit, but
  // it is a method call rather than the dynamic index access this repo's
  // SEC-15/SEC-20 patterns ask code to avoid. The accumulate-then-compare
  // shape is the part that matters -- every byte is read on every call.
  let difference = 0;
  for (const [index, byte] of viewA.entries()) {
    difference |= byte ^ (viewB.at(index) ?? 0);
  }
  return difference === 0;
}

/**
 * Verifies a presented key against the accepted keys, in constant time with
 * respect to which key matched.
 *
 * Every candidate is compared even after one matches: returning early on the
 * current key would make "matched the current key" and "matched the previous
 * key" distinguishable by timing, which during a rotation tells an attacker
 * which half of the window they are in.
 */
export async function verifyAgainstKeys(
  presented: string,
  keys: readonly string[],
): Promise<{ matched: boolean; matchedIndex: number }> {
  let matched = false;
  let matchedIndex = -1;

  for (const [index, key] of keys.entries()) {
    // Sequential on purpose: `Promise.all` would overlap the digests and make
    // total time depend on the slowest, not on a fixed number of comparisons.

    const isMatch = await constantTimeEquals(presented, key);
    if (isMatch && !matched) {
      matched = true;
      matchedIndex = index;
    }
  }

  return { matched, matchedIndex };
}
