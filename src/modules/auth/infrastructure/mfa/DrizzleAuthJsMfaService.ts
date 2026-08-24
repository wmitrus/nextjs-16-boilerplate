import { and, eq, isNull, or, lt, sql } from 'drizzle-orm';

import {
  MfaAlreadyEnrolledError,
  type MfaEnrollmentConfirmation,
  type MfaEnrollmentService,
  type MfaStatus,
  type MfaSubject,
  type MfaVerification,
  type StartedMfaEnrollment,
} from '@/core/contracts/mfa';
import type { DrizzleDb } from '@/core/db/types';
import { resolveServerLogger } from '@/core/logger/di';
import { MissingAppSecurityKeyError } from '@/core/security/app-keys';
import {
  decryptSecret,
  encryptSecret,
  type EnvelopeContext,
} from '@/core/security/envelope-encryption';

import {
  generateRecoveryCodes,
  parseRecoveryCode,
  verifyRecoveryCodeSecret,
} from './recovery-codes';
import {
  buildTotpEnrollmentUri,
  generateTotpSecret,
  normalizeTotpCode,
  verifyTotpCode,
} from './totp';

import {
  userMfaRecoveryCodesTable,
  userMfaTotpTable,
} from '@/modules/auth/infrastructure/drizzle/schema';

/**
 * Application-owned MFA for AuthJS (Credentials) accounts (SEC-48).
 *
 * Owns three things and nothing else: the encrypted TOTP seed, the replay
 * marker, and the recovery-code set. It never asks who the user is allowed to
 * be -- `MfaService` is an authentication-assurance contract, and the moment
 * this class knew about roles it would be answering an authorization question
 * from inside the credentials module.
 */

export const MFA_ENROLLMENT_PATH = '/account/security/mfa';

function getLogger() {
  return resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'authjs-mfa',
  });
}

function envelopeContext(userId: string): EnvelopeContext {
  return {
    purpose: 'authjs-totp-encryption',
    // Binds the ciphertext to the row that holds it: an envelope copied into
    // another user's row fails to authenticate rather than transplanting a
    // working second factor.
    aad: `user_mfa_totp:${userId}`,
  };
}

export class DrizzleAuthJsMfaService implements MfaEnrollmentService {
  readonly enrollmentSurface = 'application' as const;

  constructor(private readonly db: DrizzleDb) {}

  async getStatus(subject: MfaSubject): Promise<MfaStatus> {
    const [row] = await this.db
      .select({ confirmedAt: userMfaTotpTable.confirmedAt })
      .from(userMfaTotpTable)
      .where(eq(userMfaTotpTable.userId, subject.userId))
      .limit(1);

    return {
      // A started-but-unconfirmed enrollment is not a second factor. Treating
      // it as one would let someone open the setup page and gain admin
      // access without ever proving they hold the authenticator.
      enrolled: Boolean(row?.confirmedAt),
      enrollmentSurface: 'application',
      enrollmentUrl: MFA_ENROLLMENT_PATH,
    };
  }

  async verifyChallenge(
    subject: MfaSubject,
    code: string,
  ): Promise<MfaVerification> {
    const [row] = await this.db
      .select({
        secretEnvelope: userMfaTotpTable.secretEnvelope,
        confirmedAt: userMfaTotpTable.confirmedAt,
        lastUsedTimeStep: userMfaTotpTable.lastUsedTimeStep,
      })
      .from(userMfaTotpTable)
      .where(eq(userMfaTotpTable.userId, subject.userId))
      .limit(1);

    if (!row?.confirmedAt) return { ok: false, reason: 'not_enrolled' };

    // Six digits is a TOTP code; anything else can only be a recovery code.
    // Deciding by shape keeps one entry point for the caller (the route
    // handler must not have to ask the user which kind they are typing).
    if (normalizeTotpCode(code)) {
      return this.verifyTotp(subject.userId, row, code);
    }

    return this.consumeRecoveryCode(subject.userId, code);
  }

  private async verifyTotp(
    userId: string,
    row: { secretEnvelope: string; lastUsedTimeStep: number | null },
    code: string,
  ): Promise<MfaVerification> {
    const decrypted = await decryptSecret(
      row.secretEnvelope,
      envelopeContext(userId),
    );

    if (!decrypted.ok) {
      // Key material missing or rotated away: this is an operator problem,
      // and it must never read as "code was wrong" (which would send the user
      // into a retry loop) nor as a pass.
      getLogger().error(
        { event: 'auth:mfa_seed_undecryptable', reason: decrypted.reason },
        'Stored TOTP seed could not be decrypted',
      );
      return { ok: false, reason: 'unavailable' };
    }

    const verification = await verifyTotpCode({
      secret: decrypted.plaintext,
      code,
    });

    if (!verification.valid) return { ok: false, reason: 'invalid_code' };

    // Replay is decided by the statement below and nowhere else.
    //
    // otplib offers an `afterTimeStep` option for this, and it is
    // deliberately not used: it can only compare against the marker this
    // request already read, so it cannot decide the concurrent case, and it
    // collapses "replayed" into the same "invalid" answer as a mistyped
    // digit -- a distinction the audit trail needs, because a correct code
    // presented twice is evidence of interception rather than a typo.

    // Compare-and-set: the freshness predicate lives in the WHERE clause of
    // the statement that stores the marker, so two requests presenting the
    // same code concurrently cannot both win -- and a code whose time step
    // was already spent updates zero rows, which is what `replayed` means
    // here (SEC-35/SEC-41's rule: the check that authorises belongs in the
    // statement that writes).
    const claimed = await this.db
      .update(userMfaTotpTable)
      .set({ lastUsedTimeStep: verification.timeStep, updatedAt: new Date() })
      .where(
        and(
          eq(userMfaTotpTable.userId, userId),
          or(
            isNull(userMfaTotpTable.lastUsedTimeStep),
            lt(userMfaTotpTable.lastUsedTimeStep, verification.timeStep),
          ),
        ),
      )
      // Bare `.returning()`: the two Drizzle drivers this repo supports
      // (postgres-js and pglite) expose incompatible overloads for the
      // projected form, and only the row count is needed here.
      .returning();

    if (claimed.length === 0) return { ok: false, reason: 'replayed' };

    return { ok: true, factor: 'otp' };
  }

  private async consumeRecoveryCode(
    userId: string,
    code: string,
  ): Promise<MfaVerification> {
    const parsed = parseRecoveryCode(code);
    if (!parsed) return { ok: false, reason: 'invalid_code' };

    const [candidate] = await this.db
      .select({ secretHash: userMfaRecoveryCodesTable.secretHash })
      .from(userMfaRecoveryCodesTable)
      .where(
        and(
          eq(userMfaRecoveryCodesTable.userId, userId),
          eq(userMfaRecoveryCodesTable.codeId, parsed.codeId),
          isNull(userMfaRecoveryCodesTable.usedAt),
        ),
      )
      .limit(1);

    // An unknown code id and a wrong secret must be indistinguishable to the
    // caller: both are `invalid_code`.
    if (!candidate) return { ok: false, reason: 'invalid_code' };

    const secretValid = await verifyRecoveryCodeSecret(
      parsed.secret,
      candidate.secretHash,
    );
    if (!secretValid) return { ok: false, reason: 'invalid_code' };

    // The claim carries `used_at IS NULL` itself, so the row is consumed
    // exactly once even if two requests verified the same secret in parallel
    // (SEC-35: the check that authorises must be in the statement that
    // writes).
    const consumed = await this.db
      .update(userMfaRecoveryCodesTable)
      .set({ usedAt: sql`NOW()` })
      .where(
        and(
          eq(userMfaRecoveryCodesTable.userId, userId),
          eq(userMfaRecoveryCodesTable.codeId, parsed.codeId),
          isNull(userMfaRecoveryCodesTable.usedAt),
        ),
      )
      .returning();

    if (consumed.length === 0) return { ok: false, reason: 'replayed' };

    getLogger().warn(
      {
        event: 'auth:mfa_recovery_code_used',
        userId,
        // Never the code, never the id -- a used-code notification is the
        // signal, not the credential material.
      },
      'MFA recovery code consumed',
    );

    return { ok: true, factor: 'recovery' };
  }

  async startEnrollment(
    subject: MfaSubject,
    accountLabel: string,
  ): Promise<StartedMfaEnrollment> {
    const existing = await this.getStatus(subject);
    // Checked here rather than only in the route: a second enrollment path
    // that silently replaced a confirmed factor would undo the step-up
    // requirement on `disable()`.
    if (existing.enrolled) throw new MfaAlreadyEnrolledError();

    const secret = generateTotpSecret();
    const envelope = await encryptSecret(
      secret,
      envelopeContext(subject.userId),
    );

    // An unconfirmed row is replaced wholesale: restarting enrollment must
    // invalidate the previous QR code, not leave two seeds either of which
    // would work.
    await this.db
      .insert(userMfaTotpTable)
      .values({
        userId: subject.userId,
        secretEnvelope: envelope,
        confirmedAt: null,
        lastUsedTimeStep: null,
      })
      .onConflictDoUpdate({
        target: userMfaTotpTable.userId,
        set: {
          secretEnvelope: envelope,
          confirmedAt: null,
          lastUsedTimeStep: null,
          updatedAt: new Date(),
        },
        // Re-enrolling over a *confirmed* factor is a security-relevant
        // change and goes through `disable()` first, which requires step-up.
        // Without this predicate, "start enrollment" would silently replace a
        // working second factor.
        setWhere: isNull(userMfaTotpTable.confirmedAt),
      });

    return {
      secret,
      enrollmentUri: buildTotpEnrollmentUri(secret, accountLabel),
    };
  }

  async confirmEnrollment(
    subject: MfaSubject,
    code: string,
  ): Promise<MfaEnrollmentConfirmation> {
    const [row] = await this.db
      .select({
        secretEnvelope: userMfaTotpTable.secretEnvelope,
        confirmedAt: userMfaTotpTable.confirmedAt,
      })
      .from(userMfaTotpTable)
      .where(eq(userMfaTotpTable.userId, subject.userId))
      .limit(1);

    if (!row) return { ok: false, reason: 'not_enrolled' };
    if (row.confirmedAt) return { ok: false, reason: 'not_enrolled' };

    const decrypted = await decryptSecret(
      row.secretEnvelope,
      envelopeContext(subject.userId),
    );
    if (!decrypted.ok) return { ok: false, reason: 'unavailable' };

    const verification = await verifyTotpCode({
      secret: decrypted.plaintext,
      code,
    });
    if (!verification.valid) return { ok: false, reason: 'invalid_code' };

    const generated = await generateRecoveryCodes();

    await this.db.transaction(async (tx) => {
      await tx
        .update(userMfaTotpTable)
        .set({
          confirmedAt: sql`NOW()`,
          // The confirming code is spent: it must not also satisfy the first
          // real challenge.
          lastUsedTimeStep: verification.timeStep,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userMfaTotpTable.userId, subject.userId),
            isNull(userMfaTotpTable.confirmedAt),
          ),
        );

      await tx
        .delete(userMfaRecoveryCodesTable)
        .where(eq(userMfaRecoveryCodesTable.userId, subject.userId));

      await tx.insert(userMfaRecoveryCodesTable).values(
        generated.records.map((record) => ({
          userId: subject.userId,
          codeId: record.codeId,
          secretHash: record.secretHash,
        })),
      );
    });

    return { ok: true, recoveryCodes: generated.display };
  }

  async disable(subject: MfaSubject): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(userMfaRecoveryCodesTable)
        .where(eq(userMfaRecoveryCodesTable.userId, subject.userId));
      await tx
        .delete(userMfaTotpTable)
        .where(eq(userMfaTotpTable.userId, subject.userId));
    });
  }

  async regenerateRecoveryCodes(
    subject: MfaSubject,
  ): Promise<readonly string[]> {
    const generated = await generateRecoveryCodes();

    await this.db.transaction(async (tx) => {
      // A regeneration invalidates the whole previous set. Appending would
      // leave codes in circulation that the user believes they replaced.
      await tx
        .delete(userMfaRecoveryCodesTable)
        .where(eq(userMfaRecoveryCodesTable.userId, subject.userId));
      await tx.insert(userMfaRecoveryCodesTable).values(
        generated.records.map((record) => ({
          userId: subject.userId,
          codeId: record.codeId,
          secretHash: record.secretHash,
        })),
      );
    });

    return generated.display;
  }
}

export { MfaAlreadyEnrolledError, MissingAppSecurityKeyError };
