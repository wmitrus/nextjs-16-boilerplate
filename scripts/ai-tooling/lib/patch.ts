/**
 * Surgical, byte-range-based edits to inbox source text.
 *
 * These functions never regenerate the whole file from parsed data — they
 * splice small, targeted changes into the original source string so that
 * unrelated blocks, whitespace, and unknown content are byte-preserved
 * (OZI-28 test #20).
 */

import type { InboxBlock } from './types';

/**
 * Set (or add) one or more `key: value` fields within a single block's byte
 * range. Existing `key:` lines are updated in place (first occurrence);
 * fields not yet present are appended just before the block's end.
 */
export function patchBlockFields(
  source: string,
  block: InboxBlock,
  fields: Record<string, string>,
): string {
  let text = source.slice(block.start, block.end);
  const remaining = new Map(Object.entries(fields));

  for (const [key, value] of Array.from(remaining.entries())) {
    const lineRe = new RegExp(`^${escapeRegExp(key)}:.*$`, 'm');
    if (lineRe.test(text)) {
      text = text.replace(lineRe, `${key}: ${value}`);
      remaining.delete(key);
    }
  }

  if (remaining.size > 0) {
    // Insert right after the last non-blank line, ahead of any trailing
    // blank line(s) that separate this block from the next heading, so the
    // appended fields land inside the block visually, not after a gap.
    const trailingBlankMatch = /\n+$/.exec(text);
    const trailingBlank = trailingBlankMatch ? trailingBlankMatch[0] : '';
    const body = trailingBlank ? text.slice(0, -trailingBlank.length) : text;
    const appended = Array.from(remaining.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    text = `${body}\n${appended}${trailingBlank || '\n'}`;
  }

  return source.slice(0, block.start) + text + source.slice(block.end);
}

/**
 * Normalize a temporary `## NEW` heading into a canonical
 * `## INBOX-...` heading, inserting `state:`/`created:` immediately after
 * the heading line, ahead of any existing fields.
 */
export function patchNormalizeBlock(
  source: string,
  block: InboxBlock,
  canonicalId: string,
  createdAt: string,
): string {
  const text = source.slice(block.start, block.end);
  const firstNewline = text.indexOf('\n');
  const headingLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const rest = firstNewline === -1 ? '' : text.slice(firstNewline + 1);
  const newHeadingLine = headingLine.replace(
    /^## NEW\s*$/,
    `## ${canonicalId}`,
  );
  const newText = `${newHeadingLine}\nstate: NEW\ncreated: ${createdAt}\n${rest}`;
  return source.slice(0, block.start) + newText + source.slice(block.end);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
