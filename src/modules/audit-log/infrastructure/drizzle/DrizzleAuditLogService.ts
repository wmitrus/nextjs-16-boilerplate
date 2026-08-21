import { randomInt } from 'node:crypto';

import type {
  AuditEventInput,
  AuditLogService,
} from '@/core/contracts/audit-log';
import type { DrizzleDb } from '@/core/db';
import { resolveServerLogger } from '@/core/logger/di';

import { isAuditCategory } from '../../domain/category';

import { resolveEffectiveAuditSetting } from './effective-settings';
import { auditEventsTable } from './schema';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'audit',
  module: 'audit-log-service',
});

/** Hard cap on serialized metadata size (bytes) — see plan A.4 item 5. */
const METADATA_MAX_BYTES = 8192;

/**
 * Resolution used to turn a cryptographically-random integer into a uniform
 * float in `[0, 1)` for sampling — six decimal digits is far finer than any
 * configured `sampleRate` (bounded to 2 decimal-ish granularity in the admin
 * UI), so this never biases the sampling decision.
 */
const SAMPLE_RANDOM_RESOLUTION = 1_000_000;

/**
 * A uniform random float in `[0, 1)`, used only to decide whether a
 * `success` event survives sampling. Not a security control (see the
 * comment at the call site), but `Math.random()` is a static-analysis
 * red flag every reviewer/scanner has to re-triage — `crypto.randomInt`
 * is exactly as cheap here and avoids the noise entirely.
 */
function randomUnitInterval(): number {
  return randomInt(0, SAMPLE_RANDOM_RESOLUTION) / SAMPLE_RANDOM_RESOLUTION;
}

function capMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;

  const serialized = JSON.stringify(value);
  // `.length` counts UTF-16 code units, not bytes -- for non-ASCII content
  // (CJK, emoji) that undercounts the real payload size against a cap that
  // is documented and enforced in bytes. Buffer.byteLength measures the
  // actual UTF-8 encoded size (Codex review, PR #72).
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');
  if (sizeBytes <= METADATA_MAX_BYTES) {
    // value is already a plain object/array/primitive from the caller's
    // redaction pass; JSON round-trip guarantees jsonb-storable shape.
    return JSON.parse(serialized) as Record<string, unknown>;
  }

  return {
    truncated: true,
    originalSizeBytes: sizeBytes,
  };
}

/**
 * Real-time, DB-backed implementation of the audit-log write path.
 *
 * Not resilient on its own — always register the DI-bound instance wrapped
 * in `ResilientAuditLogService` (see `../resilient/ResilientAuditLogService.ts`
 * and `../../factory.ts`). This class is safe to unit-test directly against
 * a real (PGlite) DB precisely because it is allowed to throw.
 */
export class DrizzleAuditLogService implements AuditLogService {
  constructor(private readonly db: DrizzleDb) {}

  async record(event: AuditEventInput): Promise<void> {
    if (!isAuditCategory(event.category)) {
      logger.warn(
        { event: 'audit-log:unknown-category', category: event.category },
        'Audit event category is not in the taxonomy; event dropped',
      );
      return;
    }
    const category = event.category;

    const setting = await resolveEffectiveAuditSetting(
      this.db,
      category,
      event.tenantId ?? null,
    );

    if (!setting.enabled) return;

    // Sampling only ever thins out low-value noise -- a 'failure' or
    // 'denied' outcome is never dropped by sampling, regardless of the
    // configured sampleRate, so compliance/security evidence is never
    // silently lost to a rate meant for high-volume success chatter.
    if (
      event.outcome === 'success' &&
      setting.sampleRate !== null &&
      randomUnitInterval() >= setting.sampleRate
    ) {
      return;
    }

    const shouldCaptureMetadata =
      event.outcome !== 'success' || setting.captureInputOnSuccess;
    const metadata = shouldCaptureMetadata ? capMetadata(event.metadata) : null;

    await this.db.insert(auditEventsTable).values({
      category,
      action: event.action,
      outcome: event.outcome,
      tenantId: event.tenantId ?? null,
      actorUserId: event.actorUserId ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ? event.userAgent.slice(0, 512) : null,
      correlationId: event.correlationId ?? null,
      requestId: event.requestId ?? null,
      metadata,
    });
  }
}
