/**
 * Deterministic parser for the canonical inbox file format (OZI-27).
 *
 * Block shape:
 *   ## <heading>
 *   key: value
 *   key: value
 *
 * Parsing is strict about file-level fatal errors (duplicate canonical IDs,
 * malformed headings, invalid state, missing mandatory fields, ambiguous
 * singleton fields) but tolerant of unknown optional fields, field order,
 * and non-field lines within a block (preserved, never discarded).
 */

import type { InboxBlock, InboxField, ParseError, ParsedInbox } from './types';

const HEADING_RE = /^## (.+?)\s*$/;
const FIELD_RE = /^([A-Za-z_][A-Za-z0-9_]*):\s?(.*)$/;
const CANONICAL_ID_RE = /^INBOX-\d{8}-\d{6}-[0-9a-f]{4}$/;
const VALID_STATES = new Set(['NEW', 'IMPORTED', 'DEFERRED', 'REJECTED']);
const SINGLETON_FIELDS = new Set(['state', 'linear_id', 'created', 'imported']);

export function parseInbox(source: string): ParsedInbox {
  const lines = source.split('\n');
  const blocks: InboxBlock[] = [];
  let offset = 0;
  let preambleEnd = 0;
  let current: { heading: string; start: number; fields: InboxField[] } | null =
    null;

  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length + 1; // + '\n'
    const headingMatch = HEADING_RE.exec(line);

    if (headingMatch) {
      if (current) {
        blocks.push({
          heading: current.heading,
          fields: current.fields,
          start: current.start,
          end: lineStart,
        });
      } else {
        preambleEnd = lineStart;
      }
      current = { heading: headingMatch[1], start: lineStart, fields: [] };
    } else if (current) {
      const fieldMatch = FIELD_RE.exec(line);
      if (fieldMatch) {
        current.fields.push({ key: fieldMatch[1], value: fieldMatch[2] });
      }
      // Non-field, non-blank lines inside a block (free-form notes) are
      // intentionally not extracted as fields, but remain in the source
      // text and are preserved verbatim by the byte-range patch functions.
    }

    offset = lineEnd;
  }

  if (current) {
    blocks.push({
      heading: current.heading,
      fields: current.fields,
      start: current.start,
      end: source.length,
    });
  } else {
    preambleEnd = source.length;
  }

  return {
    preamble: source.slice(0, preambleEnd),
    blocks,
    source,
  };
}

export function fieldValue(block: InboxBlock, key: string): string | undefined {
  // Last occurrence wins for lookup purposes; duplicate detection below
  // still flags duplicates as fatal for singleton fields.
  let found: string | undefined;
  for (const f of block.fields) {
    if (f.key === key) found = f.value;
  }
  return found;
}

/**
 * Validate a parsed inbox and return fatal errors. An empty array means the
 * file is safe to proceed with. Only canonical blocks (heading !== 'NEW')
 * are validated against the strict canonical contract.
 */
export function validateInbox(parsed: ParsedInbox): ParseError[] {
  const errors: ParseError[] = [];
  const seenCanonicalIds = new Set<string>();

  for (const block of parsed.blocks) {
    if (block.heading === 'NEW') continue; // temporary capture form, normalized later

    if (!CANONICAL_ID_RE.test(block.heading)) {
      errors.push({
        code: 'MALFORMED_HEADING',
        message: `Block heading "${block.heading}" is neither "NEW" nor a canonical INBOX-... id.`,
        heading: block.heading,
      });
      continue;
    }

    if (seenCanonicalIds.has(block.heading)) {
      errors.push({
        code: 'DUPLICATE_CANONICAL_ID',
        message: `Canonical Inbox ID "${block.heading}" appears more than once in the file.`,
        heading: block.heading,
      });
    }
    seenCanonicalIds.add(block.heading);

    for (const singleton of SINGLETON_FIELDS) {
      const count = block.fields.filter((f) => f.key === singleton).length;
      if (count > 1) {
        errors.push({
          code: 'DUPLICATE_SINGLETON_FIELD',
          message: `Block "${block.heading}" has ${count} "${singleton}:" lines; only one is allowed.`,
          heading: block.heading,
        });
      }
    }

    const state = fieldValue(block, 'state');
    if (state === undefined) {
      errors.push({
        code: 'MISSING_MANDATORY_FIELD',
        message: `Block "${block.heading}" is missing mandatory field "state".`,
        heading: block.heading,
      });
    } else if (!VALID_STATES.has(state)) {
      errors.push({
        code: 'INVALID_STATE',
        message: `Block "${block.heading}" has invalid state "${state}".`,
        heading: block.heading,
      });
    }

    for (const mandatory of ['created', 'title', 'why']) {
      if (fieldValue(block, mandatory) === undefined) {
        errors.push({
          code: 'MISSING_MANDATORY_FIELD',
          message: `Block "${block.heading}" is missing mandatory field "${mandatory}".`,
          heading: block.heading,
        });
      }
    }
  }

  return errors;
}
