/**
 * Idempotent normalization pass: `## NEW` (temporary capture form) → a
 * canonical `## INBOX-...` block with `state: NEW` + `created:`.
 *
 * Safe to re-run: only blocks whose heading is exactly `NEW` are touched;
 * blocks that already carry a canonical heading are left byte-identical.
 */

import { generateUniqueStableId, isCanonicalId } from './id';
import { parseInbox } from './inbox-parser';
import { patchNormalizeBlock } from './patch';

export type NormalizeResult = {
  text: string;
  changed: boolean;
  assignedIds: string[];
};

export function normalizeNewEntries(
  source: string,
  now: () => Date = () => new Date(),
): NormalizeResult {
  const parsed = parseInbox(source);
  const existingIds = new Set(
    parsed.blocks.map((b) => b.heading).filter(isCanonicalId),
  );
  const batchIds = new Set<string>();
  const assignedIds: string[] = [];

  const newBlocks = parsed.blocks.filter((b) => b.heading === 'NEW');
  if (newBlocks.length === 0) {
    return { text: source, changed: false, assignedIds: [] };
  }

  // Apply in reverse document order so earlier, not-yet-patched blocks'
  // byte offsets remain valid across sequential patches.
  let text = source;
  const orderedByEnd = [...newBlocks].sort((a, b) => b.start - a.start);
  const at = now();

  for (const block of orderedByEnd) {
    const id = generateUniqueStableId(at, existingIds, batchIds);
    batchIds.add(id);
    assignedIds.unshift(id);
    text = patchNormalizeBlock(text, block, id, at.toISOString());
  }

  return { text, changed: true, assignedIds };
}
