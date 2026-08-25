/**
 * Shared types for the inbox-to-Linear reconciliation workflow.
 *
 * Contract source: OZI-27 (canonical inbox format) and OZI-28 (reconciliation
 * contract) in Linear, and the "Linear Task Operating Model" document.
 */

export type EntryState = 'NEW' | 'IMPORTED' | 'DEFERRED' | 'REJECTED';

/** One `key: value` line inside a canonical inbox block. */
export type InboxField = {
  key: string;
  value: string;
};

/** One `## <heading>` block in the inbox file, with its byte range in the source text. */
export type InboxBlock = {
  /** Heading text: `NEW` (temporary capture form) or `INBOX-YYYYMMDD-HHMMSS-xxxx` (canonical). */
  heading: string;
  fields: InboxField[];
  /** Start offset (inclusive) of the `## ` line in the source text. */
  start: number;
  /** End offset (exclusive) — start of the next block's `## ` line, or end of file. */
  end: number;
};

export type ParsedInbox = {
  /** Raw text before the first `## ` heading (preserved verbatim). */
  preamble: string;
  blocks: InboxBlock[];
  /** The exact source text this was parsed from. */
  source: string;
};

/** Fatal, file-level parse errors — the whole file is rejected when any of these fire. */
export type ParseError = {
  code:
    | 'DUPLICATE_CANONICAL_ID'
    | 'MALFORMED_HEADING'
    | 'INVALID_STATE'
    | 'MISSING_MANDATORY_FIELD'
    | 'DUPLICATE_SINGLETON_FIELD';
  message: string;
  heading?: string;
};

export type DuplicateResolution =
  | { kind: 'NONE' }
  | { kind: 'ONE'; linearId: string; source: 'LEDGER' | 'VERIFIED_SEARCH' }
  | { kind: 'AMBIGUOUS'; candidates: string[] };

export type WriteAction =
  | 'CREATE'
  | 'LINK_EXISTING'
  | 'DEFER'
  | 'REJECT'
  | 'MANUAL_REVIEW';

export type PlanRow = {
  inboxId: string;
  title: string;
  typeHint?: string;
  priorityHint?: string;
  milestoneHint?: string;
  parentHint?: string;
  duplicate: DuplicateResolution;
  action: WriteAction;
  reason: string;
  /** Warning-only title-similarity note; never affects `action`. */
  fuzzyWarning?: string;
  /**
   * Field values that passed the security scan, keyed by field name — the
   * exact content the dry-run's `fieldsCopied` preview refers to. `apply`
   * must build the created issue from these values only, never from a raw
   * re-read of the inbox field, so the real create is 1:1 with what the
   * approved plan showed.
   */
  approvedFields?: Record<string, string>;
  /** Fields that will be copied into Linear vs. omitted, for the dry-run security preview. */
  fieldsCopied: string[];
  fieldsOmitted: string[];
};

export type ReconciliationPlan = {
  rows: PlanRow[];
  /** Stable hash over the plan content — approval is bound to this value. */
  fingerprint: string;
  generatedAt: string;
};

/**
 * Boundary between core reconciliation logic and Linear. Core logic never
 * depends on MCP/HTTP details directly — only on this interface, so it is
 * testable with a fake implementation.
 */
export type LinearIssueSummary = {
  id: string;
  title: string;
  description: string;
};

export type CreateIssueInput = {
  title: string;
  description: string;
  labels?: string[];
  priority?: number;
  milestone?: string;
  parentId?: string;
};

export type LinearAdapter = {
  /** Coarse, non-exact pre-filter — callers must verify candidates locally. */
  searchCandidates(query: string): Promise<LinearIssueSummary[]>;
  getIssue(id: string): Promise<LinearIssueSummary | null>;
  createIssue(input: CreateIssueInput): Promise<LinearIssueSummary>;
};

export type LedgerEntry = {
  linearId: string;
  action: 'create' | 'link';
  confirmedAt: string;
};

export type Ledger = Record<string, LedgerEntry>;
