/**
 * Two-tier duplicate detection (OZI-28 §Duplicate detection).
 *
 * Tier 1 (ledger) is a fast path only — never authoritative on its own.
 * Tier 2 (verified search) is the always-available, authoritative safety
 * net: `searchCandidates` is a coarse, non-exact pre-filter (proven
 * empirically against real Linear — a full Inbox ID returned 5 false
 * positives instead of 1), so every candidate is fetched and checked for a
 * literal `Inbox ID: <exact-id>` match before counting as a real hit.
 */

import { lookupLedger, readLedger } from './ledger';
import type { DuplicateResolution, LinearAdapter } from './types';

export function sourceMarker(inboxId: string): string {
  return `Inbox ID: ${inboxId}`;
}

export async function resolveDuplicate(
  inboxId: string,
  ledgerPath: string,
  ledgerDir: string,
  adapter: LinearAdapter,
): Promise<DuplicateResolution> {
  const ledger = readLedger(ledgerPath, ledgerDir);
  const ledgerEntry = lookupLedger(ledger, inboxId);
  if (ledgerEntry) {
    return { kind: 'ONE', linearId: ledgerEntry.linearId, source: 'LEDGER' };
  }

  return verifiedSearch(inboxId, adapter);
}

/**
 * Tier 2 only, independent of ledger state — this is what must run again
 * immediately before any CREATE call (OZI-28 invariant 5).
 */
export async function verifiedSearch(
  inboxId: string,
  adapter: LinearAdapter,
): Promise<DuplicateResolution> {
  const candidates = await adapter.searchCandidates(inboxId);
  const marker = sourceMarker(inboxId);
  const verified = candidates.filter((c) => c.description.includes(marker));

  if (verified.length === 0) return { kind: 'NONE' };
  if (verified.length === 1) {
    return { kind: 'ONE', linearId: verified[0].id, source: 'VERIFIED_SEARCH' };
  }
  return { kind: 'AMBIGUOUS', candidates: verified.map((c) => c.id) };
}

/**
 * Best-effort, warning-only title-similarity check — never a duplicate
 * mechanism, never blocks or auto-merges (OZI-28 §5: "fuzzy/title
 * similarity may be only a warning"). Reuses the same coarse search the
 * exact-ID resolution already performed; only surfaces candidates that are
 * NOT already the exact-ID match, so it never duplicates that signal.
 */
export async function fuzzyTitleWarning(
  inboxId: string,
  title: string,
  adapter: LinearAdapter,
  exactMatchId: string | undefined,
): Promise<string | undefined> {
  const titleWords = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  if (titleWords.length === 0) return undefined;

  const candidates = await adapter.searchCandidates(title);
  const similar = candidates.filter((c) => {
    if (c.id === exactMatchId) return false;
    const candidateTitle = c.title.toLowerCase();
    const overlap = titleWords.filter((w) => candidateTitle.includes(w));
    return overlap.length >= Math.ceil(titleWords.length / 2);
  });

  if (similar.length === 0) return undefined;
  return `Title looks similar to existing issue(s): ${similar.map((c) => c.id).join(', ')}. Not treated as a duplicate — exact Inbox ID match is the only authoritative signal.`;
}
