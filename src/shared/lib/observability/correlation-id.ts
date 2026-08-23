/**
 * Canonical correlation / request identifiers (SEC-46).
 *
 * Both `x-correlation-id` and `x-request-id` used to be taken verbatim from
 * the incoming request:
 *
 * ```ts
 * req.headers.get('x-correlation-id') ?? crypto.randomUUID()
 * ```
 *
 * so any caller could put an unbounded, arbitrary-charset string into the
 * response headers, the structured logs and the `audit_events.correlation_id`
 * column -- which is `text`, with no length ceiling of its own.
 *
 * The two identifiers answer different questions and therefore get different
 * trust:
 *
 * - `correlationId` follows a chain of operations across systems. An upstream
 *   value is worth keeping -- that is the whole point of the header -- so a
 *   *syntactically safe* one is accepted and echoed back.
 * - `requestId` names exactly one request inside this application. It is never
 *   taken from a caller; see {@link generateRequestId}.
 *
 * The accepted shape is a bounded ASCII allowlist rather than UUID/ULID only.
 * A correlation id is interoperability metadata, not a credential: requiring a
 * UUID would not establish any trust boundary (an attacker can send a
 * perfectly good random UUID) and would drop legitimate ids from ingresses
 * that use another format, breaking the chain this repository is meant to be
 * portable across.
 */

/** Longest correlation id accepted from a caller. */
export const CORRELATION_ID_MAX_LENGTH = 128;

/**
 * Conservative ASCII allowlist: alphanumerics plus the separators used by the
 * common id formats (UUID's `-`, ULID's bare alphanumerics, dotted and
 * colon-separated trace ids). Deliberately excludes whitespace and control
 * characters -- those are what turn a log line into two.
 *
 * Single character class with one bounded quantifier: no backtracking, so no
 * ReDoS surface on attacker-controlled input.
 */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type CorrelationSource = 'external' | 'generated';

export type CorrelationRejectionReason =
  | 'empty'
  | 'too_long'
  | 'invalid_charset';

export interface ResolvedCorrelationId {
  /** Always safe to log, echo and persist. */
  readonly correlationId: string;
  /** Whether the value came from the caller or was minted here. */
  readonly source: CorrelationSource;
  /**
   * Set only when a header was present and refused. `undefined` for both a
   * missing header (nothing to reject) and an accepted one.
   */
  readonly rejection?: CorrelationRejectionReason;
  /**
   * Length of the refused value. Its *length* is diagnostic; its content is
   * caller-controlled and is deliberately never captured -- copying a rejected
   * value into a log is the same exposure as having accepted it.
   */
  readonly rejectedLength?: number;
}

function classifyRejection(value: string): CorrelationRejectionReason {
  if (value.length === 0) return 'empty';
  if (value.length > CORRELATION_ID_MAX_LENGTH) return 'too_long';
  return 'invalid_charset';
}

/**
 * Resolves the correlation id for a request.
 *
 * A malformed value is **replaced, never truncated**: truncating an oversized
 * or mixed-charset id would keep a caller-chosen prefix and present it
 * downstream as if it had been validated.
 *
 * An absent header is not a rejection -- most callers send nothing.
 */
export function resolveCorrelationId(
  raw: string | null | undefined,
): ResolvedCorrelationId {
  if (raw === null || raw === undefined) {
    return { correlationId: crypto.randomUUID(), source: 'generated' };
  }

  if (CORRELATION_ID_PATTERN.test(raw)) {
    return { correlationId: raw, source: 'external' };
  }

  return {
    correlationId: crypto.randomUUID(),
    source: 'generated',
    rejection: classifyRejection(raw),
    rejectedLength: raw.length,
  };
}

/**
 * The request id is always minted here.
 *
 * A caller-supplied `x-request-id` is ignored outright rather than validated:
 * even a well-formed one lets a caller make two distinct requests share an id,
 * or collide with an id already in the logs. "Which single request was this"
 * is a question only the server can answer.
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Rejections are reported on a curve, not one line each: the header is
 * caller-controlled, so a fixed WARN per rejection hands anyone a log-flooding
 * primitive. The first rejection in an isolate is always reported (an operator
 * misconfiguring a proxy sees it immediately), then every hundredth, each
 * carrying the running total so the volume is still visible.
 */
let rejectionCount = 0;

export interface CorrelationRejectionReport {
  readonly report: boolean;
  readonly total: number;
}

export function recordCorrelationRejection(): CorrelationRejectionReport {
  rejectionCount += 1;
  return {
    report: rejectionCount === 1 || rejectionCount % 100 === 0,
    total: rejectionCount,
  };
}

/** Test seam -- the counter is module state in a long-lived isolate. */
export function resetCorrelationRejectionCounterForTests(): void {
  rejectionCount = 0;
}
