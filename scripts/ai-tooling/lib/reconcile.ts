/**
 * Core reconciliation orchestration (OZI-28 §Algorithm). Depends only on the
 * `LinearAdapter` interface and plain filesystem paths — fully testable with
 * a fake adapter and a real temp-dir filesystem, no MCP/HTTP details here.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { atomicWriteWithinBase, hashContent } from './atomic-fs';
import type { ReconcileConfig } from './config';
import { fuzzyTitleWarning, resolveDuplicate, sourceMarker } from './duplicate';
import { fieldValue, parseInbox, validateInbox } from './inbox-parser';
import { recordConfirmedMapping } from './ledger';
import { mapPriorityHintToNumber, mapTypeHintToLabels } from './mapping';
import { normalizeNewEntries } from './normalize';
import { patchBlockFields } from './patch';
import { FREE_TEXT_FIELDS, scanForCredentialShapedContent } from './security';
import type {
  DuplicateResolution,
  InboxBlock,
  LinearAdapter,
  ParseError,
  PlanRow,
  ReconciliationPlan,
} from './types';

export class InboxValidationError extends Error {
  constructor(public readonly errors: ParseError[]) {
    super(
      `Inbox file failed validation:\n${errors.map((e) => `- [${e.code}] ${e.message}`).join('\n')}`,
    );
    this.name = 'InboxValidationError';
  }
}

export class ApprovalInvalidatedError extends Error {
  constructor() {
    super(
      'Inbox/Linear state changed since the plan was approved. Re-run dry-run.',
    );
    this.name = 'ApprovalInvalidatedError';
  }
}

function readInbox(config: ReconcileConfig): string {
  if (!existsSync(config.inboxPath)) return '';
  return readFileSync(config.inboxPath, 'utf8');
}

/**
 * Change-detection fingerprint over a block's parsed fields — deliberately
 * NOT the raw `source.slice(block.start, block.end)` text: a sibling block
 * appended/removed elsewhere in the file shifts where "end of this block"
 * falls (start-of-next-heading vs. end-of-file) and changes how much
 * trailing whitespace the slice captures, with no change to this block's
 * own content. Fields are structural and immune to that boundary shift.
 */
function blockContentFingerprint(block: InboxBlock): string {
  return hashContent(JSON.stringify(block.fields));
}

/** Runs the normalization pass and writes it back atomically. Not a Linear mutation — safe in dry-run. */
export function runNormalization(config: ReconcileConfig): {
  changed: boolean;
  assignedIds: string[];
} {
  const source = readInbox(config);
  const result = normalizeNewEntries(source);
  if (result.changed) {
    atomicWriteWithinBase(
      config.inboxPath,
      config.inboxDir,
      result.text,
      'inbox',
    );
  }
  return { changed: result.changed, assignedIds: result.assignedIds };
}

function planFieldsForRow(block: InboxBlock): {
  safe: string[];
  unsafe: string[];
  approvedFields: Record<string, string>;
} {
  const safe: string[] = [];
  const unsafe: string[] = [];
  const approvedFields: Record<string, string> = {};
  for (const key of FREE_TEXT_FIELDS) {
    const value = fieldValue(block, key);
    if (value === undefined) continue;
    if (scanForCredentialShapedContent(value).safe) {
      safe.push(key);
      approvedFields[key] = value;
    } else {
      unsafe.push(key);
    }
  }
  return { safe, unsafe, approvedFields };
}

export async function buildPlan(
  config: ReconcileConfig,
  adapter: LinearAdapter,
): Promise<ReconciliationPlan> {
  const source = readInbox(config);
  const parsed = parseInbox(source);
  const errors = validateInbox(parsed);
  if (errors.length > 0) throw new InboxValidationError(errors);

  const rows: PlanRow[] = [];

  for (const block of parsed.blocks) {
    const state = fieldValue(block, 'state');
    if (state !== 'NEW') continue; // only NEW entries are planned

    const title = fieldValue(block, 'title') ?? '';
    const { safe, unsafe, approvedFields } = planFieldsForRow(block);
    const blockFingerprint = blockContentFingerprint(block);

    if (unsafe.length > 0) {
      rows.push({
        inboxId: block.heading,
        title,
        typeHint: fieldValue(block, 'type'),
        priorityHint: fieldValue(block, 'priority'),
        milestoneHint: fieldValue(block, 'milestone_hint'),
        parentHint: fieldValue(block, 'parent_hint'),
        duplicate: { kind: 'NONE' },
        action: 'MANUAL_REVIEW',
        reason: `Credential-shaped content detected in: ${unsafe.join(', ')}.`,
        fieldsCopied: [],
        fieldsOmitted: [...safe, ...unsafe],
        blockFingerprint,
      });
      continue;
    }

    const duplicate = await resolveDuplicate(
      block.heading,
      config.ledgerPath,
      adapter,
    );
    const { action, reason } = actionForDuplicate(duplicate);
    const exactMatchId =
      duplicate.kind === 'ONE' ? duplicate.linearId : undefined;
    const fuzzyWarning = await fuzzyTitleWarning(
      block.heading,
      title,
      adapter,
      exactMatchId,
    );

    rows.push({
      inboxId: block.heading,
      title,
      typeHint: fieldValue(block, 'type'),
      priorityHint: fieldValue(block, 'priority'),
      milestoneHint: fieldValue(block, 'milestone_hint'),
      parentHint: fieldValue(block, 'parent_hint'),
      duplicate,
      action,
      reason,
      fieldsCopied: safe,
      fieldsOmitted: [],
      fuzzyWarning,
      approvedFields,
      blockFingerprint,
    });
  }

  const fingerprint = fingerprintRows(rows);
  return { rows, fingerprint, generatedAt: new Date().toISOString() };
}

function actionForDuplicate(duplicate: DuplicateResolution): {
  action: PlanRow['action'];
  reason: string;
} {
  switch (duplicate.kind) {
    case 'NONE':
      return {
        action: 'CREATE',
        reason: 'No existing Linear issue found for this Inbox ID.',
      };
    case 'ONE':
      return {
        action: 'LINK_EXISTING',
        reason: `Existing Linear issue ${duplicate.linearId} found via ${duplicate.source}.`,
      };
    case 'AMBIGUOUS':
      return {
        action: 'MANUAL_REVIEW',
        reason: `${duplicate.candidates.length} Linear issues carry this exact Inbox ID: ${duplicate.candidates.join(', ')}.`,
      };
    default:
      return {
        action: 'MANUAL_REVIEW',
        reason: 'Unrecognized duplicate resolution.',
      };
  }
}

/**
 * Approval must be bound to everything `applyRow`/`buildIssueDescription`
 * can act on, not just the fields that decided `action` — otherwise a field
 * that changes between dry-run and apply (why/type/priority/hints, or which
 * exact Linear issue a LINK_EXISTING/AMBIGUOUS row resolves to) leaves the
 * fingerprint unchanged and `applyPlan` silently applies values the operator
 * never saw approved.
 */
export function fingerprintRows(rows: PlanRow[]): string {
  const stable = rows
    .map((r) => {
      const duplicateIdentity =
        r.duplicate.kind === 'ONE'
          ? r.duplicate.linearId
          : r.duplicate.kind === 'AMBIGUOUS'
            ? [...r.duplicate.candidates].sort()
            : null;
      const approvedFields = Object.fromEntries(
        Object.entries(r.approvedFields ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
      return JSON.stringify({
        inboxId: r.inboxId,
        action: r.action,
        duplicateKind: r.duplicate.kind,
        duplicateIdentity,
        title: r.title,
        typeHint: r.typeHint ?? null,
        priorityHint: r.priorityHint ?? null,
        milestoneHint: r.milestoneHint ?? null,
        parentHint: r.parentHint ?? null,
        approvedFields,
      });
    })
    .sort();
  return createHash('sha256').update(stable.join('\n')).digest('hex');
}

export type ApplyResult = {
  created: string[];
  linked: string[];
  manualReview: Array<{ inboxId: string; reason: string }>;
  failed: Array<{ inboxId: string; reason: string }>;
};

/**
 * Apply an approved plan. Re-derives the current plan first and refuses to
 * proceed if its fingerprint no longer matches `approvedFingerprint`
 * (OZI-28 §Dry-run/approval). Each row is then processed independently.
 */
export async function applyPlan(
  config: ReconcileConfig,
  adapter: LinearAdapter,
  approvedFingerprint: string,
): Promise<ApplyResult> {
  const currentPlan = await buildPlan(config, adapter);
  if (currentPlan.fingerprint !== approvedFingerprint) {
    throw new ApprovalInvalidatedError();
  }

  const result: ApplyResult = {
    created: [],
    linked: [],
    manualReview: [],
    failed: [],
  };

  for (const row of currentPlan.rows) {
    if (row.action === 'MANUAL_REVIEW') {
      result.manualReview.push({ inboxId: row.inboxId, reason: row.reason });
      continue;
    }
    if (row.action !== 'CREATE' && row.action !== 'LINK_EXISTING') continue;

    try {
      await applyRow(config, adapter, row);
      if (row.action === 'CREATE') result.created.push(row.inboxId);
      else result.linked.push(row.inboxId);
    } catch (err) {
      result.failed.push({
        inboxId: row.inboxId,
        reason: (err as Error).message,
      });
    }
  }

  return result;
}

async function applyRow(
  config: ReconcileConfig,
  adapter: LinearAdapter,
  row: PlanRow,
): Promise<void> {
  // Fresh, mandatory exact-ID recheck immediately before any mutation
  // (OZI-28 invariant 5) — never reuse the dry-run-time resolution. This
  // checks the ledger fast path first (Case D crash recovery: a confirmed
  // create with a missing write-back resolves here with zero Linear calls),
  // falling back to a fresh Tier-2 verified search only when the ledger has
  // no entry.
  const fresh = await resolveDuplicate(row.inboxId, config.ledgerPath, adapter);
  if (fresh.kind === 'AMBIGUOUS') {
    throw new Error(
      `Ambiguous match at apply time for ${row.inboxId}; stopped for manual review.`,
    );
  }

  let linearId: string;
  let action: 'create' | 'link';

  if (fresh.kind === 'ONE') {
    linearId = fresh.linearId;
    action = 'link';
  } else {
    const description = buildIssueDescription(row);
    const created = await adapter.createIssue({
      title: row.title,
      description,
      labels: mapTypeHintToLabels(row.typeHint),
      priority: mapPriorityHintToNumber(row.priorityHint),
    });
    linearId = created.id;
    action = 'create';
  }

  // Ledger write happens before the inbox write-back (fast-path recovery
  // window closed first — OZI-28 §Crash recovery, Case D).
  recordConfirmedMapping(config.ledgerPath, config.ledgerDir, row.inboxId, {
    linearId,
    action,
    confirmedAt: new Date().toISOString(),
  });

  writeBackImported(config, row.inboxId, linearId, row.blockFingerprint);
}

/**
 * Builds the created issue's description strictly from `row.approvedFields`
 * — the exact, security-scanned values the dry-run's `fieldsCopied` preview
 * already showed the user, never a raw re-read of the inbox field. The real
 * create is therefore 1:1 with what the approved plan displayed.
 */
export function buildIssueDescription(row: PlanRow): string {
  const lines: string[] = [];
  const approvedWhy = row.approvedFields?.why;
  if (approvedWhy) {
    lines.push('## Why', approvedWhy, '');
  }
  lines.push('## Source', sourceMarker(row.inboxId), '');
  return lines.join('\n');
}

/**
 * Re-reads the inbox immediately before writing, locates the block by its
 * immutable ID in the CURRENT content, and patches only that block —
 * never restores a stale whole-file snapshot over a newer (e.g. mobile)
 * edit. Refuses to proceed if the block is missing, no longer NEW, or its
 * content no longer matches `expectedBlockFingerprint` (captured at plan-
 * build time) — the state check alone would miss a title/why/hint edit that
 * lands while the Linear mutation for this row is in flight, which would
 * otherwise mark the edited entry IMPORTED with the older, already-mutated
 * values still sitting in Linear.
 */
function writeBackImported(
  config: ReconcileConfig,
  inboxId: string,
  linearId: string,
  expectedBlockFingerprint: string,
): void {
  const current = readInbox(config);
  const parsed = parseInbox(current);
  const block = parsed.blocks.find((b) => b.heading === inboxId);
  const currentFingerprint = block ? blockContentFingerprint(block) : null;
  if (
    !block ||
    fieldValue(block, 'state') !== 'NEW' ||
    currentFingerprint !== expectedBlockFingerprint
  ) {
    throw new Error(
      `Inbox entry ${inboxId} changed or disappeared before write-back; stopped for manual review.`,
    );
  }
  const patched = patchBlockFields(current, block, {
    state: 'IMPORTED',
    linear_id: linearId,
    imported: new Date().toISOString(),
  });
  atomicWriteWithinBase(config.inboxPath, config.inboxDir, patched, 'inbox');
}

export type ImportedConsistencyIssue = {
  inboxId: string;
  linearId: string;
  reason: string;
};

/**
 * Audit-mode check (OZI-28 Case F): confirms every `state: IMPORTED` entry's
 * `linear_id` still resolves in Linear. Deliberately NOT part of
 * `buildPlan`/`applyPlan` — the routine reconciliation run only ever
 * touches `state: NEW` entries, so this stays a separate, explicitly
 * invoked check rather than an unconditional per-run cost that grows with
 * inbox history. Never auto-heals a mismatch; every issue found here is a
 * consistency error requiring manual review.
 */
export async function verifyImportedEntries(
  config: ReconcileConfig,
  adapter: LinearAdapter,
): Promise<ImportedConsistencyIssue[]> {
  const parsed = parseInbox(readInbox(config));
  const issues: ImportedConsistencyIssue[] = [];

  for (const block of parsed.blocks) {
    if (fieldValue(block, 'state') !== 'IMPORTED') continue;
    const linearId = fieldValue(block, 'linear_id');
    if (!linearId) {
      issues.push({
        inboxId: block.heading,
        linearId: '(missing)',
        reason: 'Entry is IMPORTED but has no linear_id field.',
      });
      continue;
    }
    const found = await adapter.getIssue(linearId);
    if (!found) {
      issues.push({
        inboxId: block.heading,
        linearId,
        reason: `Linear issue ${linearId} could not be found. Do not silently recreate — manual review required.`,
      });
    }
  }

  return issues;
}
